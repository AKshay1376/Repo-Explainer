"""Observed temporal coupling without asserting semantic dependencies."""

from collections import Counter
from itertools import combinations

from security import is_sensitive_file


def cochanges(commits, model=None, *, limit=50):
    touches = Counter()
    pairs = Counter()
    for commit in commits:
        files = sorted({item["path"] for item in commit.get("files", []) if not is_sensitive_file(item["path"])})
        if len(files) > 30:
            continue  # Bulk formatting or generated updates are weak coupling evidence.
        touches.update(files)
        pairs.update(combinations(files, 2))
    graph = {(item.get("source"), item.get("target")) for item in (model or {}).get("dependencies", [])}
    result = []
    for (left, right), shared in pairs.items():
        if shared < 2:
            continue
        ratio = round(shared / min(touches[left], touches[right]), 3)
        result.append({"files": [left, right], "shared_commits": shared,
                       "cochange_ratio": ratio, "confidence": "HIGH" if shared >= 4 and ratio >= 0.6 else "MEDIUM" if ratio >= 0.4 else "LOW",
                       "structurally_coupled": (left, right) in graph or (right, left) in graph,
                       "temporal_only": (left, right) not in graph and (right, left) not in graph})
    result.sort(key=lambda item: (-item["shared_commits"], -item["cochange_ratio"], item["files"]))
    return result[:limit]
