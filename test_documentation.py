"""Offline, source-backed documentation generation and export tests."""

import json
import os
import unittest
from unittest.mock import patch, Mock

from cache_manager import clear_cache, set_cached_repository_model, set_cached_file_contents
from documentation import DocumentationService
from documentation.models import TYPES
from web_app import app


MODEL = {
    "metadata": {"owner": "owner", "repo": "repo", "description": "A sample service", "latest_commit_sha": "a" * 40,
                 "languages": ["Python"], "default_branch": "main"},
    "files": {
        "app.py": {"path": "app.py", "category": "backend-route", "language": "Python", "exports": ["login"],
                   "dependencies": ["models.py"], "dependents": [], "env_vars": ["DATABASE_URL"]},
        "models.py": {"path": "models.py", "category": "model", "language": "Python", "exports": ["User"],
                      "dependencies": [], "dependents": ["app.py"]},
        "README.md": {"path": "README.md", "category": "documentation", "language": "Markdown"},
        ".env": {"path": ".env", "category": "config", "purpose": "SECRET=private-value"},
    },
    "technologies": [{"name": "Flask", "category": "backend", "confidence": "high"}],
    "symbols": [{"name": "login", "type": "function", "file": "app.py", "line": 12},
                {"name": "User", "type": "class", "file": "models.py", "line": 4}],
    "dependencies": [{"source": "app.py", "target": "models.py", "type": "imports"}],
    "entry_points": [{"path": "app.py", "type": "web-backend"}],
    "api_routes": [{"method": "POST", "path": "/login", "file": "app.py", "handler": "login", "framework": "flask"}],
    "database_models": [{"name": "User", "file": "models.py", "framework": "sqlalchemy",
                         "fields": [{"name": "id", "type": "Integer"}], "relationships": []}],
    "architecture_layers": {"backend": ["app.py", "models.py"]}, "warnings": [],
}


class DocumentationTests(unittest.TestCase):
    def setUp(self):
        clear_cache()
        set_cached_repository_model("owner", "repo", MODEL)
        set_cached_file_contents("owner", "repo", {"README.md": "# Existing\n", ".env": "TOKEN=never-return-me"})
        self.service = DocumentationService()

    def test_all_types_generate_without_ai_or_secret_values(self):
        for kind in TYPES:
            result = self.service.generate(kind, MODEL, scope="app.py" if kind == "MODULE" else None)
            self.assertTrue(result["success"], kind)
            self.assertEqual(result["llm_calls"], 0)
            self.assertTrue(result["sections"])
            self.assertNotIn("private-value", json.dumps(result))
            self.assertNotIn("never-return-me", json.dumps(result))
            self.assertTrue(all(ref["file"] != ".env" for ref in result["citations"]))

    def test_grounded_route_model_module_flow_and_fact_labels(self):
        api = self.service.generate("API", MODEL)
        self.assertIn("POST /login", api["sections"][0]["title"])
        self.assertIn("unknown", api["sections"][0]["unknowns"][0].lower())
        self.assertEqual(api["sections"][0]["citations"][0]["start_line"], 12)
        module = self.service.generate("MODULE", MODEL, scope="app.py")
        self.assertTrue(any("login" in fact for part in module["sections"] for fact in part["facts"]))
        data = self.service.generate("DATA_MODELS", MODEL)
        self.assertTrue(any("Field id" in fact for fact in data["sections"][0]["facts"]))
        flow = {"flows": [{"title": "Login flow", "steps": [
            {"file": "app.py", "label": "login", "line": 12, "is_inferred": False},
            {"file": "models.py", "label": "User", "line": 4, "is_inferred": True}]}]}
        doc = self.service.generate("EXECUTION_FLOW", MODEL, context={"trace": flow})
        self.assertEqual(len(doc["sections"][0]["facts"]), 1)
        self.assertEqual(len(doc["sections"][0]["inferences"]), 1)
        self.assertIn("flowchart LR", doc["sections"][0]["diagram"])

    def test_cache_revision_and_exports_escape_html(self):
        first = self.service.generate("PROJECT_OVERVIEW", MODEL)
        self.assertTrue(self.service.generate("PROJECT_OVERVIEW", MODEL)["cached"])
        modified = {**MODEL, "metadata": {**MODEL["metadata"], "latest_commit_sha": "b" * 40}}
        self.assertFalse(self.service.generate("PROJECT_OVERVIEW", modified)["cached"])
        markdown, _, _ = self.service.export(first, "markdown")
        self.assertIn("**FACT:**", markdown)
        html, _, _ = self.service.export(first, "html")
        self.assertIn("<nav", html)
        self.assertNotIn("<script", html)
        self.assertIn("https://github.com/owner/repo/blob/", html)
        with self.assertRaises(ValueError):
            self.service.generate("MODULE", MODEL, scope=".env")
        stable = self.service.generate("CHANGE_SUMMARY", MODEL, context={"history": {"commits": [], "cached": False}})
        cached = self.service.generate("CHANGE_SUMMARY", MODEL, context={"history": {"commits": [], "cached": True}})
        self.assertEqual(stable["id"], cached["id"])
        self.assertTrue(cached["cached"])
        injected = {**MODEL, "metadata": {**MODEL["metadata"], "description": "<script>alert(1)</script>"}}
        escaped = self.service.generate("PROJECT_OVERVIEW", injected)
        html, _, _ = self.service.export(escaped, "html")
        self.assertNotIn("<script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_change_summary_health_and_endpoints(self):
        history = {"commits": [{"short_sha": "aaaaaaa", "subject": "Add login", "files_changed": 1,
                                "insertions": 2, "deletions": 0}]}
        change = self.service.generate("CHANGE_SUMMARY", MODEL, context={"history": history})
        self.assertIn("Add login", change["sections"][0]["facts"][0])
        debt = self.service.generate("TECH_DEBT", MODEL, context={"health": {"top_issues": [
            {"severity": "LOW", "title": "Review login", "summary": "Repeated changes", "file": "app.py", "start_line": 12}]}})
        self.assertTrue(debt["sections"][0]["citations"])
        client = app.test_client()
        with patch("web_app.analyze_repository", side_effect=AssertionError("No live analysis")):
            response = client.post("/api/docs/generate", json={"repo_url": "owner/repo", "type": "API"})
        self.assertEqual(response.status_code, 200)
        identifier = response.json["id"]
        for format in ("markdown", "html"):
            exported = client.post("/api/docs/export", json={"repo_url": "owner/repo", "document_id": identifier, "format": format})
            self.assertEqual(exported.status_code, 200)
            self.assertIn("attachment", exported.headers["Content-Disposition"])
        readme = client.post("/api/docs/readme", json={"repo_url": "owner/repo"})
        self.assertEqual(readme.status_code, 200)
        self.assertEqual(readme.json["current_readme"], "# Existing\n")
        self.assertTrue(readme.json["draft_markdown"].startswith("# "))
        self.assertEqual(client.get("/api/docs/types").json["types"], list(TYPES))
        denied = client.post("/api/docs/ai-polish", json={"repo_url": "owner/repo", "document_id": identifier})
        self.assertEqual(denied.status_code, 400)

    def test_explicit_ai_polish_is_preview_only(self):
        client = app.test_client()
        document = client.post("/api/docs/generate", json={"repo_url": "owner/repo", "type": "API"}).json
        fake = Mock()
        fake.chat.completions.create.return_value.choices = [Mock(message=Mock(content="FACT: POST /login"))]
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only-key"}), patch("openai.OpenAI", return_value=fake):
            result = client.post("/api/docs/ai-polish", json={"repo_url": "owner/repo", "document_id": document["id"],
                "section_id": document["sections"][0]["id"], "confirm_ai": True})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json["preview_only"])
        self.assertEqual(result.json["citations"], document["sections"][0]["citations"])
        self.assertEqual(result.json["llm_calls"], 1)

    def test_change_range_accepts_only_existing_local_tags(self):
        fake = Mock()
        fake.timeline.return_value = {"commits": []}
        fake.evolution.return_value = {"checkpoints": []}
        fake.compare.return_value = {"before": "a" * 40, "after": "b" * 40, "files": [],
                                     "files_changed": 2, "insertions": 5, "deletions": 1}
        fake.git.text.side_effect = lambda *args: "v1\nv2\n" if args[:2] == ("tag", "--list") else ("a" * 40 if "v1" in str(args) else "b" * 40)
        fake.git.require_commit.side_effect = lambda value: value
        fake.git.run.return_value = b""
        client = app.test_client()
        with patch("web_app._history_context", return_value=(fake, "owner", "repo", MODEL)):
            result = client.post("/api/docs/generate", json={"repo_url": "owner/repo", "type": "CHANGE_SUMMARY",
                "options": {"period": "range", "before": "v1", "after": "v2"}})
            invalid = client.post("/api/docs/generate", json={"repo_url": "owner/repo", "type": "CHANGE_SUMMARY",
                "options": {"period": "range", "before": "--exec=bad", "after": "v2"}})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(any(part["id"] == "comparison" for part in result.json["sections"]))
        self.assertEqual(invalid.status_code, 400)


if __name__ == "__main__":
    unittest.main()
