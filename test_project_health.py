"""Project Health uses cached evidence only and never returns source secrets."""

import json
import unittest
from unittest.mock import patch

from cache_manager import clear_cache, set_cached_file_contents, set_cached_repository_model
from project_health import ProjectHealthService
from security import is_sensitive_file
from web_app import app


MODEL = {
    "metadata": {"owner": "owner", "repo": "repo", "latest_commit_sha": "health-sha"},
    "files": {
        "a.py": {"size": 200, "category": "service"},
        "b.py": {"size": 200, "category": "service"},
        ".env.production": {"size": 40, "category": "config"},
    },
    "dependencies": [
        {"source": "a.py", "target": "b.py", "type": "imports", "confidence": 1, "evidence": "import b"},
        {"source": "b.py", "target": "a.py", "type": "imports", "confidence": 1, "evidence": "import a"},
    ],
    "entry_points": [], "api_routes": [], "database_models": [],
    "symbols": [], "architecture_layers": {}, "warnings": [],
}


class ProjectHealthTests(unittest.TestCase):
    def setUp(self):
        clear_cache()
        set_cached_repository_model("owner", "repo", MODEL)
        set_cached_file_contents("owner", "repo", {
            "a.py": "password = 'example-credential-value'\nvalue = eval(input_text)\n",
            "b.py": "def useful():\n    return 1\n",
            ".env.production": "SECRET=never-return-this-value",
        })

    def test_evidence_scores_and_cache_are_deterministic(self):
        service = ProjectHealthService()
        first = service.analyze("owner", "repo", MODEL)
        second = service.analyze("owner", "repo", MODEL)
        rules = {finding["rule"] for finding in first["findings"]}
        self.assertTrue({"dependency_cycle", "sensitive_file", "dynamic_execution", "literal_secret_candidate"} <= rules)
        self.assertEqual(first["overall"], second["overall"])
        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertEqual(first["llm_calls"], 0)
        self.assertTrue(first["analysis_only"])
        self.assertEqual(first["coverage"]["skipped_sensitive"], 1)
        self.assertNotIn("example-credential-value", json.dumps(first))
        self.assertNotIn("never-return-this-value", json.dumps(first))
        for finding in first["findings"]:
            self.assertTrue(finding["evidence"])
            self.assertIn(finding["confidence"], {"HIGH", "MEDIUM", "LOW"})

    def test_endpoint_rejects_mismatch_and_uses_no_live_analysis(self):
        client = app.test_client()
        with patch("web_app.analyze_repository", side_effect=AssertionError("should not fetch")):
            response = client.post("/api/health/project", json={"repo_url": "owner/repo"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["success"])
        self.assertNotIn("example-credential-value", response.get_data(as_text=True))
        mismatch = client.post("/api/health/project", json={"repo_url": "other/repo", "repository_model": MODEL})
        self.assertEqual(mismatch.status_code, 400)

    def test_empty_model_requires_analysis(self):
        with self.assertRaises(ValueError):
            ProjectHealthService().analyze("owner", "repo", {"files": {}})

    def test_scores_use_documented_confidence_weights_and_counts(self):
        result = ProjectHealthService().analyze("owner", "repo", MODEL)
        for category, dimension in result["dimensions"].items():
            issues = [item for item in result["findings"] if item["category"] == category]
            expected = round(100 - min(60, sum(
                result["scoring"]["severity_penalties"][item["severity"]] *
                result["scoring"]["confidence_weights"][item["confidence"]]
                for item in issues
            )))
            self.assertEqual(dimension["score"], expected)
            self.assertEqual(dimension["finding_count"], len(issues))
            self.assertEqual(dimension["high"] + dimension["medium"] + dimension["low"], len(issues))
        self.assertEqual(result["overall_score"], round(sum(
            item["score"] for item in result["dimensions"].values()) / 4))
        self.assertFalse(any("Authentication vulnerability" in item["title"] for item in result["findings"]))

    def test_static_performance_and_safe_patch_actions(self):
        set_cached_file_contents("owner", "repo", {
            "a.py": "def useful():\n    return 1  \n",
            "b.py": "fetch('/api/items')\nfetch('/api/items')\nfetch('/api/items')\n",
        })
        result = ProjectHealthService().analyze("owner", "repo", MODEL)
        self.assertIn("repeated_fetch", {item["rule"] for item in result["findings"]})
        patchable = [item for item in result["findings"] if "Generate Patch" in item["suggested_actions"]]
        self.assertTrue(patchable)
        self.assertTrue(all(item["patch_suggestion_id"] in {"trailing_whitespace", "final_newline", "blank_lines"} for item in patchable))

    def test_clean_static_state_and_content_snapshot_invalidation(self):
        clean = {"metadata": MODEL["metadata"], "files": {"clean.py": {"size": 12}},
                 "dependencies": [], "entry_points": [], "api_routes": []}
        set_cached_file_contents("owner", "repo", {"clean.py": "def good():\n    pass\n"})
        service = ProjectHealthService()
        first = service.analyze("owner", "repo", clean)
        self.assertEqual(first["summary"]["finding_count"], 0)
        self.assertEqual(first["overall_score"], 100)
        set_cached_file_contents("owner", "repo", {"clean.py": "def good():\n    return eval(user_input)\n"})
        second = service.analyze("owner", "repo", clean)
        self.assertNotEqual(first["snapshot"], second["snapshot"])
        self.assertIn("dynamic_execution", {item["rule"] for item in second["findings"]})

    def test_sensitive_filename_extensions_are_blocked_without_blocking_examples(self):
        self.assertTrue(is_sensitive_file("config/credentials.yml"))
        self.assertTrue(is_sensitive_file("private/token.txt"))
        self.assertTrue(is_sensitive_file("secrets.ini"))
        self.assertFalse(is_sensitive_file(".env.example"))
        self.assertFalse(is_sensitive_file("token.example"))


if __name__ == "__main__":
    unittest.main()
