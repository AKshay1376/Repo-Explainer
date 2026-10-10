"""Read-only commit comparisons with Git-confirmed rename detection."""

from .models import MAX_DIFF_BYTES
from .parser import parse_name_status, parse_numstat
from .repository import GitHistoryError
from security import is_sensitive_file, sanitize_content


def compare(git, before, after, *, path=None, include_patch=True):
    after = git.require_commit(after)
    if before:
        before = git.require_commit(before)
        base = [before, after]
    else:
        parents = git.text("rev-list", "--parents", "-n", "1", after).strip().split()
        before = parents[1] if len(parents) > 1 else None
        base = [before, after] if before else None
    if path:
        git.require_path(path)
    if base:
        args = ["diff", "--no-ext-diff", "-M", "--name-status", "-z", *base]
        stat_args = ["diff", "--no-ext-diff", "-M", "--numstat", "-z", *base]
    else:
        args = ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--name-status", "-z", after]
        stat_args = ["diff-tree", "--root", "--no-commit-id", "-r", "-M", "--numstat", "-z", after]
    if path:
        args += ["--", path]
        stat_args += ["--", path]
    changes = parse_name_status(git.run(*args, timeout=20))
    stats = parse_numstat(git.run(*stat_args, timeout=20))
    lookup = {item["path"]: item for item in stats}
    files = []
    budget = MAX_DIFF_BYTES
    truncated = len(changes) > 30
    for item in changes[:30]:
        path_name = item["path"]
        numbers = lookup.get(path_name, {})
        file_data = {**item, "additions": numbers.get("additions", 0), "deletions": numbers.get("deletions", 0),
                     "binary": numbers.get("binary", False), "diff": "", "diff_truncated": False}
        if is_sensitive_file(path_name) or (item.get("old_path") and is_sensitive_file(item["old_path"])):
            file_data["redacted"] = True
            files.append(file_data)
            continue
        if include_patch and budget > 0 and not file_data["binary"]:
            # Root commits use git show, which emits the same unified format.
            diff_args = (["diff", "--no-ext-diff", "--no-color", "--unified=3", "-M", *base]
                         if base else ["show", "--format=", "--no-ext-diff", "--no-color", "--unified=3", after])
            diff_args += ["--", path_name]
            try:
                raw = git.run(*diff_args, timeout=15, max_bytes=MAX_DIFF_BYTES + 1).decode("utf-8", "replace")
                safe = sanitize_content(path_name, raw)
                if safe is not None:
                    encoded = safe.encode("utf-8")
                    file_data["diff"] = encoded[:budget].decode("utf-8", "ignore")
                    file_data["diff_truncated"] = len(encoded) > budget
                    budget -= len(file_data["diff"].encode("utf-8"))
            except GitHistoryError:
                file_data["diff_truncated"] = True
                truncated = True
        files.append(file_data)
    return {"before": before, "after": after, "files": files,
            "files_changed": len(changes), "insertions": sum(item.get("additions", 0) for item in stats),
            "deletions": sum(item.get("deletions", 0) for item in stats), "truncated": truncated,
            "read_only": True, "llm_calls": 0}
