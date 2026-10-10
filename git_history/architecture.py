"""Sampled file and directory evolution; no full historical code reanalysis."""

from datetime import datetime, timedelta, timezone


def _tree(git, sha):
    data = git.run("ls-tree", "-r", "--name-only", "-z", sha, timeout=20, max_bytes=3_000_000)
    return {entry.decode("utf-8", "replace") for entry in data.split(b"\x00") if entry}


def evolution(git, head, *, days=(7, 30, 90)):
    current = _tree(git, head)
    checkpoints = []
    now = datetime.now(timezone.utc)
    for day in days:
        date = (now - timedelta(days=day)).isoformat()
        sha = git.text("rev-list", "-1", f"--before={date}", head).strip()
        if not sha:
            checkpoints.append({"days_ago": day, "available": False})
            continue
        previous = _tree(git, sha)
        added = sorted(current - previous)
        removed = sorted(previous - current)
        checkpoints.append({"days_ago": day, "available": True, "sha": sha,
                            "files_before": len(previous), "files_now": len(current),
                            "files_added": len(added), "files_removed": len(removed),
                            "sample_added": added[:20], "sample_removed": removed[:20],
                            "directories_before": len({path.rsplit("/", 1)[0] for path in previous if "/" in path}),
                            "directories_now": len({path.rsplit("/", 1)[0] for path in current if "/" in path})})
    return {"head": head, "checkpoints": checkpoints, "method": "Git tree samples at HEAD and 7/30/90-day checkpoints; no dependency or route counts inferred.", "llm_calls": 0}
