"""
test_performance_and_cache.py
Unit tests covering Phase 2 improvements:
- Concurrent file fetching with ThreadPoolExecutor & error resilience
- Server-side TTL caching (repo info, tree, and analysis payloads)
- API rate limiting with structured 429 JSON response
"""

import time
import unittest
from unittest.mock import patch, MagicMock

import cache_manager
from github_client import get_files_content_parallel
from web_app import app


class TestParallelFileFetching(unittest.TestCase):

    @patch("github_client.get_file_content")
    def test_parallel_fetching_preserves_order(self, mock_get_content):
        # Mock responses
        def side_effect(owner, repo, path, branch=None):
            return f"content of {path}"
        mock_get_content.side_effect = side_effect

        paths = ["src/c.py", "src/a.py", "src/b.py", "README.md"]
        results = get_files_content_parallel("owner", "repo", paths, branch="main", max_workers=3)

        # Ordering must match input paths
        self.assertEqual(list(results.keys()), paths)
        for p in paths:
            self.assertEqual(results[p], f"content of {p}")

    @patch("github_client.get_file_content")
    def test_parallel_fetching_tolerates_individual_failures(self, mock_get_content):
        def side_effect(owner, repo, path, branch=None):
            if path == "failing.py":
                raise ValueError("File not found or decode error")
            return f"valid content of {path}"
        mock_get_content.side_effect = side_effect

        paths = ["valid1.py", "failing.py", "valid2.py"]
        results = get_files_content_parallel("owner", "repo", paths, branch="main", max_workers=2)

        # failing.py skipped, others preserved in order
        self.assertIn("valid1.py", results)
        self.assertIn("valid2.py", results)
        self.assertNotIn("failing.py", results)
        self.assertEqual(list(results.keys()), ["valid1.py", "valid2.py"])

    @patch("github_client.get_file_content")
    def test_parallel_fetching_deduplicates_paths(self, mock_get_content):
        mock_get_content.return_value = "content"
        paths = ["dup.py", "dup.py", "other.py", "dup.py"]
        results = get_files_content_parallel("owner", "repo", paths, branch="main", max_workers=2)

        self.assertEqual(list(results.keys()), ["dup.py", "other.py"])
        # get_file_content called only twice (once for dup.py, once for other.py)
        self.assertEqual(mock_get_content.call_count, 2)


class TestCacheManager(unittest.TestCase):

    def setUp(self):
        cache_manager.clear_cache()

    def tearDown(self):
        cache_manager.clear_cache()

    def test_repo_info_caching(self):
        self.assertIsNone(cache_manager.get_cached_repo_info("Owner", "Repo"))
        info = {"name": "Repo", "stars": 42}
        cache_manager.set_cached_repo_info("Owner", "Repo", info)

        # Case-insensitive lookup
        cached = cache_manager.get_cached_repo_info("owner", "repo")
        self.assertEqual(cached, info)

    def test_tree_caching(self):
        self.assertIsNone(cache_manager.get_cached_tree("Owner", "Repo", "main"))
        tree = ["file1.py", "file2.py"]
        cache_manager.set_cached_tree("owner", "repo", "main", tree)

        cached = cache_manager.get_cached_tree("OWNER", "REPO", "main")
        self.assertEqual(cached, tree)

    def test_analysis_caching_and_error_exclusion(self):
        # Successful payload gets cached
        payload = {"success": True, "report": "All good"}
        cache_manager.set_cached_analysis("Owner", "Repo", payload)
        self.assertEqual(cache_manager.get_cached_analysis("owner", "repo"), payload)

        # Failed payload must NOT be cached
        failed_payload = {"success": False, "error": "Something went wrong"}
        cache_manager.set_cached_analysis("Owner", "FailedRepo", failed_payload)
        self.assertIsNone(cache_manager.get_cached_analysis("Owner", "FailedRepo"))

    def test_cache_stats(self):
        cache_manager.set_cached_repo_info("o", "r1", {"a": 1})
        cache_manager.set_cached_tree("o", "r1", "main", ["f.py"])
        cache_manager.set_cached_analysis("o", "r1", {"success": True})

        stats = cache_manager.get_cache_stats()
        self.assertTrue(stats["enabled"])
        self.assertEqual(stats["repo_info_count"], 1)
        self.assertEqual(stats["tree_count"], 1)
        self.assertEqual(stats["analysis_count"], 1)


class TestWebAppAndRateLimiter(unittest.TestCase):

    def setUp(self):
        cache_manager.clear_cache()
        self.client = app.test_client()

    def test_health_check_endpoint(self):
        with patch("web_app.verify_github_auth") as mock_auth:
            mock_auth.return_value = {
                "has_token": True,
                "auth_status": "SUCCESS",
                "limit": 5000,
                "remaining": 4990,
            }
            resp = self.client.get("/api/health")
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data["status"], "ok")
            self.assertIn("cache", data)
            self.assertEqual(data["github"]["auth_status"], "SUCCESS")

    def test_cached_analysis_served_directly(self):
        cached_data = {
            "success": True,
            "info": {"name": "test-repo"},
            "tech_stack": ["Python"],
            "detected_technologies": [],
            "folder_summary": {},
            "key_files": [],
            "report": "Cached report content"
        }
        cache_manager.set_cached_analysis("testowner", "testrepo", cached_data)

        with patch("web_app.analyze_repository") as mock_analyze:
            resp = self.client.post("/api/analyze", json={"url": "https://github.com/testowner/testrepo"})
            self.assertEqual(resp.status_code, 200)
            data = resp.get_json()
            self.assertEqual(data["report"], "Cached report content")
            # analyze_repository should NOT have been called
            mock_analyze.assert_not_called()

    def test_rate_limiter_returns_429_json(self):
        from rate_limit import limiter
        limiter.reset()

        # Send 10 invalid requests up to limit
        for _ in range(10):
            r = self.client.post("/api/analyze", json={"url": ""})
            self.assertEqual(r.status_code, 400)

        # 11th request must exceed rate limit and return 429 JSON
        resp = self.client.post("/api/analyze", json={"url": ""})
        self.assertEqual(resp.status_code, 429)
        data = resp.get_json()
        self.assertFalse(data["success"])
        self.assertIn("Rate limit exceeded", data["error"])

        limiter.reset()


if __name__ == "__main__":
    unittest.main()
