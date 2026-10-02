"""Phase 12 safety tests use disposable repositories only."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch as mock_patch

from patch_engine import PatchService
from patch_engine.diff_utils import digest, make_hunks, selected_content, unified
from patch_engine.validator import safe_target


class PatchEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "sample.py").write_text("x = 1  \n\ny = 2  \n", encoding="utf-8")
        self.service = PatchService(self.root)

    def generate(self):
        return self.service.generate("humanize", "sample.py", suggestion_id="trailing_whitespace")

    def select(self, result):
        return [f"{file['path']}:{hunk['id']}" for file in result["files"] for hunk in file["hunks"]]

    def test_deterministic_patch_generation_and_unified_diff(self):
        result = self.generate()
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["llm_calls"], 0)
        self.assertIn("--- a/sample.py", result["files"][0]["unified_diff"])
        self.assertIn("+++ b/sample.py", result["files"][0]["unified_diff"])
        self.assertEqual((self.root / "sample.py").read_text(), "x = 1  \n\ny = 2  \n")

    def test_source_hash_and_cache(self):
        first = self.generate()
        second = self.generate()
        self.assertEqual(first["id"], second["id"])
        self.assertTrue(second["cached"])
        self.assertEqual(first["files"][0]["original_hash"], digest((self.root / "sample.py").read_bytes()))

    def test_preview_can_be_rejected_without_source_change(self):
        original = (self.root / "sample.py").read_bytes()
        result = self.generate()
        self.service.reject(result["id"])
        self.assertEqual(self.service.get(result["id"])["status"], "rejected")
        self.assertEqual((self.root / "sample.py").read_bytes(), original)
        with self.assertRaisesRegex(ValueError, "rejected"):
            self.service.validate(result["id"], self.select(result))

    def test_stale_patch_rejected(self):
        result = self.generate()
        (self.root / "sample.py").write_text("x = 3\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Source changed since patch generation"):
            self.service.validate(result["id"], self.select(result))
        self.assertEqual(self.service.get(result["id"])["status"], "stale")

    def test_sensitive_and_secret_content_rejected(self):
        (self.root / ".env").write_text("API_KEY=hidden", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Sensitive"):
            self.service.generate("selection", ".env", start_line=1, end_line=1,
                                  transformation="replace_range", replacement="x\n")
        (self.root / "safe.py").write_text('password = "fake"\n', encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "secret-like"):
            self.service.generate("selection", "safe.py", start_line=1, end_line=1,
                                  transformation="replace_range", replacement="pass\n")
        with self.assertRaisesRegex(ValueError, "secret-like"):
            self.service.generate("selection", "sample.py", start_line=1, end_line=1,
                                  transformation="replace_range", replacement='password = "demo"\n')

    def test_traversal_and_protected_directories_rejected(self):
        for name in ("../outside.py", "/tmp/outside.py", "C:/outside.py", ".git/config", "node_modules/pkg.js", "dist/a.js", "credentials/key.py"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                safe_target(self.root, name)

    def test_symlink_escape_rejected(self):
        outside = self.root.parent / f"outside-{self.root.name}.py"
        outside.write_text("x = 1\n", encoding="utf-8")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        link = self.root / "linked.py"
        try:
            link.symlink_to(outside)
        except (OSError, NotImplementedError):
            with mock_patch.object(Path, "is_symlink", autospec=True,
                                   side_effect=lambda candidate: candidate.name == "linked.py"):
                with self.assertRaisesRegex(ValueError, "Symlinked"):
                    safe_target(self.root, "linked.py")
            return
        with self.assertRaisesRegex(ValueError, "Symlinked"):
            safe_target(self.root, "linked.py")

    def test_partial_hunk_selection(self):
        result = self.generate()
        ids = self.select(result)
        self.assertGreaterEqual(len(ids), 2)
        validation = self.service.validate(result["id"], [ids[0]])
        self.assertEqual(validation["validation"]["state"], "PASSED")
        self.service.apply(result["id"], [ids[0]], confirm_apply=True)
        content = (self.root / "sample.py").read_text()
        self.assertIn("x = 1\n", content)
        self.assertIn("y = 2  \n", content)

    def test_dependent_and_overlapping_hunks_rejected(self):
        hunks = make_hunks("a\nb\nc\n", "A\nb\nC\n", "change")
        self.assertEqual(len(hunks), 2)
        hunks[1].depends_on = [hunks[0].id]
        with self.assertRaisesRegex(ValueError, "depends"):
            selected_content("a\nb\nc\n", hunks, {hunks[1].id})
        hunks[1].old_start = 1
        with self.assertRaisesRegex(ValueError, "Overlapping"):
            selected_content("a\nb\nc\n", hunks, {hunks[0].id, hunks[1].id})

    def test_apply_requires_validation_and_confirmation(self):
        result = self.generate()
        ids = self.select(result)
        with self.assertRaisesRegex(ValueError, "confirmation"):
            self.service.apply(result["id"], ids)
        with self.assertRaisesRegex(ValueError, "Validate"):
            self.service.apply(result["id"], ids, confirm_apply=True)
        self.service.validate(result["id"], ids)
        applied = self.service.apply(result["id"], ids, confirm_apply=True)
        self.assertEqual(applied["patch"]["status"], "applied")
        self.assertTrue((self.root / ".repo-explainer" / "rollbacks" / result["id"] / "manifest.json").is_file())

    def test_snapshot_is_durable_before_first_source_write(self):
        result = self.generate(); ids = self.select(result)
        self.service.validate(result["id"], ids)
        from patch_engine import applier
        real = applier.atomic_replace
        observed = []
        def inspect_before_write(target, content):
            saved = self.service.history()["patches"][0]
            observed.append((saved["status"], saved["rollback_available"],
                             (self.root / ".repo-explainer" / "rollbacks" / result["id"] / "manifest.json").is_file()))
            return real(target, content)
        with mock_patch.object(applier, "atomic_replace", side_effect=inspect_before_write):
            self.service.apply(result["id"], ids, confirm_apply=True)
        self.assertEqual(observed[0], ("applying", True, True))

    def test_rollback_restores_exact_bytes_after_restart(self):
        original = (self.root / "sample.py").read_bytes()
        result = self.generate(); ids = self.select(result)
        self.service.validate(result["id"], ids)
        self.service.apply(result["id"], ids, confirm_apply=True)
        restarted = PatchService(self.root)
        rolled = restarted.rollback(result["id"])
        self.assertTrue(rolled["success"])
        self.assertEqual((self.root / "sample.py").read_bytes(), original)
        self.assertEqual(restarted.history()["patches"][0]["status"], "rolled_back")

    def test_rollback_conflict_requires_ack(self):
        result = self.generate(); ids = self.select(result)
        self.service.validate(result["id"], ids)
        self.service.apply(result["id"], ids, confirm_apply=True)
        (self.root / "sample.py").write_text("x = 99\n", encoding="utf-8")
        blocked = self.service.rollback(result["id"])
        self.assertFalse(blocked["success"])
        self.assertEqual(blocked["conflicts"], ["sample.py"])
        self.assertEqual((self.root / "sample.py").read_text(), "x = 99\n")
        self.assertTrue(self.service.rollback(result["id"], confirm_conflicts=True)["success"])

    def test_accept_after_restart_preserves_rollback(self):
        result = self.generate(); ids = self.select(result)
        self.service.validate(result["id"], ids)
        self.service.apply(result["id"], ids, confirm_apply=True)
        restarted = PatchService(self.root)
        accepted = restarted.accept(result["id"], confirm_accept=True)
        self.assertEqual(accepted["patch"]["status"], "accepted")
        self.assertTrue(restarted.history()["patches"][0]["rollback_available"])
        self.assertTrue(restarted.rollback(result["id"])["success"])

    def test_high_risk_and_public_api_ack(self):
        result = self.service.generate("selection", "sample.py", start_line=1, end_line=1,
                                       transformation="replace_range", replacement="x = 4\n")
        ids = self.select(result)
        self.service.validate(result["id"], ids)
        with self.assertRaisesRegex(ValueError, "High-risk"):
            self.service.apply(result["id"], ids, confirm_apply=True)
        with self.assertRaisesRegex(ValueError, "Public API"):
            self.service.apply(result["id"], ids, confirm_apply=True, confirm_high_risk=True)
        self.service.apply(result["id"], ids, confirm_apply=True,
                           confirm_high_risk=True, confirm_public_api=True)

    def test_explicit_ai_proposal_remains_preview_only(self):
        original = (self.root / "sample.py").read_bytes()
        result = self.service.generate("ai", "sample.py", proposed_content="x = 2\n\ny = 2\n")
        self.assertEqual(result["risk_level"], "HIGH")
        self.assertTrue(result["files"][0]["public_api_change"])
        self.assertEqual((self.root / "sample.py").read_bytes(), original)

    def test_group_multi_file_and_partial_rollback(self):
        (self.root / "other.py").write_text("z = 3  \n", encoding="utf-8")
        result = self.service.generate_group([
            {"source": "humanize", "path": "sample.py", "suggestion_id": "trailing_whitespace"},
            {"source": "humanize", "path": "other.py", "suggestion_id": "trailing_whitespace"},
        ])
        ids = self.select(result)
        self.service.validate(result["id"], ids)
        self.service.apply(result["id"], ids, confirm_apply=True)
        restored = self.service.rollback(result["id"], paths=["sample.py"])
        self.assertTrue(restored["success"])
        self.assertEqual(self.service.get(result["id"])["status"], "partially_rolled_back")
        self.assertTrue(self.service.rollback(result["id"], paths=["other.py"])["success"])
        self.assertEqual(self.service.get(result["id"])["status"], "rolled_back")

    def test_group_selected_file_does_not_touch_unselected_file(self):
        (self.root / "other.py").write_text("z = 3  \n", encoding="utf-8")
        result = self.service.generate_group([
            {"source": "humanize", "path": "sample.py", "suggestion_id": "trailing_whitespace"},
            {"source": "humanize", "path": "other.py", "suggestion_id": "trailing_whitespace"},
        ])
        ids = [item for item in self.select(result) if item.startswith("sample.py:")]
        original_other = (self.root / "other.py").read_bytes()
        self.service.validate(result["id"], ids)
        applied = self.service.apply(result["id"], ids, confirm_apply=True)
        self.assertEqual(applied["applied_files"], ["sample.py"])
        self.assertEqual((self.root / "other.py").read_bytes(), original_other)

    def test_post_apply_failure_keeps_rollback_available(self):
        result = self.generate(); ids = self.select(result)
        self.service.validate(result["id"], ids)
        failed = {"state": "FAILED", "command": "simulated validator", "exit_code": 1, "output_summary": "failure"}
        with mock_patch("patch_engine.service.syntax_check", return_value=failed):
            applied = self.service.apply(result["id"], ids, confirm_apply=True)
        self.assertEqual(applied["patch"]["status"], "validation_failed")
        self.assertTrue(applied["patch"]["rollback_available"])

    def test_mid_apply_failure_restores_first_file(self):
        (self.root / "other.py").write_text("z = 3  \n", encoding="utf-8")
        result = self.service.generate_group([
            {"source": "humanize", "path": "sample.py", "suggestion_id": "trailing_whitespace"},
            {"source": "humanize", "path": "other.py", "suggestion_id": "trailing_whitespace"},
        ])
        ids = self.select(result)
        self.service.validate(result["id"], ids)
        original = (self.root / "sample.py").read_bytes()
        from patch_engine import applier
        real = applier.atomic_replace
        calls = 0
        def fail_second(target, content):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated failure")
            return real(target, content)
        with mock_patch.object(applier, "atomic_replace", side_effect=fail_second):
            with self.assertRaisesRegex(ValueError, "apply failed"):
                self.service.apply(result["id"], ids, confirm_apply=True)
        self.assertEqual((self.root / "sample.py").read_bytes(), original)

    def test_large_patch_and_duplicate_file_blocked(self):
        with self.assertRaisesRegex(ValueError, "each file only once"):
            self.service.generate_group([{"source": "humanize", "path": "sample.py", "suggestion_id": "trailing_whitespace"}] * 2)
        changes = []
        for index in range(21):
            name = f"part_{index}.py"
            (self.root / name).write_text(f"value = {index}", encoding="utf-8")
            changes.append({"source": "humanize", "path": name, "suggestion_id": "final_newline"})
        split = self.service.generate_group(changes)
        self.assertTrue(split["split"])
        self.assertEqual([len(item["files"]) for item in split["patches"]], [20, 1])

    def test_changed_line_limit_splits_group(self):
        changes = []
        for index in range(2):
            name = f"large_{index}.txt"
            (self.root / name).write_text("old\n" * 800, encoding="utf-8")
            changes.append({"source": "selection", "path": name, "start_line": 1, "end_line": 800,
                            "transformation": "replace_range", "replacement": "new\n" * 800})
        result = self.service.generate_group(changes)
        self.assertTrue(result["split"])
        self.assertEqual([len(item["files"]) for item in result["patches"]], [1, 1])

    def test_git_checkout_requires_ignored_snapshot_storage(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True, capture_output=True)
            with self.assertRaisesRegex(ValueError, "must ignore"):
                PatchService(root)
            (root / ".gitignore").write_text(".repo-explainer/\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "remote", "add", "origin",
                            "https://example-token@github.com/fixture/repo.git"], check=True, capture_output=True)
            info = PatchService(root).git_info()
            self.assertTrue(info["available"])
            self.assertEqual(info["origin"], "github.com/fixture/repo")

    def test_planner_private_rename(self):
        (self.root / "private.py").write_text("def _helper():\n    return 1\n\nprint(_helper())\n", encoding="utf-8")
        plan = {"id": "plan1", "plan_type": "rename_symbol", "target": "private.py::_helper",
                "destination": "_renamed", "affected_files": ["private.py"]}
        result = self.service.generate("planner", "private.py", plan=plan, step_id="definition")
        self.assertIn("_renamed", result["files"][0]["unified_diff"])
        with self.assertRaisesRegex(ValueError, "manual"):
            self.service.generate("planner", "private.py", plan=plan, step_id="imports")

    def test_api_fixture_generate_validate_apply_rollback(self):
        import web_app
        before = os.environ.get("PATCH_LOCAL_ROOT")
        repo_before = os.environ.get("PATCH_REPOSITORY")
        os.environ["PATCH_LOCAL_ROOT"] = str(self.root)
        os.environ["PATCH_REPOSITORY"] = "fixture/repo"
        web_app._local_patch_service = None
        self.addCleanup(lambda: os.environ.pop("PATCH_LOCAL_ROOT", None) if before is None else os.environ.__setitem__("PATCH_LOCAL_ROOT", before))
        self.addCleanup(lambda: os.environ.pop("PATCH_REPOSITORY", None) if repo_before is None else os.environ.__setitem__("PATCH_REPOSITORY", repo_before))
        self.addCleanup(lambda: setattr(web_app, "_local_patch_service", None))
        client = web_app.app.test_client()
        payload = {"repo_url": "fixture/repo", "source": "humanize", "path": "sample.py", "suggestion_id": "trailing_whitespace"}
        self.assertEqual(client.post("/api/patch/generate", json=payload,
                                     headers={"Origin": "https://evil.example"}).status_code, 400)
        self.assertEqual(client.post("/api/patch/ai-generate", json={"repo_url": "fixture/repo", "path": "sample.py"}).status_code, 400)
        generated = client.post("/api/patch/generate", json=payload).get_json()
        self.assertTrue(generated["success"], generated)
        ids = self.select(generated)
        patch_id = generated["id"]
        self.assertEqual(client.post("/api/patch/apply", json={"patch_id": patch_id, "selected_hunks": ids, "confirm_apply": True}).status_code, 400)
        self.assertEqual(client.post("/api/patch/validate", json={"patch_id": patch_id, "selected_hunks": ids}).status_code, 200)
        self.assertEqual(client.post("/api/patch/apply", json={"patch_id": patch_id, "selected_hunks": ids, "confirm_apply": True}).status_code, 200)
        self.assertEqual(client.post("/api/patch/impact", json={"repo_url": "fixture/repo", "path": "sample.py"}).status_code, 200)
        self.assertEqual(client.post("/api/patch/rollback", json={"patch_id": patch_id, "confirm_rollback": True}).status_code, 200)
        self.assertEqual(client.get("/api/patch/history").status_code, 200)
        self.assertEqual(client.get("/api/health").status_code, 200)


if __name__ == "__main__":
    unittest.main()
