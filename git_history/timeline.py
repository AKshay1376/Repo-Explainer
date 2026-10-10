"""Bounded commit timeline queries and filtering."""

import re

from .models import DEFAULT_LIMIT, MAX_LIMIT, MAX_SCAN
from .parser import FORMAT, parse_log
from .repository import GitHistoryError


DATE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?)?$")
BRANCH = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./-]{0,100}$")


def log_commits(git, *, limit=DEFAULT_LIMIT, offset=0, path=None, since=None,
                until=None, author=None, merge=None, branch=None, follow=False):
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_LIMIT:
        raise GitHistoryError("Limit must be between 1 and 200.")
    if not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= 10_000:
        raise GitHistoryError("Offset must be between 0 and 10,000.")
    args = ["log", f"--format={FORMAT}", "--numstat", "-z", "-M"]
    for name, value in (("since", since), ("until", until)):
        if value is not None:
            if not isinstance(value, str) or not DATE.fullmatch(value):
                raise GitHistoryError(f"Invalid {name} date.")
            if len(value) == 10:
                value += "T00:00:00" if name == "since" else "T23:59:59"
            args.append(f"--{name}={value}")
    if merge is True:
        args.append("--merges")
    elif merge is False:
        args.append("--no-merges")
    if path:
        git.require_path(path)
        if follow:
            args.append("--follow")
    if branch:
        if not isinstance(branch, str) or not BRANCH.fullmatch(branch) or ".." in branch:
            raise GitHistoryError("Invalid branch.")
        known = set(git.text("branch", "--format=%(refname:short)").splitlines())
        if branch not in known:
            raise GitHistoryError("Branch is unavailable locally.")
        args.append(branch)
    else:
        args.append("HEAD")
    filtered = bool(author)
    if author is not None and (not isinstance(author, str) or len(author) > 100):
        raise GitHistoryError("Invalid author filter.")
    scan = min(MAX_SCAN, limit + offset + 1) if filtered else limit + 1
    # Post-filter author names to avoid Git regex semantics and email disclosure.
    if filtered:
        scan = MAX_SCAN
    args.extend(["-n", str(scan)])
    if not filtered:
        args.extend(["--skip", str(offset)])
    if path:
        args.extend(["--", path])
    commits = parse_log(git.run(*args, timeout=25))
    if filtered:
        commits = [item for item in commits if author.casefold() in item["author_name"].casefold()]
        commits = commits[offset:offset + limit + 1]
    has_more = len(commits) > limit
    return {"commits": commits[:limit], "limit": limit, "offset": offset, "has_more": has_more,
            "partial": bool(filtered and scan == MAX_SCAN), "llm_calls": 0}
