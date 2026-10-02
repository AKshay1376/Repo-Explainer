import tempfile
import unittest
from pathlib import Path

from patch_engine import PatchService
from patch_engine.generator import (compatibility_reexport, compatibility_wrapper,
                                    extract_pure_assignment, import_consolidation)


class FileOperationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.service = PatchService(self.root)

    def tearDown(self): self.temp.cleanup()

    def _apply(self, preview):
        selected = [f"{file['path']}:{hunk['id']}" for file in preview["files"] for hunk in file["hunks"]]
        validation = self.service.validate(preview["id"], selected)
        self.assertTrue(validation["success"])
        return self.service.apply(preview["id"], selected, confirm_apply=True,
                                  confirm_high_risk=True, confirm_public_api=True)

    def test_create_delete_and_rollback(self):
        created = self.service.generate_verified("create_file", "created.py", {"content": "answer = 42\n"})
        self._apply(created)
        self.assertEqual((self.root / "created.py").read_bytes(), b"answer = 42\n")
        self.service.rollback(created["id"])
        self.assertFalse((self.root / "created.py").exists())
        (self.root / "old.py").write_bytes(b"answer = 42\r\n")
        deleted = self.service.generate_verified("delete_file", "old.py")
        self._apply(deleted)
        self.assertFalse((self.root / "old.py").exists())
        self.service.rollback(deleted["id"])
        self.assertEqual((self.root / "old.py").read_bytes(), b"answer = 42\r\n")

    def test_python_move_import_rewrite_and_rollback(self):
        (self.root / "pkg").mkdir()
        (self.root / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "pkg" / "old.py").write_bytes(b"def value():\r\n    return 2\r\n")
        (self.root / "consumer.py").write_text("from pkg.old import value\nresult = value()\n", encoding="utf-8")
        preview = self.service.generate("planner", "pkg/old.py", plan={"id": "x", "plan_type": "move_file",
            "target": "pkg/old.py", "destination": "pkg/new.py"}, step_id="move")
        self.assertEqual(preview["files"][0]["operation"], "move")
        self._apply(preview)
        self.assertFalse((self.root / "pkg" / "old.py").exists())
        self.assertEqual((self.root / "pkg" / "new.py").read_bytes(), b"def value():\r\n    return 2\r\n")
        self.assertIn("from pkg.new import value", (self.root / "consumer.py").read_text())
        self.service.rollback(preview["id"])
        self.assertFalse((self.root / "pkg" / "new.py").exists())
        self.assertEqual((self.root / "pkg" / "old.py").read_bytes(), b"def value():\r\n    return 2\r\n")
        self.assertIn("from pkg.old import value", (self.root / "consumer.py").read_text())

    def test_move_destination_conflict_and_sensitive_path(self):
        (self.root / "pkg").mkdir()
        (self.root / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "pkg" / "old.py").write_text("x = 1\n", encoding="utf-8")
        (self.root / "pkg" / "new.py").write_text("x = 2\n", encoding="utf-8")
        for destination in ("pkg/new.py", "../escape.py", ".git/new.py", "pkg/.env"):
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                self.service.generate("planner", "pkg/old.py", plan={"id": "x", "plan_type": "move_file",
                    "target": "pkg/old.py", "destination": destination}, step_id="move")
        outside = self.root.parent / (self.root.name + "-outside")
        outside.mkdir(exist_ok=True)
        try:
            (self.root / "linked").symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            pass
        else:
            with self.assertRaisesRegex(ValueError, "Symlinked"):
                self.service.generate("planner", "pkg/old.py", plan={"id": "x", "plan_type": "move_file",
                    "target": "pkg/old.py", "destination": "linked/new.py"}, step_id="move")
        finally:
            outside.rmdir()

    def test_compatibility_reexport_wrapper_and_imports(self):
        (self.root / "pkg").mkdir()
        (self.root / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "pkg" / "old.py").write_text("def public(x):\n    return x\n", encoding="utf-8")
        files = compatibility_reexport(self.root, "pkg/old.py", "pkg/new.py")
        self.assertEqual([file.operation for file in files[:2]], ["create", "modify"])
        self.assertIn("from pkg.new import public", files[1].proposed_bytes.decode())
        (self.root / "sample.py").write_text("from pkg.old import public\nfrom pkg.old import other\n\ndef target(x):\n    return x\n", encoding="utf-8")
        self.assertIn("public, other", import_consolidation(self.root, "sample.py").proposed_bytes.decode())
        self.assertIn("def old(x):", compatibility_wrapper(self.root, "sample.py", "old", "target").proposed_bytes.decode())

    def test_helper_extraction_and_rejection(self):
        (self.root / "sample.py").write_text("def compute(a, b):\n    result = a + b\n    return result\n", encoding="utf-8")
        patch = extract_pure_assignment(self.root, "sample.py", "compute", 2, "_sum")
        self.assertIn("def _sum(a, b):", patch.proposed_bytes.decode())
        (self.root / "sample.py").write_text("def compute(a):\n    result = print(a)\n    return result\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "side effects"):
            extract_pure_assignment(self.root, "sample.py", "compute", 2, "_sum")

    def test_bounded_module_group_moves_and_rolls_back(self):
        (self.root / "pkg").mkdir()
        (self.root / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "pkg" / "one.py").write_text("from pkg.two import two\ndef one():\n    return two()\n", encoding="utf-8")
        (self.root / "pkg" / "two.py").write_text("def two():\n    return 2\n", encoding="utf-8")
        (self.root / "consumer.py").write_text("from pkg.one import one\n", encoding="utf-8")
        preview = self.service.generate_verified("module_move", "pkg/one.py", {"moves": [
            {"source": "pkg/one.py", "destination": "pkg/one_new.py"},
            {"source": "pkg/two.py", "destination": "pkg/two_new.py"}]})
        self.assertEqual(len(preview["files"]), 3)
        self._apply(preview)
        self.assertIn("from pkg.two_new import two", (self.root / "pkg" / "one_new.py").read_text())
        self.assertIn("from pkg.one_new import one", (self.root / "consumer.py").read_text())
        self.service.rollback(preview["id"])
        self.assertFalse((self.root / "pkg" / "one_new.py").exists())
        self.assertFalse((self.root / "pkg" / "two_new.py").exists())
        self.assertIn("from pkg.two import two", (self.root / "pkg" / "one.py").read_text())

    def test_dry_run_rejects_unresolved_local_import_and_duplicate_symbol(self):
        (self.root / "pkg").mkdir()
        (self.root / "pkg" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "sample.py").write_text("x = 1\n", encoding="utf-8")
        preview = self.service.generate("selection", "sample.py", start_line=1, end_line=1,
            transformation="replace_range", replacement="from pkg.missing import thing\n")
        selected = ["sample.py:h1"]
        self.assertFalse(self.service.validate(preview["id"], selected)["success"])
        preview = self.service.generate("selection", "sample.py", start_line=1, end_line=1,
            transformation="replace_range", replacement="def same(): pass\ndef same(): pass\n")
        self.assertFalse(self.service.validate(preview["id"], selected)["success"])


if __name__ == "__main__": unittest.main()
