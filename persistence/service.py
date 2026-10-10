"""Local durable state API. Recomputable models and source bytes stay in cache."""

import json
import sqlite3

from security import is_sensitive_file

from .database import Database
from . import analyses, documents, preferences, projects, repositories, sessions
from .models import identifier, now, row, safe_path, sha, text

BOOKMARK_TYPES = {"file", "symbol", "route", "model", "commit", "document_section"}


class PersistenceService:
    def __init__(self, path=None):
        self.db = Database(path)

    def _project(self, connection, project_id):
        project = projects.get(connection, project_id)
        if not project:
            raise ValueError("Project not found.")
        return project

    def _activity(self, connection, project_id, kind, label, reference_id=None):
        connection.execute("INSERT INTO activity(id,project_id,type,label,reference_id,created_at) VALUES (?,?,?,?,?,?)",
                           (identifier(), project_id, kind, text(label, 300), reference_id, now()))
        limit = preferences.get(connection)["activity_limit"]
        connection.execute("""DELETE FROM activity WHERE id IN
            (SELECT id FROM activity WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)""",
            (project_id, limit))

    def save_project(self, repo_url, *, name=None, description="", local_path=None, branch=None,
                     repo_sha=None, allow_duplicate=False):
        with self.db.connection(write=True) as connection:
            repository = repositories.save(connection, repo_url, local_path=local_path,
                                           default_branch=branch, repo_sha=repo_sha)
            project, created = projects.create(connection, repository, name=name, description=description,
                                                branch=branch, repo_sha=repo_sha, allow_duplicate=allow_duplicate)
            if not created and (branch or repo_sha):
                project = projects.update(connection, project["id"], {"current_branch": branch or project["current_branch"],
                                                                   "current_sha": repo_sha or project["current_sha"]})
            if created:
                self._activity(connection, project["id"], "project", "Project saved")
            return {**project, "created": created}

    def list_projects(self, *, archived=False, query="", limit=50):
        if not isinstance(query, str) or len(query) > 100 or not isinstance(limit, int) or limit < 1 or limit > 100:
            raise ValueError("Invalid project search.")
        with self.db.connection() as connection:
            return projects.list_projects(connection, archived=archived, query=query, limit=limit)

    def get_project(self, project_id):
        with self.db.connection() as connection:
            project = self._project(connection, project_id)
            project["sha_changed"] = bool(project["current_sha"] and project["last_known_sha"] and
                                          project["current_sha"] != project["last_known_sha"])
            project["recent_activity"] = self._list_activity(connection, project_id, 20)
            project["recent_files"] = sessions.list_recent(connection, project_id, 15)
            project["documents"] = documents.list_documents(connection, project_id, 20)
            project["bookmarks"] = self._list_bookmarks(connection, project_id, 30)
            project["recent_patches"] = self._list_patches(connection, project_id, 10)
            project["saved_plans"] = [{**dict(item), "steps": json.loads(item["steps_json"])} for item in
                connection.execute("SELECT * FROM saved_plans WHERE project_id=? ORDER BY created_at DESC LIMIT 10",
                                   (project_id,)).fetchall()]
            project["validation"] = row(connection.execute("SELECT * FROM validation_records WHERE project_id=? AND status NOT LIKE 'TRUST_METADATA:%' ORDER BY created_at DESC LIMIT 1",
                                                    (project_id,)).fetchone())
            return project

    def find_project(self, repo_url):
        from .models import canonical_repo
        canonical, _, _ = canonical_repo(repo_url)
        with self.db.connection() as connection:
            item = connection.execute("""SELECT p.id FROM projects p JOIN saved_repositories r
                ON p.saved_repository_id=r.id WHERE r.canonical_url=? AND p.archived=0
                ORDER BY p.created_at LIMIT 1""", (canonical,)).fetchone()
            return projects.get(connection, item["id"]) if item else None

    def open_project(self, project_id):
        with self.db.connection(write=True) as connection:
            project = self._project(connection, project_id)
            stamp = now()
            connection.execute("UPDATE saved_repositories SET last_opened_at=?,updated_at=? WHERE id=?",
                               (stamp, stamp, project["saved_repository_id"]))
            return projects.get(connection, project_id)

    def update_project(self, project_id, changes):
        if not isinstance(changes, dict) or any(key not in {"name", "description", "current_branch", "current_sha",
                                                    "favorite", "archived", "local_path"} for key in changes):
            raise ValueError("Unsupported project update.")
        with self.db.connection(write=True) as connection:
            updated = projects.update(connection, project_id, changes)
            self._activity(connection, project_id, "project", "Project archived" if changes.get("archived") else "Project updated")
            return updated

    def delete_project(self, project_id, *, confirm=False):
        if confirm is not True:
            raise ValueError("Confirm deleting saved project data. The repository on disk is never deleted.")
        with self.db.connection(write=True) as connection:
            projects.delete(connection, project_id)
            return {"deleted": True, "repository_deleted_from_disk": False}

    def add_analysis(self, project_id, analysis_type, **kwargs):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            record = analyses.record(connection, project_id, analysis_type,
                                      limit=preferences.get(connection)["analysis_limit"], **kwargs)
            self._activity(connection, project_id, "analysis", f"{analysis_type.replace('_', ' ').title()} analyzed", record["id"])
            return record

    def analyses(self, project_id, limit=50):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return analyses.list_snapshots(connection, project_id, min(max(int(limit), 1), 100))

    def compare(self, project_id, first, second):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return analyses.compare(connection, project_id, first, second)

    def save_document(self, project_id, generated, content, format="markdown"):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            item = documents.save(connection, project_id, generated["type"], generated["title"],
                                  generated.get("repo_revision"), format, content)
            self._activity(connection, project_id, "document", f"Saved {item['title']}", item["id"])
            return item

    def documents(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return documents.list_documents(connection, project_id)

    def document(self, project_id, document_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            item = documents.get(connection, document_id)
            if not item or item["project_id"] != project_id:
                raise ValueError("Saved document not found in this project.")
            return item

    def duplicate_document(self, project_id, document_id):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            item = documents.duplicate(connection, project_id, document_id)
            self._activity(connection, project_id, "document", f"Duplicated {item['title']}", item["id"])
            return item

    def delete_document(self, project_id, document_id):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            documents.delete(connection, project_id, document_id)
            self._activity(connection, project_id, "document", "Deleted saved document")

    def bookmark(self, project_id, kind, target, label):
        if kind not in BOOKMARK_TYPES:
            raise ValueError("Unsupported bookmark type.")
        target = safe_path(target) if kind == "file" else text(target, 300)
        if not target or is_sensitive_file(target):
            raise ValueError("Sensitive bookmark target.")
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            bookmark_id = identifier()
            connection.execute("""INSERT INTO bookmarks(id,project_id,type,target,label,created_at)
                VALUES (?,?,?,?,?,?) ON CONFLICT(project_id,type,target) DO UPDATE SET label=excluded.label""",
                (bookmark_id, project_id, kind, target, text(label, 200), now()))
            return row(connection.execute("SELECT * FROM bookmarks WHERE project_id=? AND type=? AND target=?",
                                          (project_id, kind, target)).fetchone())

    def _list_bookmarks(self, connection, project_id, limit):
        return [dict(item) for item in connection.execute("SELECT * FROM bookmarks WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
                                                   (project_id, limit)).fetchall()]

    def bookmarks(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return self._list_bookmarks(connection, project_id, 100)

    def delete_bookmark(self, bookmark_id):
        with self.db.connection(write=True) as connection:
            result = connection.execute("DELETE FROM bookmarks WHERE id=?", (bookmark_id,))
            if result.rowcount == 0:
                raise ValueError("Bookmark not found.")

    def add_recent(self, project_id, kind, target, view=None):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            sessions.recent(connection, project_id, kind, target, view)
            return sessions.list_recent(connection, project_id)

    def recent(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return sessions.list_recent(connection, project_id)

    def session(self, current_sha=None):
        with self.db.connection() as connection:
            return sessions.get(connection, current_sha)

    def save_session(self, data):
        with self.db.connection(write=True) as connection:
            return sessions.save(connection, data)

    def settings(self):
        with self.db.connection() as connection:
            return preferences.get(connection)

    def save_settings(self, data):
        with self.db.connection(write=True) as connection:
            return preferences.update(connection, data)

    def profile(self):
        with self.db.connection(write=True) as connection:
            return preferences.profile(connection)

    def save_profile(self, display_name):
        with self.db.connection(write=True) as connection:
            return preferences.update_profile(connection, display_name)

    def _list_activity(self, connection, project_id, limit):
        return [dict(item) for item in connection.execute("SELECT * FROM activity WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?",
                                                   (project_id, limit)).fetchall()]

    def activity(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return self._list_activity(connection, project_id, 100)

    def _list_patches(self, connection, project_id, limit):
        return [dict(item) for item in connection.execute("SELECT * FROM patch_records WHERE project_id=? ORDER BY created_at DESC LIMIT ?",
                                                   (project_id, limit)).fetchall()]

    def patches(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            return self._list_patches(connection, project_id, 100)

    def record_patch(self, project_id, patch, repo_sha=None):
        # The Patch Engine remains authoritative for rollback bytes and hash validation.
        files = [safe_path(path) for path in patch.get("files", []) if isinstance(path, str) and not is_sensitive_file(path)][:30]
        status = text(patch.get("status"), 50)
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            connection.execute("""INSERT INTO patch_records
                (id,project_id,repo_sha,status,risk,files_json,created_at,applied_at,rolled_back_at,validation_json)
                VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,
                applied_at=excluded.applied_at,rolled_back_at=excluded.rolled_back_at,
                validation_json=excluded.validation_json""",
                (text(patch.get("id"), 80), project_id, sha(repo_sha), status,
                 text(patch.get("risk_level"), 40), json.dumps(files), text(patch.get("created_at"), 100) or now(),
                 now() if status == "applied" else None, now() if "rolled_back" in status else None,
                 json.dumps({"state": text((patch.get("validation") or {}).get("state"), 50)})))
            connection.execute("""DELETE FROM patch_records WHERE id IN (SELECT id FROM patch_records
                WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 200)""", (project_id,))
            self._activity(connection, project_id, "patch", f"Patch {status}", patch.get("id"))

    def record_validation(self, project_id, profile, state):
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            connection.execute("""INSERT INTO validation_records
                (id,project_id,profile_id,repo_id,root,status,created_at) VALUES (?,?,?,?,?,?,?)""",
                (identifier(), project_id, text(profile.get("id"), 100), text(profile.get("repo_id"), 100),
                 text(profile.get("root"), 500), text(state, 50), now()))
            connection.execute("""DELETE FROM validation_records WHERE id IN (SELECT id FROM validation_records
                WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)""",
                (project_id, preferences.get(connection)["validation_limit"]))
            self._activity(connection, project_id, "validation", f"Validation {state}")

    def save_plan(self, project_id, plan):
        steps = plan.get("steps") or []
        if not isinstance(steps, list) or len(steps) > 30:
            raise ValueError("Refactor plan is too large.")
        safe_steps = [{"order": step.get("order"), "title": text(step.get("title"), 200),
                       "description": text(step.get("description"), 500)} for step in steps if isinstance(step, dict)]
        with self.db.connection(write=True) as connection:
            self._project(connection, project_id)
            plan_id = identifier()
            connection.execute("INSERT INTO saved_plans(id,project_id,repo_sha,scope,risk,steps_json,created_at) VALUES (?,?,?,?,?,?,?)",
                               (plan_id, project_id, sha(plan.get("repo_sha")), text(plan.get("target"), 300),
                                text(plan.get("risk_level"), 50), json.dumps(safe_steps), now()))
            self._activity(connection, project_id, "refactor", "Refactor plan saved", plan_id)
            return {"id": plan_id, "steps": safe_steps}

    def plans(self, project_id):
        with self.db.connection() as connection:
            self._project(connection, project_id)
            result = [dict(item) for item in connection.execute("SELECT * FROM saved_plans WHERE project_id=? ORDER BY created_at DESC LIMIT 50",
                                                                (project_id,)).fetchall()]
            for item in result:
                item["steps"] = json.loads(item.pop("steps_json"))
            return result

    def storage(self):
        with self.db.connection() as connection:
            counts = {table: connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
                      for table in ("projects", "analysis_snapshots", "generated_documents", "activity", "bookmarks")}
            return {"size_bytes": self.db.size_bytes(), "counts": counts}

    def export_data(self):
        with self.db.connection(write=True) as connection:
            caps = {"projects": 200, "generated_documents": 500, "bookmarks": 1000,
                    "analysis_snapshots": 1000, "recent_items": 1000, "saved_plans": 500,
                    "patch_records": 500, "validation_records": 500}
            if any(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0] > cap
                   for table, cap in caps.items()):
                raise ValueError("Local data exceeds the single-file export limit; no incomplete export was created.")
            return {"schema_version": 1, "profile": preferences.profile(connection),
                    "settings": preferences.get(connection),
                    "projects": projects.list_projects(connection, archived=False, limit=200) +
                                projects.list_projects(connection, archived=True, limit=200),
                    "documents": [dict(item) for item in connection.execute("SELECT * FROM generated_documents LIMIT 500")],
                    "bookmarks": [dict(item) for item in connection.execute("SELECT * FROM bookmarks LIMIT 1000")],
                    "analyses": [dict(item) for item in connection.execute("SELECT * FROM analysis_snapshots LIMIT 1000")],
                    "recent": [dict(item) for item in connection.execute("SELECT * FROM recent_items LIMIT 1000")],
                    "plans": [dict(item) for item in connection.execute("SELECT * FROM saved_plans LIMIT 500")],
                    "patches": [dict(item) for item in connection.execute("SELECT * FROM patch_records LIMIT 500")],
                    "validations": [dict(item) for item in connection.execute("SELECT * FROM validation_records LIMIT 500")],
                    "exported_at": now()}

    def import_data(self, data):
        if not isinstance(data, dict) or data.get("schema_version") != 1 or any(key not in
                {"schema_version", "profile", "settings", "projects", "documents", "bookmarks", "analyses",
                 "recent", "plans", "patches", "validations", "exported_at"}
                for key in data):
            raise ValueError("Unsupported local data export.")
        if any(not isinstance(data.get(key, []), list) or len(data.get(key, [])) > limit for key, limit in
               (("projects", 200), ("documents", 500), ("bookmarks", 1000), ("analyses", 1000),
                ("recent", 1000), ("plans", 500), ("patches", 500), ("validations", 500))):
            raise ValueError("Local data export exceeds import limits.")
        if len(json.dumps(data)) > 10_000_000:
            raise ValueError("Local data export is too large.")
        for key in ("projects", "documents", "bookmarks", "analyses", "recent", "plans", "patches", "validations"):
            if any(not isinstance(item, dict) for item in data.get(key, [])):
                raise ValueError(f"Invalid {key} record in local data export.")
        project_ids = [item.get("id") for item in data.get("projects", [])]
        if any(not isinstance(value, str) or not value for value in project_ids) or len(set(project_ids)) != len(project_ids):
            raise ValueError("Local data export has invalid project identities.")
        ids = set(project_ids)
        if any(item.get("project_id") not in ids for key in
                ("documents", "bookmarks", "analyses", "recent", "plans", "patches", "validations")
                for item in data.get(key, [])):
            raise ValueError("Local data export has missing project references.")
        with self.db.connection(write=True) as connection:
            id_map = {}
            for item in data.get("projects", []):
                if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
                    raise ValueError("Invalid imported project.")
                repository = repositories.save(connection, item.get("repo_url"), local_path=item.get("local_path"),
                                               repo_sha=item.get("current_sha"))
                project, created = projects.create(connection, repository, name=item.get("name"),
                                             description=item.get("description", ""), branch=item.get("current_branch"),
                                             repo_sha=item.get("current_sha"))
                id_map[item.get("id")] = project["id"]
                if created and item.get("archived"):
                    projects.update(connection, project["id"], {"archived": True})
            for item in data.get("documents", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    documents.save(connection, project_id, item.get("type"), item.get("title"), item.get("repo_sha"),
                                   item.get("format"), item.get("content"))
            for item in data.get("bookmarks", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id and item.get("type") in BOOKMARK_TYPES:
                    target = safe_path(item.get("target")) if item["type"] == "file" else text(item.get("target"), 300)
                    connection.execute("INSERT OR IGNORE INTO bookmarks(id,project_id,type,target,label,created_at) VALUES (?,?,?,?,?,?)",
                                       (identifier(), project_id, item["type"], target, text(item.get("label"), 200), now()))
            for item in data.get("analyses", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    metrics = json.loads(item.get("metrics_json", "{}"))
                    analyses.record(connection, project_id, item.get("analysis_type"), repo_sha=item.get("repo_sha"),
                                    summary=item.get("summary", ""), status=item.get("status", "complete"),
                                    metrics=metrics, limit=preferences.get(connection)["analysis_limit"])
            for item in data.get("recent", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    sessions.recent(connection, project_id, item.get("type"), item.get("target"), item.get("view"))
            for item in data.get("plans", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    steps = json.loads(item.get("steps_json", "[]"))
                    if not isinstance(steps, list) or len(steps) > 30:
                        raise ValueError("Imported plan is invalid.")
                    clean_steps = [{"order": step.get("order"), "title": text(step.get("title"), 200),
                                    "description": text(step.get("description"), 500)} for step in steps if isinstance(step, dict)]
                    connection.execute("INSERT INTO saved_plans(id,project_id,repo_sha,scope,risk,steps_json,created_at) VALUES (?,?,?,?,?,?,?)",
                        (identifier(), project_id, sha(item.get("repo_sha")), text(item.get("scope"), 300),
                         text(item.get("risk"), 50), json.dumps(clean_steps), now()))
            for item in data.get("patches", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    paths = json.loads(item.get("files_json", "[]"))
                    if not isinstance(paths, list) or len(paths) > 30:
                        raise ValueError("Imported patch metadata is invalid.")
                    clean_paths = [safe_path(path) for path in paths]
                    connection.execute("""INSERT OR IGNORE INTO patch_records
                        (id,project_id,repo_sha,status,risk,files_json,created_at,validation_json)
                        VALUES (?,?,?,?,?,?,?,?)""", (text(item.get("id"), 80), project_id, sha(item.get("repo_sha")),
                        "imported_reference", text(item.get("risk"), 50), json.dumps(clean_paths), now(),
                        json.dumps({"state": "NOT_RUN", "note": "Revalidate in original repository"})))
            for item in data.get("validations", []):
                project_id = id_map.get(item.get("project_id")) if isinstance(item, dict) else None
                if project_id:
                    connection.execute("""INSERT INTO validation_records
                        (id,project_id,profile_id,repo_id,root,status,created_at) VALUES (?,?,?,?,?,?,?)""",
                        (identifier(), project_id, text(item.get("profile_id"), 100),
                         text(item.get("repo_id"), 100), text(item.get("root"), 500), "IMPORTED_REFERENCE", now()))
            # Imported references never grant validator trust or access to Patch Engine rollback bytes.
            imported_profile = data.get("profile")
            if isinstance(imported_profile, dict) and imported_profile.get("display_name"):
                preferences.update_profile(connection, imported_profile["display_name"])
            if isinstance(data.get("settings"), dict):
                preferences.update(connection, data["settings"])
            return {"imported_projects": len(id_map)}
