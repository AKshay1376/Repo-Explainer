"""Offline tests for durable local metadata, migrations, privacy, and API boundaries."""

import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from flask import Flask

from persistence import PersistenceService
from persistence.api import create_blueprint
from persistence.migrations import SCHEMA_VERSION


SHA_A = "a" * 40
SHA_B = "b" * 40


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "local" / "repo-explainer.db"
        self.service = PersistenceService(self.path)

    def project(self):
        return self.service.save_project("https://github.com/Owner/Repo", repo_sha=SHA_A)

    def test_fresh_upgrade_idempotent_and_restart(self):
        first = self.project()
        self.assertGreaterEqual(self.service.open_project(first["id"])["last_opened_at"], first["last_opened_at"])
        with closing(sqlite3.connect(self.path)) as connection:
            self.assertEqual(connection.execute("SELECT version FROM schema_version").fetchone()[0], SCHEMA_VERSION)
            connection.execute("UPDATE schema_version SET version=1")
            connection.execute("DROP INDEX ix_projects_repo")
            connection.commit()
        restarted = PersistenceService(self.path)
        self.assertEqual(restarted.get_project(first["id"])["repo_url"], "https://github.com/owner/repo")
        self.assertEqual(restarted.list_projects()[0]["id"], first["id"])
        with closing(sqlite3.connect(self.path)) as connection:
            self.assertEqual(connection.execute("SELECT version FROM schema_version").fetchone()[0], SCHEMA_VERSION)

    def test_project_duplicate_favorite_archive_relink_delete(self):
        first = self.project()
        self.assertFalse(self.project()["created"])
        self.assertEqual(len(self.service.list_projects()), 1)
        another = self.service.save_project("owner/repo", allow_duplicate=True)
        self.assertNotEqual(first["id"], another["id"])
        self.service.update_project(first["id"], {"favorite": True, "local_path": "C:/moved/repo", "archived": True})
        self.assertEqual(self.service.get_project(first["id"])["local_path"], "C:/moved/repo")
        self.assertEqual(len(self.service.list_projects(archived=True)), 1)
        self.service.update_project(first["id"], {"archived": False})
        with self.assertRaises(ValueError):
            self.service.delete_project(first["id"])
        self.assertTrue(self.service.delete_project(first["id"], confirm=True)["deleted"])
        self.assertTrue(Path(self.temp.name).exists())

    def test_session_sha_and_no_patch_resume(self):
        project = self.project()
        self.service.save_session({"project_id": project["id"], "repo_sha": SHA_A, "active_view": "patch",
                                   "selected_file": "src/app.py", "source_start": 3, "source_end": 7})
        restored = PersistenceService(self.path).session(SHA_B)
        self.assertTrue(restored["revision_changed"])
        self.assertEqual(restored["selected_file"], "src/app.py")
        self.assertNotIn("patch_bytes", restored)
        with self.assertRaises(ValueError):
            self.service.save_session({"project_id": project["id"], "selected_file": ".env"})

    def test_snapshots_compare_retention_and_search(self):
        project = self.project()
        self.service.save_settings({"analysis_limit": 10})
        ids = [self.service.add_analysis(project["id"], "project_health", repo_sha=SHA_A,
            summary=f"Health {score}", metrics={"health_score": score})["id"] for score in range(65, 77)]
        self.assertEqual(len(self.service.analyses(project["id"])), 10)
        self.assertEqual(self.service.compare(project["id"], ids[-2], ids[-1])["changes"]["health_score"]["delta"], 1)
        self.assertEqual(len(self.service.list_projects(query="Repo")), 1)
        self.assertEqual(self.service.list_projects(query="%' OR 1=1 --"), [])
        with self.assertRaises(ValueError):
            self.service.add_analysis(project["id"], "humanize", metrics={"source": "private"})

    def test_saved_document_bookmark_recent_and_privacy(self):
        project = self.project()
        doc = self.service.save_document(project["id"], {"type": "API", "title": "Routes", "repo_revision": SHA_A},
                                         "# Routes\nAPI_KEY=hidden-secret\n")
        self.assertNotIn("hidden-secret", self.service.document(project["id"], doc["id"])["content"])
        self.assertNotIn(b"hidden-secret", self.path.read_bytes())
        duplicate = self.service.duplicate_document(project["id"], doc["id"])
        self.assertNotEqual(duplicate["id"], doc["id"])
        self.service.delete_document(project["id"], duplicate["id"])
        self.service.bookmark(project["id"], "file", "src/app.py", "App")
        self.service.add_recent(project["id"], "file", "src/app.py")
        self.assertEqual(self.service.get_project(project["id"])["recent_files"][0]["target"], "src/app.py")
        with self.assertRaises(ValueError):
            self.service.bookmark(project["id"], "file", ".env", "Secret")

    def test_patch_validator_metadata_and_concurrent_requests(self):
        project = self.project()
        def add(index):
            self.service.bookmark(project["id"], "file", f"src/file{index}.py", f"File {index}")
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(add, range(12)))
        self.assertEqual(len(self.service.bookmarks(project["id"])), 12)
        self.service.record_patch(project["id"], {"id": "patch-1", "files": ["src/app.py"],
            "status": "applied", "risk_level": "LOW", "validation": {"state": "PASSED"}}, SHA_A)
        self.service.record_validation(project["id"], {"id": "profile", "repo_id": "repo-bound", "root": "C:/repo"}, "PASSED")
        self.assertEqual(self.service.patches(project["id"])[0]["status"], "applied")
        self.assertEqual(self.service.get_project(project["id"])["validation"]["status"], "PASSED")

    def test_export_import_and_transaction_rollback(self):
        project = self.project()
        self.service.bookmark(project["id"], "file", "src/app.py", "App")
        self.service.add_analysis(project["id"], "project_health", metrics={"health_score": 73})
        self.service.save_document(project["id"], {"type": "API", "title": "Routes", "repo_revision": SHA_A}, "# Routes")
        self.service.record_patch(project["id"], {"id": "patch-export", "files": ["src/app.py"], "status": "applied",
            "risk_level": "LOW", "validation": {"state": "PASSED"}}, SHA_A)
        self.service.record_validation(project["id"], {"id": "profile", "repo_id": "repo-bound", "root": "C:/repo"}, "PASSED")
        exported = self.service.export_data()
        self.assertNotIn("source_cache", json.dumps(exported))
        imported = PersistenceService(Path(self.temp.name) / "imported.db")
        self.assertEqual(imported.import_data(exported)["imported_projects"], 1)
        saved = imported.list_projects()[0]
        self.assertEqual(len(imported.documents(saved["id"])), 1)
        self.assertEqual(len(imported.bookmarks(saved["id"])), 1)
        self.assertEqual(len(imported.analyses(saved["id"])), 1)
        self.assertEqual(imported.patches(saved["id"])[0]["status"], "imported_reference")
        self.assertEqual(imported.get_project(saved["id"])["validation"]["status"], "IMPORTED_REFERENCE")
        bad = {**exported, "bookmarks": [{**exported["bookmarks"][0], "target": ".env"}]}
        empty = PersistenceService(Path(self.temp.name) / "rollback.db")
        with self.assertRaises(ValueError):
            empty.import_data(bad)
        self.assertEqual(empty.list_projects(), [])

    def test_loopback_api_and_origin_guard(self):
        app = Flask(__name__)
        app.register_blueprint(create_blueprint(self.service))
        client = app.test_client()
        created = client.post("/api/projects", json={"repo_url": "owner/repo"})
        self.assertEqual(created.status_code, 201)
        project_id = created.json["project"]["id"]
        self.assertEqual(client.get(f"/api/projects/{project_id}").status_code, 200)
        self.assertEqual(client.put("/api/session", json={"project_id": project_id, "active_view": "health"}).status_code, 200)
        self.assertEqual(client.get("/api/session").json["session"]["project_id"], project_id)
        self.assertEqual(client.post("/api/bookmarks", json={"project_id": project_id, "type": "file", "target": "app.py", "label": "App"}).status_code, 201)
        self.assertEqual(client.get("/api/projects", headers={"Origin": "https://evil.example"}).status_code, 403)
        self.assertNotIn("Access-Control-Allow-Origin", client.get("/api/projects").headers)
        self.assertEqual(client.delete(f"/api/projects/{project_id}", json={}).status_code, 400)

    def test_document_save_requires_generated_matching_repository(self):
        from documentation import DocumentationService
        generated_service = DocumentationService()
        model = {"metadata": {"owner": "owner", "repo": "repo", "latest_commit_sha": SHA_A},
                 "files": {"app.py": {"path": "app.py", "category": "backend"}},
                 "technologies": [], "symbols": [], "dependencies": [], "entry_points": []}
        generated = generated_service.generate("PROJECT_OVERVIEW", model)
        project = self.project()
        app = Flask(__name__)
        app.register_blueprint(create_blueprint(self.service))
        with patch("web_app.default_documentation_service", generated_service):
            response = app.test_client().post(f"/api/projects/{project['id']}/documents",
                json={"document_id": generated["id"], "format": "markdown"})
        self.assertEqual(response.status_code, 201)
        self.assertIn("FACT", response.json["document"]["content"])
        other = self.service.save_project("other/repo")
        with patch("web_app.default_documentation_service", generated_service):
            denied = app.test_client().post(f"/api/projects/{other['id']}/documents",
                json={"document_id": generated["id"], "format": "markdown"})
        self.assertEqual(denied.status_code, 400)

    def test_corrupt_db_returns_service_error_without_deletion(self):
        self.path.parent.mkdir(parents=True)
        self.path.write_bytes(b"not a sqlite database")
        app = Flask(__name__)
        app.register_blueprint(create_blueprint(self.service))
        response = app.test_client().get("/api/projects")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(self.path.read_bytes(), b"not a sqlite database")


if __name__ == "__main__":
    unittest.main()
