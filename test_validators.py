import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from validators import ValidatorService
from validators.models import ValidatorCommand
from validators.runner import run
from validators.security import redact_output, safe_command, safe_directory, sanitized_environment


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "requirements.txt").write_text("flask\nruff\n", encoding="utf-8")
        (self.root / "test_sample.py").write_text(
            "import unittest\nclass T(unittest.TestCase):\n    def test_ok(self):\n        self.assertTrue(True)\n", encoding="utf-8")
        self.service = ValidatorService(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_python_detection_and_default_untrusted(self):
        profile = self.service.profile()["profile"]
        self.assertIn("Python", profile["detected_stack"])
        self.assertIn("Flask", profile["detected_stack"])
        self.assertEqual(profile["trust_scope"], "untrusted")
        self.assertTrue(any(item["label"] == "unittest discovery" for item in profile["commands"]))
        with self.assertRaisesRegex(ValueError, "untrusted"):
            self.service.run([".:unittest"])

    def test_package_scripts_and_stack(self):
        (self.root / "requirements.txt").write_text("pytest\nflask\nruff\n", encoding="utf-8")
        (self.root / "frontend").mkdir()
        (self.root / "frontend" / "package.json").write_text(
            '{"scripts":{"test":"vitest run","build":"tsc && vite build","unsafe":"curl http://x"},'
            '"dependencies":{"react":"1","vite":"1"},"devDependencies":{"typescript":"1"}}', encoding="utf-8")
        profile = self.service.detect()["profile"]
        self.assertTrue({"Node.js", "React", "Vite", "TypeScript"} <= set(profile["detected_stack"]))
        self.assertIn("frontend:test", {item["id"] for item in profile["commands"]})
        self.assertNotIn("frontend:unsafe", {item["id"] for item in profile["commands"]})

    def test_trust_once_consumed_and_history(self):
        command_id = ".:unittest"
        self.service.trust("trusted_once", [command_id], confirm=True)
        self.assertEqual(self.service.profile()["profile"]["trust_scope"], "trusted_once")
        result = self.service.run([command_id], paths=["test_sample.py"])["results"][0]
        self.assertEqual(result["state"], "PASSED")
        self.assertEqual(self.service.profile()["profile"]["trust_scope"], "untrusted")
        self.assertEqual(self.service.history()["history"][0]["paths"], ["test_sample.py"])
        with self.assertRaisesRegex(ValueError, "untrusted"):
            self.service.run([command_id])

    def test_repo_trust_invalidates_on_manifest_change(self):
        self.service.trust("trusted_repo", [".:unittest"], confirm=True)
        self.assertEqual(self.service.profile()["profile"]["trust_scope"], "trusted_repo")
        (self.root / "requirements.txt").write_text("flask\nruff\nmypy\n", encoding="utf-8")
        self.assertEqual(self.service.profile()["profile"]["trust_scope"], "untrusted")

    def test_security_rejections_and_env(self):
        for argv in (["curl", "x"], ["npm", "publish"], ["git", "push"],
                     ["python", "-m", "pytest; shutdown"], ["npm", "test", "&&", "rm"]):
            with self.subTest(argv=argv), self.assertRaises(ValueError): safe_command(argv)
        with self.assertRaises(ValueError): safe_directory(self.root, "../outside")
        env = sanitized_environment({"PATH": "safe", "OPENAI_API_KEY": "secret", "AWS_KEY": "secret", "DATABASE_URL": "secret"})
        self.assertEqual(env, {"PATH": "safe"})
        self.assertNotIn("secretvalue", redact_output("API_KEY=secretvalue"))
        (self.root / "test_env.py").write_text(
            "import os, unittest\nclass T(unittest.TestCase):\n def test_env(self):\n"
            "  self.assertIsNone(os.getenv('OPENAI_API_KEY'))\n", encoding="utf-8")
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret-value"}):
            result = run(self.root, ValidatorCommand("env", "test", "environment",
                ["python", "-m", "unittest", "test_env"], ".", "fixture", "HIGH"))
        self.assertEqual(result["state"], "PASSED")

    def test_timeout_and_output_cap(self):
        (self.root / "test_slow.py").write_text(
            "import time, unittest\nclass T(unittest.TestCase):\n def test_slow(self):\n  time.sleep(3)\n", encoding="utf-8")
        slow = ValidatorCommand("slow", "test", "slow", ["python", "-m", "unittest", "test_slow"], ".", "fixture", "HIGH", 1, 1)
        self.assertEqual(run(self.root, slow)["state"], "TIMEOUT")
        (self.root / "test_loud.py").write_text(
            "import unittest\nclass T(unittest.TestCase):\n def test_loud(self):\n  print('A'*10000)\n", encoding="utf-8")
        loud = ValidatorCommand("loud", "test", "loud", ["python", "-m", "unittest", "test_loud"], ".", "fixture", "HIGH", 5, 1)
        self.assertLessEqual(len(run(self.root, loud)["output_summary"]), 1100)

    def test_targeted_recommendations(self):
        profile = self.service.profile()["profile"]
        recommendation = self.service.recommended(["sample.py"], [{"file": "test_sample.py"}])
        self.assertIn(".:unittest", recommendation["recommended_command_ids"])
        self.assertEqual(recommendation["affected_tests"], [{"file": "test_sample.py"}])
        self.assertEqual(recommendation["graph"][0]["name"], "Patch")

    def test_validator_api_profile_trust_run_and_history(self):
        from web_app import app
        with patch.dict(os.environ, {"PATCH_LOCAL_ROOT": str(self.root), "PATCH_REPOSITORY": "fixture/repo"}):
            client = app.test_client()
            profile = client.get("/api/validators/profile?repo_url=fixture/repo")
            self.assertEqual(profile.status_code, 200)
            self.assertEqual(profile.json["profile"]["trust_scope"], "untrusted")
            rejected = client.post("/api/validators/run", json={"repo_url": "fixture/repo", "command_ids": [".:unittest"]})
            self.assertEqual(rejected.status_code, 400)
            trust = client.post("/api/validators/trust", json={"repo_url": "fixture/repo", "scope": "trusted_once",
                "command_ids": [".:unittest"], "confirm_trust": True})
            self.assertEqual(trust.status_code, 200)
            ran = client.post("/api/validators/run", json={"repo_url": "fixture/repo", "command_ids": [".:unittest"],
                "paths": ["test_sample.py"]})
            self.assertEqual(ran.status_code, 200)
            self.assertEqual(ran.json["results"][0]["state"], "PASSED")
            self.assertEqual(client.get("/api/validators/history?repo_url=fixture/repo").json["history"][0]["state"], "PASSED")


if __name__ == "__main__": unittest.main()
