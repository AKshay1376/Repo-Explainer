"""Bound validator arguments, working directories, environment and visible output."""

import os
import re
from pathlib import Path, PurePosixPath

from .profiles import SAFE_BINS
from security import sanitize_content

_BAD = re.compile(r"(?i)(?:curl|wget|invoke-webrequest|invoke-restmethod|powershell|pwsh|\brm\s+-rf\b|\bdel\s+/s\b|\bformat\b|\bshutdown\b|\bgit\s+push\b|\bgit\s+reset\s+--hard\b|\bnpm\s+publish\b|\bpip\s+install\b|https?://|[;&|`]|\$\(|>|<)")
_SAFE_ENV = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR",
             "COMSPEC", "HOME", "USERPROFILE", "VIRTUAL_ENV", "LANG", "LC_ALL", "CI"}
_OUTPUT_SECRET = re.compile(r"(?i)((?:api[_-]?key|token|password|secret|authorization|bearer)\s*[:=]\s*)[^\s,;]+")


def safe_directory(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or "\\" in relative or ":" in relative:
        raise ValueError("Invalid validator working directory.")
    parts = [] if relative in {"", "."} else relative.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise ValueError("Validator working directory escapes the repository.")
    canonical = root.resolve(strict=True)
    current = canonical
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlinked validator working directories are blocked.")
    if not current.is_dir() or not current.resolve().is_relative_to(canonical):
        raise ValueError("Validator working directory must exist inside the repository.")
    return current


def safe_command(argv: list[str]) -> None:
    if not isinstance(argv, list) or not argv or len(argv) > 16 or any(
        not isinstance(arg, str) or not arg or len(arg) > 150 or _BAD.search(arg) for arg in argv
    ):
        raise ValueError("Validator command is not an approved safe pattern.")
    first = Path(argv[0]).name.lower().removesuffix(".exe").removesuffix(".cmd")
    if first in {"npm", "pnpm", "yarn"}:
        if argv[1:2] == ["test"] and len(argv) == 2:
            return
        if len(argv) == 3 and argv[1] == "run" and argv[2] in {"test", "test:unit", "test:integration", "lint", "typecheck", "type-check", "build"}:
            return
    if first in {"python", "python3", "py"} or first.startswith("python3."):
        if argv[1:3] in (["-m", "pytest"], ["-m", "unittest"]) or argv[1:4] in (["-B", "-m", "unittest"], ["-B", "-m", "pytest"]):
            return
    if first in {"pytest", "ruff", "flake8", "mypy", "pyright"} and len(argv) <= 4:
        return
    if first == "npx" and len(argv) >= 2 and argv[1] in SAFE_BINS and all(not arg.startswith("-") or arg in {"--noEmit", "--check", "--runInBand"} for arg in argv[2:]):
        return
    raise ValueError("Validator command is not an approved safe pattern.")


def sanitized_environment(source: dict[str, str] | None = None) -> dict[str, str]:
    source = os.environ if source is None else source
    return {key: value for key, value in source.items() if key.upper() in _SAFE_ENV}


def redact_output(value: str, limit: int = 8192) -> str:
    text = sanitize_content("validator-output.txt", value) or ""
    text = _OUTPUT_SECRET.sub(r"\1[REDACTED]", text)
    return text[:limit] + ("… [output truncated]" if len(text) > limit else "")
