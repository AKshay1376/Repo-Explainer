"""Local path, source, consistency, and syntax checks. Never executes target code."""

import ast
from pathlib import Path, PurePosixPath

from security import is_binary_file, is_sensitive_file, sanitize_content
from .diff_utils import digest, selected_content
from .models import PatchSet

BLOCKED_PARTS = {".git", ".repo-explainer", "node_modules", "dist", "build", "coverage",
                 "credentials", "secrets", ".secrets", "tokens", "keys"}


def safe_path(root: Path, path: str, *, must_exist: bool = True) -> Path:
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
    if must_exist and not target.is_file():
        raise ValueError("Patch target is missing, moved, or not a regular file.")
    if not must_exist and (target.exists() or not target.parent.is_dir()):
        raise ValueError("Patch destination already exists or its parent is missing.")
    return target


def safe_target(root: Path, path: str) -> Path:
    return safe_path(root, path)


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


def structural_check(root: Path, path: str, text: str, projected_paths: set[str]) -> dict:
    """Check locally resolvable Python imports and duplicate top-level names without execution."""
    if not path.endswith(".py"):
        return {"state": "NOT_RUN", "command": "Static import check", "exit_code": None,
                "output_summary": f"{path}: language not supported"}
    tree = ast.parse(text)
    names = [node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    if len(names) != len(set(names)):
        return {"state": "FAILED", "command": "Python structural check", "exit_code": 1,
                "output_summary": f"{path}: duplicate top-level symbol"}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Import, ast.ImportFrom)): continue
        modules = [alias.name for alias in node.names] if isinstance(node, ast.Import) else [node.module or ""]
        if isinstance(node, ast.ImportFrom) and node.level: continue
        for module in modules:
            if not module: continue
            parts = module.split(".")
            if not (root / parts[0] / "__init__.py").is_file(): continue
            stem = "/".join(parts)
            if f"{stem}.py" not in projected_paths and f"{stem}/__init__.py" not in projected_paths:
                return {"state": "FAILED", "command": "Python structural check", "exit_code": 1,
                        "output_summary": f"{path}: unresolved local import {module}"}
    return {"state": "PASSED", "command": "Python structural check", "exit_code": 0,
            "output_summary": f"{path}: local imports and top-level symbols checked"}


def validate_selection(root: Path, patch: PatchSet, selected_ids: list[str]) -> tuple[dict[str, bytes], list[dict], dict[str, dict]]:
    if patch.status != "ready":
        raise ValueError(f"Patch is {patch.status}; generate a new patch.")
    if not isinstance(selected_ids, list) or any(not isinstance(item, str) for item in selected_ids) or len(set(selected_ids)) != len(selected_ids):
        raise ValueError("Selected hunks must be unique IDs.")
    known = {f"{file.path}:{hunk.id}" for file in patch.files for hunk in file.hunks}
    selected = set(selected_ids)
    if not selected or not selected <= known:
        raise ValueError("Select at least one valid hunk.")
    if any(file.operation != "modify" for file in patch.files) and selected != known:
        raise ValueError("File operations and dependent import rewrites must be selected together.")
    replacements = {}
    checks = []
    operations = {}
    for file in patch.files:
        if file.operation == "create":
            safe_path(root, file.path, must_exist=False)
            raw = b""
        else:
            target = safe_target(root, file.path)
            raw = target.read_bytes()
            if digest(raw) != file.original_hash:
                patch.status = "stale"
                raise ValueError(f"Source changed since patch generation: {file.path}. Regenerate patch.")
        text = readable_text(file.path, raw)
        ids = {item.split(":", 1)[1] for item in selected_ids if item.startswith(f"{file.path}:")}
        if not ids:
            continue
        proposed = selected_content(text, file.hunks, ids) if file.operation == "modify" else file.proposed_bytes.decode("utf-8")
        if proposed == text and file.operation == "modify":
            raise ValueError("Selected hunks do not change the source.")
        if sanitize_content(file.path, proposed) != proposed:
            raise ValueError("Proposed source contains secret-like values.")
        if file.operation == "move":
            if not file.destination_path or file.source_path != file.path:
                raise ValueError("Move paths are invalid.")
            safe_path(root, file.destination_path, must_exist=False)
            readable_text(file.destination_path, file.proposed_bytes)
            checks.append(syntax_check(file.destination_path, proposed))
        elif file.operation not in {"modify", "create", "delete"}:
            raise ValueError("Unsupported file operation.")
        elif file.operation != "delete":
            checks.append(syntax_check(file.path, proposed))
        replacements[file.path] = proposed.encode("utf-8")
        operations[file.path] = {"operation": file.operation, "destination_path": file.destination_path}
    projected_paths = {p.relative_to(root).as_posix() for p in root.rglob("*.py") if not p.is_symlink()}
    for path, operation in operations.items():
        if operation["operation"] in {"delete", "move"}: projected_paths.discard(path)
        if operation["operation"] == "move": projected_paths.add(operation["destination_path"])
        if operation["operation"] == "create": projected_paths.add(path)
    for path, raw in replacements.items():
        operation = operations[path]["operation"]
        if operation == "delete": continue
        destination = operations[path]["destination_path"] if operation == "move" else path
        checks.append(structural_check(root, destination, raw.decode("utf-8"), projected_paths))
    return replacements, checks, operations
