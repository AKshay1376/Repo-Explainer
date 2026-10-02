"""Offline Phase 11 planning tests; no analyzed code or AI is executed."""

import unittest
from unittest.mock import Mock, patch

from cache_manager import (clear_cache, get_cache_stats, set_cached_file_contents,
                           set_cached_repository_model, set_cached_source_file)
from refactor_planner import PLAN_TYPES, RefactorPlannerService
from refactor_planner.models import PlanStep
from refactor_planner.ordering import order_steps
from web_app import app


MODEL = {
    "metadata": {"owner": "owner", "repo": "repo", "default_branch": "main", "latest_commit_sha": "sha1"},
    "files": {
        "src/service.py": {"category": "service", "exports": ["public"], "functions": ["public"],
                           "dependencies": ["src/model.py"], "dependents": ["src/route.py", "tests/test_service.py"]},
        "src/route.py": {"category": "backend-route", "dependencies": ["src/service.py"],
                         "dependents": []},
        "src/model.py": {"category": "model", "dependencies": [], "dependents": ["src/service.py"]},
        "tests/test_service.py": {"category": "test", "dependencies": ["src/service.py"], "dependents": []},
        "requirements.txt": {"category": "config", "dependencies": [], "dependents": []},
        ".env": {"category": "config", "dependencies": [], "dependents": []},
    },
    "dependencies": [
        {"source": "src/route.py", "target": "src/service.py", "type": "imports"},
        {"source": "src/service.py", "target": "src/model.py", "type": "imports"},
        {"source": "tests/test_service.py", "target": "src/service.py", "type": "imports"},
    ],
    "symbols": [{"name": "public", "file": "src/service.py", "line": 1, "type": "function"}],
    "api_routes": [{"method": "GET", "path": "/api/value", "file": "src/route.py", "handler": "handle"}],
    "database_models": [{"name": "Record", "file": "src/model.py", "framework": "sqlalchemy"}],
    "entry_points": [{"path": "src/route.py", "type": "web-backend"}],
    "architecture_layers": {}, "technologies": [], "directories": {}, "warnings": [],
}
CONTENTS = {
    "src/service.py": "def public(value):\n    if value:\n        return value\n    return 0\n",
    "src/route.py": "from src.service import public\ndef handle():\n    return public(1)\n",
    "tests/test_service.py": "from src.service import public\ndef test_public():\n    assert public(1) == 1\n",
    "requirements.txt": "requests>=2.0\n",
}


class PlannerTests(unittest.TestCase):
    def setUp(self):
        clear_cache()
        set_cached_repository_model("owner", "repo", MODEL)
        set_cached_file_contents("owner", "repo", CONTENTS)
        self.service = RefactorPlannerService()

    def plan(self, kind, target="src/service.py", destination=None, options=None, model=None):
        return self.service.plan("owner", "repo", model or MODEL, kind, target, destination, options)

    def test_all_twelve_plan_types_are_supported(self):
        self.assertEqual(len(PLAN_TYPES), 12)
        cases = {
            "rename_symbol": ("src/service.py::public", "renamed", None),
            "move_file": ("src/service.py", "src/core/service.py", None),
            "move_module": ("src/service.py", "src/core/service.py", None),
            "extract_function": ("src/service.py", None, {"symbol": "public"}),
            "extract_module": ("src/service.py", None, None),
            "split_large_file": ("src/service.py", None, None),
            "merge_duplicate_helpers": ("src/service.py", None, None),
            "replace_dependency": ("requests", "httpx", None),
            "upgrade_dependency": ("requests", "3.0", None),
            "framework_migration": ("src/route.py", "new-framework", None),
            "api_migration": ("src/route.py", "v2", None),
            "database_model_migration": ("src/model.py", "v2", None),
        }
        for kind, (target, destination, options) in cases.items():
            with self.subTest(kind=kind):
                result = self.plan(kind, target, destination, options)
                self.assertTrue(result["success"], result)
                self.assertEqual(result["llm_calls"], 0)
                self.assertTrue(result["plan"]["planning_only"])
                self.assertTrue(result["plan"]["steps"])

    def test_rename_has_ordered_definition_import_reference_test_and_validation_steps(self):
        plan = self.plan("rename_symbol", "src/service.py::public", "renamed")["plan"]
        ids = [step["id"] for step in plan["steps"]]
        self.assertEqual(ids, ["definition", "compatibility", "imports", "references", "tests", "validate"])
        self.assertIn("src/route.py", plan["affected_files"])
        self.assertTrue(any(item["line"] == 1 for item in plan["steps"][0]["source_locations"]))
        self.assertEqual(plan["risk_level"], "HIGH")
        self.assertTrue(plan["affected_tests"])
        self.assertTrue(plan["affected_routes"])

    def test_file_and_module_move_update_imports_after_move(self):
        for kind in ("move_file", "move_module"):
            plan = self.plan(kind, "src/service.py", "src/core/service.py")["plan"]
            self.assertLess(next(s["order"] for s in plan["steps"] if s["id"] == "move"),
                            next(s["order"] for s in plan["steps"] if s["id"] == "imports"))

    def test_extraction_and_duplicate_plans_mark_side_effect_uncertainty(self):
        for kind in ("extract_function", "merge_duplicate_helpers", "split_large_file"):
            plan = self.plan(kind, options={"symbol": "public"})["plan"]
            self.assertTrue(any("Side effects" in item for item in plan["manual_review_items"]))

    def test_dependency_replacement_stages_removal_after_tests(self):
        plan = self.plan("replace_dependency", "requests", "httpx")["plan"]
        self.assertEqual([s["id"] for s in plan["steps"]],
                         ["manifest", "adapters", "usages", "tests", "remove", "validate"])
        self.assertIn("requirements.txt", plan["affected_files"])

    def test_dependency_import_sites_are_affected_files(self):
        set_cached_file_contents("owner", "repo", {**CONTENTS, "src/route.py": "import requests\n"})
        plan = self.plan("replace_dependency", "requests", "httpx")["plan"]
        self.assertIn("src/route.py", plan["affected_files"])
        self.assertTrue(plan["migration_evidence"]["constraints"])
        self.assertTrue(plan["migration_evidence"]["import_sites"])

    def test_file_move_surfaces_cached_config_and_relative_imports(self):
        model = {**MODEL, "files": {**MODEL["files"], "tsconfig.json": {"category": "config"}}}
        set_cached_file_contents("owner", "repo", {**CONTENTS,
            "src/service.py": "from .model import Record\n",
            "tsconfig.json": '{"paths": {"src/service.py": ["src/service.py"]}}'})
        plan = self.plan("move_file", "src/service.py", "src/core/service.py", model=model)["plan"]
        self.assertIn("tsconfig.json", plan["affected_files"])
        self.assertTrue(any("relative imports" in item for item in plan["manual_review_items"]))
        self.assertTrue(any("config references" in item for item in plan["manual_review_items"]))

    def test_split_file_suggests_symbol_partitions(self):
        model = {**MODEL, "symbols": MODEL["symbols"] + [
            {"name": "get_item", "file": "src/service.py", "type": "function", "line": 5},
            {"name": "Widget", "file": "src/service.py", "type": "component", "line": 10}]}
        plan = self.plan("split_large_file", model=model)["plan"]
        self.assertTrue(plan["proposed_partitions"])
        self.assertIn("helpers", {item["name"] for item in plan["proposed_partitions"]})

    def test_external_migrations_require_external_information(self):
        plan = self.plan("framework_migration", "src/route.py", "new-framework")["plan"]
        self.assertTrue(plan["external_information_needed"])
        self.assertTrue(any("External" in warning for warning in plan["warnings"]))
        self.assertFalse(self.plan("framework_migration", "unknown-framework", "new-framework")["success"])

    def test_dependency_cycle_surfaces_compatibility_review(self):
        model = {**MODEL, "dependencies": MODEL["dependencies"] + [
            {"source": "src/service.py", "target": "src/route.py", "type": "imports"}]}
        plan = self.plan("move_file", "src/service.py", "src/new.py", model=model)["plan"]
        self.assertTrue(plan["cycles"])
        self.assertIn("cycle_review", [step["id"] for step in plan["steps"]])
        self.assertTrue(any("cycle" in item.lower() for item in plan["manual_review_items"]))

    def test_step_ordering_and_cycle_reporting(self):
        steps = [PlanStep("b", 0, "b", "", "x", "move", prerequisites=["a"]),
                 PlanStep("a", 0, "a", "", "x", "move")]
        ordered, cycles = order_steps(steps)
        self.assertEqual([step.id for step in ordered], ["a", "b"])
        self.assertFalse(cycles)
        cyclic = [PlanStep("a", 0, "a", "", "x", "move", prerequisites=["b"]),
                  PlanStep("b", 0, "b", "", "x", "move", prerequisites=["a"])]
        _, cycles = order_steps(cyclic)
        self.assertEqual(cycles, [["a", "b"]])
        cyclic.append(PlanStep("c", 0, "c", "", "x", "move", prerequisites=["b"]))
        _, cycles = order_steps(cyclic)
        self.assertEqual(cycles, [["a", "b"]])

    def test_sensitive_target_and_destination_are_rejected(self):
        self.assertFalse(self.plan("move_file", ".env", "safe.py")["success"])
        self.assertFalse(self.plan("move_file", "src/service.py", ".env")["success"])

    def test_cache_is_sha_and_options_bound(self):
        first = self.plan("move_file", destination="src/new.py")
        second = self.plan("move_file", destination="src/new.py")
        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertEqual(first["plan"]["id"], second["plan"]["id"])
        self.assertGreaterEqual(get_cache_stats()["refactor_count"], 1)
        third = self.service.plan("owner", "repo", MODEL, "move_file", "src/service.py", "src/new.py", ref="sha2")
        self.assertNotEqual(first["plan"]["id"], third["plan"]["id"])
        set_cached_source_file("owner", "repo", "sha1", "src/service.py", {
            "content": "def public(value):\n    return value + 1\n", "redacted": False,
        })
        refreshed = self.plan("move_file", destination="src/new.py")
        self.assertFalse(refreshed["cached"])
        self.assertNotEqual(first["plan"]["id"], refreshed["plan"]["id"])

    def test_validate_is_checklist_without_code_execution(self):
        result = self.service.validate("owner", "repo", MODEL, "move_file", "src/service.py", "src/new.py")
        self.assertTrue(result["success"])
        self.assertEqual(result["validation_state"], "NOT_RUN")
        self.assertFalse(result["executed_code"])
        self.assertTrue(all(item["state"] == "NOT_RUN" for item in result["checks"]))

    def test_ai_explain_requires_opt_in_and_sends_no_source(self):
        ai = Mock(return_value="Review the staged move and tests.")
        service = RefactorPlannerService(ai_explainer=ai)
        denied = service.explain("owner", "repo", MODEL, "move_file", "src/service.py", "src/new.py")
        self.assertFalse(denied["success"])
        ai.assert_not_called()
        allowed = service.explain("owner", "repo", MODEL, "move_file", "src/service.py", "src/new.py",
                                  explicit_request=True)
        self.assertTrue(allowed["success"])
        self.assertEqual(allowed["llm_calls"], 1)
        self.assertNotIn("def public", str(ai.call_args))

    def test_api_plan_validate_and_security(self):
        client = app.test_client()
        payload = {"repo_url": "owner/repo", "repository_model": MODEL,
                   "plan_type": "move_file", "target": "src/service.py", "destination": "src/new.py"}
        self.assertEqual(client.post("/api/refactor/plan", json=payload).status_code, 200)
        self.assertEqual(client.post("/api/refactor/validate", json=payload).status_code, 200)
        self.assertEqual(client.post("/api/refactor/explain", json=payload).status_code, 400)
        sensitive = {**payload, "target": ".env"}
        self.assertEqual(client.post("/api/refactor/plan", json=sensitive).status_code, 400)


if __name__ == "__main__":
    unittest.main()
