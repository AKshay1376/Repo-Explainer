"""Measure a deterministic cached analysis path without GitHub or AI calls."""

import json
import os
from pathlib import Path
import statistics
import tempfile
import time
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    with tempfile.TemporaryDirectory() as root:
        os.environ["APP_ENV"] = "local"
        os.environ["REPO_EXPLAINER_DB_PATH"] = str(Path(root) / "repo.db")
        from cache_manager import set_cached_analysis
        from web_app import app

        payload = {
            "success": True, "info": {"name": "repo", "default_branch": "main"},
            "repository_model": {"metadata": {"owner": "fixture", "repo": "repo",
                                               "latest_commit_sha": "abcdef0123456"}, "files": {}},
        }
        set_cached_analysis("fixture", "repo", payload)
        client = app.test_client()
        samples = []
        for _ in range(3):
            started = time.perf_counter()
            response = client.post("/api/analyze", json={"url": "fixture/repo"})
            assert response.status_code == 200
            samples.append((time.perf_counter() - started) * 1000)
        print(json.dumps({"cached_analyze_median_ms": round(statistics.median(samples), 2),
                          "samples": len(samples)}))


if __name__ == "__main__":
    main()
