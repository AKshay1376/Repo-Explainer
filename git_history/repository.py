"""Bounded Git subprocess calls; never a shell command or repository mutation."""

import os
import re
import subprocess
from pathlib import Path, PurePosixPath

from security import is_sensitive_file


SHA = re.compile(r"^[0-9a-fA-F]{7,64}$")


class GitHistoryError(ValueError):
    pass


class GitRepository:
    def __init__(self, root):
        self.root = Path(root).resolve() if root else None

    def run(self, *args, timeout=15, max_bytes=8_000_000, check=True):
        if not self.root or not self.root.is_dir():
            raise GitHistoryError("Git history unavailable for this repository.")
        command = ["git", "--no-pager", "--literal-pathspecs", "-C", str(self.root), *map(str, args)]
        env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    timeout=timeout, env=env, check=False)
        except (OSError, subprocess.TimeoutExpired) as error:
            raise GitHistoryError("Git history operation timed out or is unavailable.") from error
        if len(result.stdout) > max_bytes:
            raise GitHistoryError("Git history result exceeded the read limit; narrow the query.")
        if check and result.returncode:
            raise GitHistoryError("Git could not resolve this history request.")
        return result.stdout

    def text(self, *args, **kwargs):
        return self.run(*args, **kwargs).decode("utf-8", "replace")

    def status(self):
        if not self.root or not self.root.is_dir():
            return {"available": False, "message": "Git history unavailable for this repository."}
        try:
            actual = Path(self.text("rev-parse", "--show-toplevel").strip()).resolve()
            if actual != self.root:
                raise GitHistoryError("Configured history root must be the repository root.")
            head = self.text("rev-parse", "HEAD").strip()
            branch = self.text("symbolic-ref", "--quiet", "--short", "HEAD", check=False).strip() or None
            shallow = self.text("rev-parse", "--is-shallow-repository").strip() == "true"
            depth = int(self.text("rev-list", "--count", "HEAD").strip())
            dirty = bool(self.run("status", "--porcelain=v1", "--untracked-files=normal"))
            branches = self.text("branch", "--format=%(refname:short)").splitlines()[:100]
            return {"available": True, "root": str(self.root), "head": head, "branch": branch,
                    "branches": branches, "shallow": shallow, "commit_depth": depth, "dirty": dirty,
                    "message": None}
        except (GitHistoryError, ValueError):
            return {"available": False, "message": "Git history unavailable for this repository."}

    def require_commit(self, revision):
        if not isinstance(revision, str) or not SHA.fullmatch(revision):
            raise GitHistoryError("Commit must be a hexadecimal SHA of 7 to 64 characters.")
        resolved = self.text("rev-parse", "--verify", f"{revision}^{{commit}}").strip()
        if not re.fullmatch(r"[0-9a-f]{40,64}", resolved):
            raise GitHistoryError("Commit could not be resolved.")
        return resolved

    def require_path(self, path, *, allow_sensitive=False):
        if not isinstance(path, str) or not path or "\\" in path or "\x00" in path or ":" in path:
            raise GitHistoryError("Invalid repository file path.")
        parsed = PurePosixPath(path)
        if parsed.is_absolute() or any(part in {".", "..", ""} for part in path.split("/")) or path.startswith("-"):
            raise GitHistoryError("Invalid repository file path.")
        if not allow_sensitive and is_sensitive_file(path):
            raise GitHistoryError("Sensitive file history and source are unavailable.")
        return path

    def matches_repository(self, owner, repo):
        try:
            # Callers already checked repository status; avoid repeating every
            # status probe just to read the private origin URL.
            origin = self.text("remote", "get-url", "origin", check=False).strip()
        except GitHistoryError:
            return False
        match = re.search(r"github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$", origin, re.I)
        return bool(match and (match.group(1).lower(), match.group(2).lower()) == (owner.lower(), repo.lower()))
