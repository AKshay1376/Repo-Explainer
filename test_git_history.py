"""Phase 15 history tests use only disposable local repositories."""

import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from git_history import GitHistoryService
from git_history.repository import GitHistoryError
from project_health import ProjectHealthService
from web_app import app


def git(root, *args, author=None, date=None):
    env = os.environ.copy()
    if author:
        env.update(GIT_AUTHOR_NAME=author[0], GIT_AUTHOR_EMAIL=author[1],
                   GIT_COMMITTER_NAME=author[0], GIT_COMMITTER_EMAIL=author[1])
    if date:
        env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
    result = subprocess.run(["git", "-C", str(root), *args], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return result.stdout.decode("utf-8", "replace").strip()


class GitHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "fixture"
        self.root.mkdir()
        git(self.root, "init", "-q", "-b", "main")
        git(self.root, "config", "user.name", "Fixture")
        git(self.root, "config", "user.email", "fixture@example.test")
        git(self.root, "remote", "add", "origin", "https://github.com/owner/repo.git")
        self.commits = []

        def commit(message, author, date):
            git(self.root, "add", "-A")
            git(self.root, "commit", "-q", "-m", message, author=author, date=date)
            self.commits.append(git(self.root, "rev-parse", "HEAD"))

        (self.root / "a.py").write_text("def useful():\n    return 1\n", encoding="utf-8")
        (self.root / "b.py").write_text("def other():\n    return 2\n", encoding="utf-8")
        commit("Create two modules", ("Ada", "ada@example.test"), "2020-01-01T12:00:00+00:00")
        (self.root / "a.py").write_text("def useful():\n    return 3\n", encoding="utf-8")
        (self.root / "b.py").write_text("def other():\n    return 4\n", encoding="utf-8")
        commit("Change two modules", ("Ben", "ben@example.test"), "2020-01-02T12:00:00+00:00")
        (self.root / "src").mkdir()
        git(self.root, "mv", "a.py", "src/core.py")
        (self.root / "b.py").write_text("def other():\n    return 5\n", encoding="utf-8")
        commit("Move core module", ("Ada", "ada@example.test"), "2020-01-03T12:00:00+00:00")
        (self.root / "src/core.py").write_text("def useful():\n    return 6\n", encoding="utf-8")
        (self.root / "b.py").write_text("def other():\n    return 7\n", encoding="utf-8")
        commit("Change core and companion", ("Ben", "ben@example.test"), "2020-01-04T12:00:00+00:00")
        (self.root / "c.py").write_text("def fresh():\n    return 8\n", encoding="utf-8")
        (self.root / "b.py").unlink()
        commit("Replace companion", ("Ada", "ada@example.test"), "2026-10-10T12:00:00+00:00")
        self.service = GitHistoryService(self.root)
        self.model = {"metadata": {"owner": "owner", "repo": "repo", "latest_commit_sha": self.commits[-1]},
                      "files": {"src/core.py": {"size": 30, "dependents": ["c.py"]},
                                "c.py": {"size": 30, "dependents": []}},
                      "dependencies": [{"source": "c.py", "target": "src/core.py"}]}

    def test_status_and_non_git_fallback(self):
        state = self.service.status("owner", "repo")
        self.assertTrue(state["available"])
        self.assertEqual(state["head"], self.commits[-1])
        self.assertEqual(state["commit_depth"], 5)
        self.assertFalse(state["shallow"])
        self.assertFalse(state["dirty"])
        self.assertEqual(state["branch"], "main")
        self.assertNotIn("origin", state)
        git(self.root, "remote", "set-url", "origin", "https://fixture-secret@github.com/owner/repo.git")
        self.assertTrue(self.service.status("owner", "repo")["available"])
        self.assertNotIn("fixture-secret", str(self.service.status("owner", "repo")))
        self.assertFalse(GitHistoryService(self.temp.name).status()["available"])
        self.assertFalse(self.service.status("other", "repo")["available"])

    def test_timeline_parsing_pagination_and_privacy(self):
        first = self.service.timeline(limit=2)
        next_page = self.service.timeline(limit=2, offset=2)
        self.assertEqual(len(first["commits"]), 2)
        self.assertTrue(first["has_more"])
        self.assertEqual(next_page["commits"][0]["sha"], self.commits[2])
        self.assertEqual(first["commits"][0]["files_changed"], 2)
        self.assertEqual(first["commits"][0]["author_name"], "Ada")
        self.assertNotIn("ada@example.test", str(first))
        self.assertEqual(len(self.service.timeline(limit=10, author="ben")["commits"]), 2)
        self.assertEqual(len(self.service.timeline(limit=10, path="src/core.py")["commits"]), 2)
        self.assertEqual(len(self.service.timeline(limit=10, merge=False)["commits"]), 5)
        self.assertEqual(len(self.service.timeline(limit=10, since="2020-01-04")["commits"]), 2)
        self.assertEqual(len(self.service.timeline(limit=10, branch="main")["commits"]), 5)
        with self.assertRaises(GitHistoryError):
            self.service.timeline(limit=201)

    def test_file_history_rename_churn_and_contributors(self):
        result = self.service.file("src/core.py")
        self.assertEqual(result["total_commits"], 4)
        self.assertEqual(result["first_known_commit"], self.commits[0])
        self.assertEqual(result["latest_commit"], self.commits[3])
        self.assertTrue(any(item["from"] == "a.py" and item["to"] == "src/core.py" for item in result["rename_history"]))
        self.assertEqual(sum(item["commit_count"] for item in result["contributors"]), 4)
        self.assertEqual(result["total_churn"], result["additions"] + result["deletions"])
        self.assertNotIn("example.test", str(result))

    def test_hotspot_confidence_cochange_and_cache(self):
        first = self.service.hotspots("owner", "repo", self.model, scan=5)
        second = self.service.hotspots("owner", "repo", self.model, scan=5)
        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertEqual(first["weights"], {"churn": 35, "frequency": 25, "centrality": 20, "maintainability": 20})
        self.assertTrue(all(0 <= item["score"] <= 100 for item in first["hotspots"]))
        pairs = self.service.cochange(self.model, scan=5)["pairs"]
        self.assertTrue(any(item["shared_commits"] >= 2 for item in pairs))
        self.assertTrue(all(0 <= item["cochange_ratio"] <= 1 for item in pairs))

    def test_blame_diff_rename_comparison_and_historical_source(self):
        blame = self.service.blame(self.commits[3], "src/core.py", 1, 2)
        self.assertEqual(len(blame["lines"]), 2)
        self.assertTrue(all(item.get("sha") and item.get("author_name") for item in blame["lines"]))
        moved = self.service.compare(None, self.commits[2])
        self.assertTrue(any(item["status"] == "R" and item["old_path"] == "a.py" for item in moved["files"]))
        self.assertEqual(self.service.compare(None, self.commits[0])["files_changed"], 2)
        compared = self.service.compare(self.commits[1], self.commits[3])
        self.assertGreaterEqual(compared["files_changed"], 1)
        old = self.service.source(self.commits[1], "a.py")
        self.assertTrue(old["read_only"])
        self.assertIn("return 3", old["file"]["content"])
        detail = self.service.commit(self.commits[3], self.model)
        self.assertEqual(detail["impact"]["label"], "Current-architecture impact estimate")

    def test_invalid_sha_path_sensitive_history_and_source_redaction(self):
        with self.assertRaises(GitHistoryError):
            self.service.source("--exec=oops", "a.py")
        with self.assertRaises(GitHistoryError):
            self.service.source(self.commits[0], "../a.py")
        with self.assertRaises(GitHistoryError):
            self.service.file("tokens.txt")
        (self.root / "config.py").write_text("password = 'private-fixture-value'\n", encoding="utf-8")
        git(self.root, "add", "config.py")
        git(self.root, "commit", "-q", "-m", "Add config")
        result = self.service.source(git(self.root, "rev-parse", "HEAD"), "config.py")
        self.assertTrue(result["file"]["redacted"])
        self.assertNotIn("private-fixture-value", str(result))

    def test_evolution_and_head_cache_invalidation(self):
        evolution = self.service.evolution()
        self.assertTrue(evolution["checkpoints"])
        self.assertTrue(any(item["available"] for item in evolution["checkpoints"]))
        before = self.service.timeline(limit=1)
        (self.root / "new.py").write_text("VALUE = 1\n", encoding="utf-8")
        git(self.root, "add", "new.py")
        git(self.root, "commit", "-q", "-m", "New head")
        after = self.service.timeline(limit=1)
        self.assertNotEqual(before["commits"][0]["sha"], after["commits"][0]["sha"])
        self.assertFalse(after["cached"])

    def test_shallow_clone_detection(self):
        shallow = Path(self.temp.name) / "shallow"
        subprocess.run(["git", "clone", "-q", "--depth", "1", self.root.as_uri(), str(shallow)],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        state = GitHistoryService(shallow).status()
        self.assertTrue(state["available"])
        self.assertTrue(state["shallow"])
        self.assertEqual(state["commit_depth"], 1)

    def test_current_impact_bridge_and_health_signal_scope(self):
        impact = Mock()
        impact.analyze_impact.return_value = {"success": True, "analysis": {
            "risk_level": "MEDIUM", "summary": "One current dependent", "blast_radius": {"total_affected": 1},
            "affected_tests": [], "affected_routes": [], "affected_models": []}}
        detail = GitHistoryService(self.root, impact_service=impact).commit(self.commits[3], self.model)
        self.assertTrue(any(item["file"] == "src/core.py" for item in detail["impact"]["files"]))
        self.assertTrue(impact.analyze_impact.called)
        signals = {"head": self.commits[-1], "sampled_commits": 5,
                   "unstable_central_files": [{"path": "src/core.py", "score": 63, "commits": 4,
                                               "factors": {"centrality": 10, "maintainability": 10}}]}
        health = ProjectHealthService()
        baseline = health.analyze("owner", "repo", self.model)
        informed = health.analyze("owner", "repo", self.model, signals)
        self.assertTrue(any(item["source"] == "Git History + RepositoryModel" for item in informed["findings"]))
        self.assertEqual(baseline["dimensions"]["Security"]["score"], informed["dimensions"]["Security"]["score"])

    def test_history_endpoints_and_missing_checkout(self):
        client = app.test_client()
        with patch.dict(os.environ, {"HISTORY_LOCAL_ROOT": str(self.root)}):
            status = client.get("/api/history/status?repo_url=owner/repo")
            self.assertTrue(status.json["available"])
            self.assertFalse(client.get("/api/history/status").json["available"])
            timeline = client.post("/api/history/commits", json={"repo_url": "owner/repo", "limit": 2})
            self.assertEqual(timeline.status_code, 200)
            self.assertEqual(len(timeline.json["commits"]), 2)
            self.assertEqual(client.post("/api/history/source", json={"repo_url": "owner/repo", "sha": self.commits[1], "path": "a.py"}).status_code, 200)
            self.assertEqual(client.post("/api/history/compare", json={"repo_url": "owner/repo", "after": self.commits[2]}).status_code, 200)
            self.assertEqual(client.post("/api/history/file", json={"repo_url": "owner/repo", "path": "src/core.py"}).status_code, 200)
            self.assertEqual(client.post("/api/history/hotspots", json={"repo_url": "owner/repo", "scan": 5}).status_code, 200)
            self.assertEqual(client.post("/api/history/cochange", json={"repo_url": "owner/repo", "scan": 5}).status_code, 200)
            self.assertEqual(client.post("/api/history/commit", json={"repo_url": "owner/repo", "sha": self.commits[3]}).status_code, 200)
            self.assertEqual(client.post("/api/history/blame", json={"repo_url": "owner/repo", "sha": self.commits[3], "path": "src/core.py", "start": 1, "end": 2}).status_code, 200)
            self.assertEqual(client.post("/api/history/evolution", json={"repo_url": "owner/repo"}).status_code, 200)
            rejected = client.post("/api/history/source", json={"repo_url": "owner/repo", "sha": self.commits[1], "path": "../a.py"})
            self.assertEqual(rejected.status_code, 400)
        with patch.dict(os.environ, {"HISTORY_LOCAL_ROOT": str(Path(self.temp.name) / "missing")}):
            self.assertFalse(client.get("/api/history/status?repo_url=owner/repo").json["available"])

    def test_bounded_scan_performance(self):
        started = time.perf_counter()
        first = self.service.hotspots("owner", "repo", self.model, scan=5)
        first_elapsed = time.perf_counter() - started
        started = time.perf_counter()
        second = self.service.hotspots("owner", "repo", self.model, scan=5)
        cached_elapsed = time.perf_counter() - started
        self.assertEqual(first["sampled_commits"], 5)
        self.assertTrue(second["cached"])
        self.assertLess(first_elapsed, 10)
        self.assertLess(cached_elapsed, first_elapsed)


if __name__ == "__main__":
    unittest.main()
