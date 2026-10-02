"""Phase 10 deterministic Humanize tests; no live GitHub or AI requests."""

import ast
import unittest
from unittest.mock import Mock, patch

from cache_manager import clear_cache, get_cache_stats, set_cached_file_contents, set_cached_repository_model
from humanize.analysis import analyze_content
from humanize.service import HumanizeService
from humanize.transforms import deterministic_previews
from web_app import app


SOURCE = '''# TODO: document branching

def foo(value):
    if value:
        if value > 10:
            if value > 20:
                return value
    return 0


def repeat():
    value = 1
    other = 2
    total = value + other
    return total


def again():
    value = 1
    other = 2
    total = value + other
    return total
'''

MODEL = {
    "metadata": {"owner": "owner", "repo": "repo", "default_branch": "main", "latest_commit_sha": "sha1"},
    "files": {
        "src/main.py": {"size": 250, "exports": [], "category": "service"},
        "src/api.py": {"size": 100, "exports": ["public"], "category": "backend-route"},
        "src/uncached.py": {"size": 100000, "exports": [], "category": "utility"},
        ".env": {"size": 50, "exports": [], "category": "config"},
    },
    "symbols": [], "dependencies": [], "entry_points": [], "api_routes": [],
    "database_models": [], "architecture_layers": {}, "technologies": [], "directories": {}, "warnings": [],
}


class HumanizeTests(unittest.TestCase):
    def setUp(self):
        clear_cache()
        set_cached_repository_model("owner", "repo", MODEL)
        set_cached_file_contents("owner", "repo", {"src/main.py": SOURCE, "src/api.py": "def public(x):\n    return x\n"})
        self.service = HumanizeService()

    def test_deterministic_findings_have_evidence_and_confidence(self):
        result = analyze_content("src/main.py", SOURCE, "python", "Aggressive")
        self.assertGreater(result["finding_count"], 0)
        self.assertEqual(result["metrics"]["function_count"], 3)
        self.assertGreaterEqual(result["metrics"]["max_nesting"], 3)
        rules = {finding["rule"] for finding in result["findings"]}
        self.assertIn("vague_name", rules)
        self.assertIn("unresolved_comment", rules)
        self.assertIn("repeated_block", rules)
        self.assertTrue(all(item["evidence"] and item["confidence"] for item in result["findings"]))

    def test_modes_change_thresholds(self):
        content = "def useful():\n    " + "x" * 95 + "\n"
        conservative = analyze_content("f.py", content, "python", "Conservative")
        aggressive = analyze_content("f.py", content, "python", "Aggressive")
        self.assertLess(conservative["finding_count"], aggressive["finding_count"])
        self.assertGreater(aggressive["metrics"]["long_line_count"], conservative["metrics"]["long_line_count"])

    def test_python_previews_preserve_ast_and_multiline_content(self):
        code = 'def public(x):  \n    text = """a  \nb  """\n    return x + 1  '
        previews = deterministic_previews("f.py", code, "python")
        ids = {preview["id"] for preview in previews}
        self.assertIn("final_newline", ids)
        self.assertIn("trailing_whitespace", ids)
        self.assertTrue(all(preview["preview_only"] for preview in previews))
        self.assertIn('"""a  ', code)
        self.assertEqual(ast.dump(ast.parse(code)), ast.dump(ast.parse(code.rstrip(" ") + "\n")))

    def test_js_preview_only_adds_final_newline(self):
        previews = deterministic_previews("f.ts", "export const value = 1", "typescript")
        self.assertEqual([item["id"] for item in previews], ["final_newline"])

    def test_analysis_uses_source_cache_without_ai(self):
        ai = Mock(side_effect=AssertionError("AI should not run"))
        service = HumanizeService(ai_rewriter=ai)
        with patch("source_service.get_file_content") as fetch:
            first = service.analyze_file("owner", "repo", "src/main.py", model=MODEL)
            second = service.analyze_file("owner", "repo", "src/main.py", model=MODEL)
        self.assertTrue(first["success"])
        self.assertEqual(first, second)
        self.assertEqual(first["llm_calls"], 0)
        self.assertEqual(fetch.call_count, 0)
        self.assertEqual(ai.call_count, 0)
        self.assertGreaterEqual(get_cache_stats()["humanize_count"], 1)

    def test_sensitive_file_blocked_before_fetch_or_ai(self):
        with patch("source_service.get_file_content") as fetch:
            result = self.service.analyze_file("owner", "repo", ".env", model=MODEL)
            ai_result = self.service.ai_preview("owner", "repo", ".env", "Balanced", MODEL, True)
        self.assertEqual(result["blocked"], "sensitive_file")
        self.assertEqual(ai_result["blocked"], "unsafe_source")
        fetch.assert_not_called()

    def test_repository_audit_is_analysis_only_and_reports_coverage(self):
        with patch("source_service.get_file_content") as fetch:
            result = self.service.audit_repository("owner", "repo", MODEL)
        self.assertTrue(result["success"])
        self.assertTrue(result["analysis_only"])
        self.assertTrue(result["no_repository_changes"])
        self.assertEqual(result["coverage"]["total_files"], 4)
        self.assertEqual(result["coverage"]["content_analyzed"], 2)
        self.assertEqual(result["coverage"]["metadata_only"], 1)
        self.assertEqual(result["coverage"]["skipped_sensitive"], 1)
        fetch.assert_not_called()

    def test_public_api_risk_invokes_change_impact(self):
        impact = Mock()
        impact.analyze_impact.return_value = {"success": True, "analysis": {
            "risk_level": "MEDIUM", "risk_score": 35, "blast_radius": {"total_affected": 2},
            "summary": "Two files", "risk_factors": ["route"]}}
        result = HumanizeService(impact_service=impact).analyze_file("owner", "repo", "src/api.py", model=MODEL)
        self.assertEqual(result["risk"]["level"], "MEDIUM")
        self.assertTrue(result["risk"]["impact"]["available"])
        impact.analyze_impact.assert_called_once()

    def test_ai_requires_explicit_request_and_only_returns_patch(self):
        ai = Mock(return_value="def public(x):\n    result = x\n    return result\n")
        service = HumanizeService(ai_rewriter=ai)
        denied = service.ai_preview("owner", "repo", "src/api.py", "Balanced", MODEL, False)
        self.assertFalse(denied["success"])
        ai.assert_not_called()
        with patch.object(service, "_impact", return_value={"available": True}):
            result = service.ai_preview("owner", "repo", "src/api.py", "Balanced", MODEL, True)
        self.assertTrue(result["success"])
        self.assertTrue(result["preview_only"])
        self.assertFalse(result["applied"])
        self.assertIn("@@", result["preview"]["patch"])
        self.assertEqual(result["llm_calls"], 1)
        ai.assert_called_once()

    def test_ai_public_api_change_is_rejected(self):
        ai = Mock(return_value="def renamed(x):\n    return x\n")
        result = HumanizeService(ai_rewriter=ai).ai_preview("owner", "repo", "src/api.py", "Balanced", MODEL, True)
        self.assertEqual(result["blocked"], "public_api_change")

    def test_ai_public_class_method_signature_change_is_rejected(self):
        model = dict(MODEL)
        with patch("humanize.service.get_source_file", return_value={"success": True, "file": {
            "path": "src/api.py", "language": "python", "content":
            "class Service:\n    def public(self, item):\n        return item\n",
            "is_sensitive": False, "is_binary": False, "redacted": False,
        }}):
            ai = Mock(return_value="class Service:\n    def public(self, item, extra=None):\n        return item\n")
            result = HumanizeService(ai_rewriter=ai).ai_preview("owner", "repo", "src/api.py", "Balanced", model, True)
        self.assertEqual(result["blocked"], "public_api_change")

    def test_api_rejects_foreign_repository_model_on_ai_route(self):
        clear_cache()
        foreign = {**MODEL, "metadata": {**MODEL["metadata"], "owner": "someone-else"}}
        response = app.test_client().post("/api/humanize/ai-preview", json={
            "repo_url": "owner/repo", "path": "src/main.py", "confirm_ai": True,
            "repository_model": foreign,
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn("does not match", response.json["error"])

    def test_api_validation_and_normal_response(self):
        client = app.test_client()
        invalid = client.post("/api/humanize", json={"repo_url": "owner/repo", "path": "src/main.py", "mode": "Unsafe"})
        self.assertEqual(invalid.status_code, 400)
        normal = client.post("/api/humanize", json={"repo_url": "owner/repo", "path": "src/main.py", "mode": "Balanced"})
        self.assertEqual(normal.status_code, 200)
        self.assertEqual(normal.json["llm_calls"], 0)
        audit = client.post("/api/humanize", json={"repo_url": "owner/repo", "audit_only": True})
        self.assertEqual(audit.status_code, 200)
        self.assertTrue(audit.json["analysis_only"])

    def test_api_ai_requires_confirmation(self):
        response = app.test_client().post("/api/humanize/ai-preview", json={"repo_url": "owner/repo", "path": "src/main.py"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("explicit", response.json["error"].lower())


if __name__ == "__main__":
    unittest.main()
