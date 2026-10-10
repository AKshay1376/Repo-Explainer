"""Cached history queries bound to one configured local Git checkout."""

import hashlib
from collections import Counter

from cachetools import TTLCache

from change_impact import ChangeImpactService
from humanize.service import HumanizeService
from security import is_binary_file, is_sensitive_file, sanitize_content
from source_service import detect_language

from .architecture import evolution
from .churn import file_churn
from .cochange import cochanges
from .diff import compare
from .hotspots import rank_hotspots
from .impact import current_impact
from .models import HOTSPOT_WEIGHTS, MAX_BLAME_LINES, MAX_SOURCE_BYTES
from .ownership import contributors
from .parser import FORMAT, parse_blame, parse_log, parse_name_status
from .repository import GitHistoryError, GitRepository
from .timeline import log_commits


class GitHistoryService:
    def __init__(self, root, *, impact_service=None, humanize_service=None):
        self.git = GitRepository(root)
        self.impact = impact_service or ChangeImpactService()
        self.humanize = humanize_service or HumanizeService(self.impact)
        self.cache = TTLCache(maxsize=80, ttl=900)

    def status(self, owner=None, repo=None):
        state = self.git.status()
        if state["available"] and owner and repo and not self.git.matches_repository(owner, repo):
            return {"available": False, "message": "Local Git origin does not match the analyzed repository."}
        return state

    def _head(self):
        # Cache invalidation only needs HEAD; a full status probe runs several
        # Git commands and would dominate every cached request.
        return self.git.text("rev-parse", "HEAD").strip()

    def _cached(self, name, args, calculate):
        key = (str(self.git.root), self._head(), name, repr(args))
        if key in self.cache:
            return {**self.cache[key], "cached": True}
        result = calculate()
        result["cached"] = False
        self.cache[key] = result
        return result

    def timeline(self, **filters):
        def calculate():
            result = log_commits(self.git, **filters)
            for commit in result["commits"]:
                commit.pop("files", None)  # Timeline stays compact; details are loaded on demand.
            return {"success": True, **result}
        return self._cached("timeline", filters, calculate)

    def _scan(self, limit=200, path=None):
        key = (str(self.git.root), self._head(), "scan", limit, path)
        if key not in self.cache:
            self.cache[key] = log_commits(self.git, limit=min(limit, 200), path=path, follow=bool(path))["commits"]
        return self.cache[key]

    def file(self, path, *, limit=50):
        path = self.git.require_path(path)
        if not isinstance(limit, int) or not 1 <= limit <= 200:
            raise GitHistoryError("Limit must be between 1 and 200.")
        def calculate():
            commits = log_commits(self.git, limit=200, path=path, follow=True)["commits"]
            changes = [change for commit in commits for change in commit["files"]]
            renames = [{"sha": commit["sha"], "from": change["old_path"], "to": change["path"]}
                       for commit in commits for change in commit["files"] if change.get("old_path")]
            metrics = file_churn(commits)
            # --follow may report historical paths after a rename, so summarize
            # the entire traced sequence rather than only the current name.
            total_add = sum(change["additions"] for change in changes)
            total_del = sum(change["deletions"] for change in changes)
            return {"success": True, "path": path, "first_known_commit": commits[-1]["sha"] if commits else None,
                    "latest_commit": commits[0]["sha"] if commits else None,
                    "total_commits": len(commits), "partial": len(commits) == 200,
                    "additions": total_add, "deletions": total_del, "total_churn": total_add + total_del,
                    "rename_history": renames, "contributors": contributors(commits),
                    "recent_commits": [{key: value for key, value in commit.items() if key != "files"} for commit in commits[:limit]],
                    "days_since_last_change": metrics.get(path, {}).get("days_since_last_change"),
                    "llm_calls": 0}
        return self._cached("file", (path, limit), calculate)

    def hotspots(self, owner, repo, model=None, *, scan=200, limit=50):
        if not isinstance(scan, int) or not 1 <= scan <= 200 or not isinstance(limit, int) or not 1 <= limit <= 200:
            raise GitHistoryError("History scan and limit must be between 1 and 200.")
        revision = (model or {}).get("metadata", {}).get("latest_commit_sha")
        def calculate():
            commits = self._scan(scan)
            audit = self.humanize.audit_repository(owner, repo, model, "Balanced") if model and model.get("files") else {}
            churn = file_churn(commits)
            ranked = rank_hotspots(churn, model, audit, limit=limit)
            risky = []
            files = (model or {}).get("files") or {}
            for commit in commits:
                changed = [item["path"] for item in commit["files"]]
                central = sum(min(12, len((files.get(path) or {}).get("dependents") or [])) for path in changed)
                score = min(100, 4 * len(changed) + min(30, (commit["insertions"] + commit["deletions"]) // 50) + min(30, central * 2))
                risky.append({"sha": commit["sha"], "short_sha": commit["short_sha"], "subject": commit["subject"],
                              "score": score, "files_changed": len(changed), "churn": commit["insertions"] + commit["deletions"],
                              "label": "High-change-impact commit" if score >= 60 else "Change impact indicator"})
            risky.sort(key=lambda item: (-item["score"], item["sha"]))
            return {"success": True, "hotspots": ranked, "sampled_commits": len(commits),
                    "weights": HOTSPOT_WEIGHTS, "thresholds": {"Stable": "0–24", "Active": "25–49", "Hotspot": "50–74", "Critical Hotspot": "75–100"},
                    "high_change_impact_commits": risky[:10], "source": "Git activity plus current RepositoryModel and cached Humanize audit",
                    "warnings": ["Scores summarize sampled history; high churn alone does not prove defects."], "llm_calls": 0}
        return self._cached("hotspots", (owner, repo, revision, scan, limit), calculate)

    def cochange(self, model=None, *, scan=200, limit=50):
        if not isinstance(scan, int) or not 1 <= scan <= 200 or not isinstance(limit, int) or not 1 <= limit <= 200:
            raise GitHistoryError("History scan and limit must be between 1 and 200.")
        def calculate():
            commits = self._scan(scan)
            return {"success": True, "pairs": cochanges(commits, model, limit=limit),
                    "sampled_commits": len(commits), "method": "At least two shared commits; mass-change commits over 30 files are excluded.",
                    "llm_calls": 0}
        return self._cached("cochange", (scan, limit, (model or {}).get("metadata", {}).get("latest_commit_sha")), calculate)

    def compare(self, before, after, *, path=None):
        return {"success": True, **compare(self.git, before, after, path=path)}

    def commit(self, sha, model=None):
        sha = self.git.require_commit(sha)
        def calculate():
            raw = self.git.run("show", "-s", f"--format={FORMAT}", "-z", sha)
            metadata = parse_log(raw)
            if metadata:
                refs = self.git.text("for-each-ref", "--points-at", sha, "--format=%(refname)").splitlines()[:100]
                metadata[0]["tags"] = [ref.removeprefix("refs/tags/") for ref in refs if ref.startswith("refs/tags/")]
                metadata[0]["branches"] = [ref.removeprefix("refs/heads/") for ref in refs if ref.startswith("refs/heads/")]
            details = compare(self.git, None, sha)
            paths = [item["path"] for item in details["files"] if item["status"] != "D" and not is_sensitive_file(item["path"])]
            impact = current_impact(model, paths, self.impact) if model else {"label": "Current-architecture impact estimate", "files": []}
            return {"success": True, "commit": metadata[0] if metadata else None, "comparison": details,
                    "impact": impact, "architecture_areas": sorted({path.split("/")[0] for path in paths if "/" in path}),
                    "llm_calls": 0}
        return self._cached("commit", (sha, (model or {}).get("metadata", {}).get("latest_commit_sha")), calculate)

    def source(self, sha, path):
        sha = self.git.require_commit(sha)
        path = self.git.require_path(path)
        if is_binary_file(path):
            raise GitHistoryError("Binary historical source is unavailable.")
        size = int(self.git.text("cat-file", "-s", f"{sha}:{path}").strip())
        if size > MAX_SOURCE_BYTES:
            raise GitHistoryError("Historical source exceeds the 200 KB preview limit.")
        raw = self.git.run("show", f"{sha}:{path}", max_bytes=MAX_SOURCE_BYTES + 1)
        if b"\x00" in raw:
            raise GitHistoryError("Binary historical source is unavailable.")
        content = raw.decode("utf-8", "replace")
        safe = sanitize_content(path, content)
        if safe is None:
            raise GitHistoryError("Sensitive historical source is unavailable.")
        return {"success": True, "read_only": True, "llm_calls": 0,
                "file": {"path": path, "content": safe, "line_count": len(safe.splitlines()),
                         "size": size, "commit_sha": sha, "redacted": safe != content,
                         "is_sensitive": False, "is_binary": False, "is_generated": False,
                         "language": detect_language(path), "warning": "Historical source is read-only; current line mapping is unavailable."}}

    def blame(self, sha, path, start=1, end=20):
        sha = self.git.require_commit(sha)
        path = self.git.require_path(path)
        if not all(isinstance(item, int) and not isinstance(item, bool) for item in (start, end)) or start < 1 or end < start or end - start + 1 > MAX_BLAME_LINES:
            raise GitHistoryError("Blame range must contain 1 to 200 lines.")
        def calculate():
            output = self.git.run("blame", "--line-porcelain", "-L", f"{start},{end}", sha, "--", path,
                                  timeout=20, max_bytes=2_000_000)
            return {"success": True, "path": path, "revision": sha,
                    "lines": parse_blame(output), "llm_calls": 0}
        return self._cached("blame", (sha, path, start, end), calculate)

    def evolution(self):
        return self._cached("evolution", (), lambda: {"success": True, **evolution(self.git, self._head())})

    def health_signals(self, owner, repo, model=None):
        ranked = self.hotspots(owner, repo, model, scan=100, limit=5)
        return {"head": self._head(), "sampled_commits": ranked["sampled_commits"],
                "unstable_central_files": [item for item in ranked["hotspots"] if item["score"] >= 50 and item["factors"]["centrality"] > 0]}
