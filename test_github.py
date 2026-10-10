"""Offline GitHub client resilience tests; direct execution retains the manual smoke."""

import unittest
from unittest.mock import Mock, patch

from github_client import _safe_get, get_repo_info, get_tree
from analyzer import detect_tech_stack, summarize_folders, pick_key_files


class GitHubResilienceTests(unittest.TestCase):
    @patch("github_client.time.sleep")
    @patch("github_client.requests.get")
    def test_retries_transient_get_once(self, get, sleep):
        get.side_effect = [Mock(status_code=503), Mock(status_code=200)]
        response = _safe_get("https://api.github.com/repos/owner/repo", timeout=5)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(get.call_count, 2)
        sleep.assert_called_once()

    @patch("github_client.time.sleep")
    @patch("github_client.requests.get")
    def test_never_retries_client_errors(self, get, sleep):
        get.return_value = Mock(status_code=403)
        self.assertEqual(_safe_get("https://api.github.com/repos/owner/repo", timeout=5).status_code, 403)
        get.assert_called_once()
        sleep.assert_not_called()


def manual_smoke():
    owner = "AKshay1376"
    repo = "plant-disease-detector"
    info = get_repo_info(owner, repo)
    files = get_tree(owner, repo, info["default_branch"])
    print("\n=== TECH STACK ===")
    print(detect_tech_stack(files))
    print("\n=== FOLDER SUMMARY ===")
    for folder, names in summarize_folders(files).items():
        print(folder, ":", names)
    print("\n=== KEY FILES ===")
    for file in pick_key_files(files):
        print(file)


if __name__ == "__main__":
    manual_smoke()
