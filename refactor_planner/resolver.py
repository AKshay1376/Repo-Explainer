"""Resolve exact repository targets; never guess a symbol or path."""

import re
from typing import Any, Dict, Optional

from change_impact.precomputed import build_repository_index
from security import is_binary_file, is_sensitive_file
from .models import PLAN_TYPES

FILE_TYPES = {"move_file", "move_module", "extract_function", "extract_module", "split_large_file", "merge_duplicate_helpers"}
DEPENDENCY_TYPES = {"replace_dependency", "upgrade_dependency"}


def resolve_target(model: Dict[str, Any], plan_type: str, target: str,
                   destination: Optional[str] = None, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if plan_type not in PLAN_TYPES:
        raise ValueError("Unsupported plan type.")
    target = (target or "").strip().replace("\\", "/")
    destination = (destination or "").strip().replace("\\", "/") or None
    if not target or len(target) > 300 or (destination and len(destination) > 300):
        raise ValueError("A bounded target and optional destination are required.")
    files = model.get("files") or {}
    index = build_repository_index(model)
    options = options or {}
    symbol = None
    path = target
    if plan_type == "rename_symbol":
        symbol = str(options.get("symbol") or target.rsplit("::", 1)[-1]).strip()
        path = str(options.get("file") or (target.rsplit("::", 1)[0] if "::" in target else ""))
        definitions = [item for item in index.symbol_definitions.get(symbol, [])
                       if item.get("file") in files and (not path or item.get("file") == path)]
        unique = {item.get("file") for item in definitions}
        if len(unique) != 1:
            raise ValueError("Symbol definition is missing or ambiguous; provide an exact file and symbol.")
        path = next(iter(unique))
        if not destination or not re.fullmatch(r"[A-Za-z_$][\w$]*", destination):
            raise ValueError("A valid destination symbol name is required.")
        if destination == symbol:
            raise ValueError("Destination must differ from the target symbol.")
    elif plan_type in FILE_TYPES | {"api_migration", "database_model_migration"}:
        if path not in files:
            raise ValueError("Target file must exist exactly in the repository model.")
        if plan_type == "extract_function":
            candidate = options.get("symbol")
            if isinstance(candidate, str) and candidate.strip():
                symbol = candidate.strip()
    elif plan_type in DEPENDENCY_TYPES:
        manifest_paths = [p for p in files if p.endswith(("package.json", "requirements.txt", "pyproject.toml", "Pipfile", "Cargo.toml", "go.mod"))]
        if not manifest_paths:
            raise ValueError("No supported package manifest was found in the repository model.")
        path = sorted(manifest_paths)[0]
    elif plan_type == "framework_migration":
        if target in files:
            path = target
        else:
            known = any(str(item.get("name", "")).lower() == target.lower()
                        for item in model.get("technologies") or [])
            if not known:
                raise ValueError("Framework target is not identified in the repository model; choose an exact file or detected technology.")
            candidates = [item.get("path") for item in model.get("entry_points") or []
                          if item.get("path") in files and not is_sensitive_file(item["path"])]
            candidates += sorted(item for item in files if not is_sensitive_file(item) and not is_binary_file(item))
            path = candidates[0] if candidates else ""
            if not path:
                raise ValueError("A repository model with files is required.")
    if path and (is_sensitive_file(path) or is_binary_file(path)):
        raise ValueError("Sensitive or binary targets cannot be planned.")
    if plan_type in {"move_file", "move_module"}:
        if not destination or destination in files or destination.startswith("/") or ".." in destination.split("/"):
            raise ValueError("A new safe destination path is required.")
        if is_sensitive_file(destination) or is_binary_file(destination):
            raise ValueError("Sensitive or binary destinations are unavailable.")
    return {"path": path, "symbol": symbol, "target": target,
            "destination": destination, "index": index}
