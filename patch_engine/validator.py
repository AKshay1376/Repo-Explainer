"""Local path, source, consistency, and syntax checks. Never executes target code."""

import ast
from pathlib import Path, PurePosixPath

from security import is_binary_file, is_sensitive_file, sanitize_content
from .diff_utils import digest, selected_content
from .models import PatchSet

BLOCKED_PARTS = {".git", ".repo-explainer", "node_modules", "dist", "build", "coverage",
                 "credentials", "secrets", ".secrets", "tokens", "keys"}


def safe_target(root: Path, path: str) -> Path:
    if not isinstance(path, str) or not path or "\\" in path or "\x00" in path or ":" in path:
        raise ValueError("Invalid patch path.")
    pure = PurePosixPath(path)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in path.split("/")):
        raise ValueError("Patch path must be relative and cannot traverse directories.")
    if any(part.lower() in BLOCKED_PARTS for part in pure.parts):
        raise ValueError("Patch target is inside a blocked directory.")
    if is_sensitive_file(path) or is_binary_file(path) or any(
        word in pure.name.lower() for word in ("credential", "private_key", "secret", "token", "api_key", "apikey")
    ):
        raise ValueError("Sensitive or binary files cannot be patched.")
    canonical = root.resolve(strict=True)
    target = canonical.joinpath(*pure.parts)
    current = canonical
    for part in pure.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlinked patch targets are blocked.")
    if not target.resolve(strict=False).is_relative_to(canonical):
        raise ValueError("Patch target escapes the repository.")
    if not target.is_file():
        raise ValueError("Patch target is missing, moved, or not a regular file.")
    return target


def readable_text(path: str, raw: bytes) -> str:
    if len(raw) > 1_000_000 or b"\x00" in raw:
        raise ValueError("Large or binary sources cannot be patched.")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("Only UTF-8 text sources can be patched.") from error
    if sanitize_content(path, text) != text:
        raise ValueError("Source contains secret-like values; patch generation is blocked.")
    return text


def syntax_check(path: str, text: str) -> dict:
    if path.lower().endswith(".py"):
        try:
            ast.parse(text, filename=path, type_comments=True)
        except SyntaxError as error:
            return {"state": "FAILED", "command": "Python AST parse (no execution)",
                    "exit_code": 1, "output_summary": f"{path}:{error.lineno}: {error.msg}"}
        return {"state": "PASSED", "command": "Python AST parse (no execution)", "exit_code": 0,
                "output_summary": f"{path}: syntax valid"}
    return {"state": "NOT_RUN", "command": "No trusted parser configured", "exit_code": None,
            "output_summary": f"{path}: review manually"}


def validate_selection(root: Path, patch: PatchSet, selected_ids: list[str]) -> tuple[dict[str, bytes], list[dict]]:
    if patch.status != "ready":
        raise ValueError(f"Patch is {patch.status}; generate a new patch.")
    if not isinstance(selected_ids, list) or any(not isinstance(item, str) for item in selected_ids) or len(set(selected_ids)) != len(selected_ids):
        raise ValueError("Selected hunks must be unique IDs.")
    known = {f"{file.path}:{hunk.id}" for file in patch.files for hunk in file.hunks}
    selected = set(selected_ids)
    if not selected or not selected <= known:
        raise ValueError("Select at least one valid hunk.")
    replacements = {}
    checks = []
    for file in patch.files:
        target = safe_target(root, file.path)
        raw = target.read_bytes()
        if digest(raw) != file.original_hash:
            patch.status = "stale"
            raise ValueError(f"Source changed since patch generation: {file.path}. Regenerate patch.")
        text = readable_text(file.path, raw)
        ids = {item.split(":", 1)[1] for item in selected_ids if item.startswith(f"{file.path}:")}
        if not ids:
            continue
        proposed = selected_content(text, file.hunks, ids)
        if proposed == text:
            raise ValueError("Selected hunks do not change the source.")
        if sanitize_content(file.path, proposed) != proposed:
            raise ValueError("Proposed source contains secret-like values.")
        replacements[file.path] = proposed.encode("utf-8")
        checks.append(syntax_check(file.path, proposed))
    return replacements, checks
