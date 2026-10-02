"""Durable exact-byte snapshots and conflict-aware restoration."""

import json
import os
import re
from pathlib import Path

from .diff_utils import digest
from .validator import safe_path, safe_target


def safe_store(root: Path) -> Path:
    base = root / ".repo-explainer"
    if base.is_symlink() or (base.exists() and not base.is_dir()):
        raise ValueError("Patch storage must be a real local directory.")
    rollbacks = base / "rollbacks"
    if rollbacks.is_symlink() or (rollbacks.exists() and not rollbacks.is_dir()):
        raise ValueError("Rollback storage must be a real local directory.")
    return base


def atomic_replace(target: Path, content: bytes) -> None:
    import tempfile
    descriptor, temp_name = tempfile.mkstemp(prefix=".patch-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp_name, target.stat().st_mode)
        os.replace(temp_name, target)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def atomic_create(target: Path, content: bytes) -> None:
    created = False
    try:
        with target.open("xb") as stream:
            created = True
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        if created and target.exists(): target.unlink()
        raise


def snapshot(root: Path, patch_id: str, originals: dict[str, bytes | None], after_hashes: dict[str, str]) -> Path:
    directory = safe_store(root) / "rollbacks" / patch_id
    if directory.is_symlink() or directory.exists():
        raise ValueError("Rollback snapshot already exists or is unsafe.")
    directory.mkdir(parents=True, exist_ok=False)
    files = {}
    for index, (path, raw) in enumerate(sorted(originals.items())):
        name = f"{index:04d}.snapshot"
        if raw is not None:
            with (directory / name).open("wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
        files[path] = {"snapshot": name if raw is not None else None,
                       "before_hash": digest(raw) if raw is not None else None,
                       "after_hash": after_hashes[path]}
    with (directory / "manifest.json").open("w", encoding="utf-8") as stream:
        json.dump({"patch_id": patch_id, "files": files}, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    return directory


def restore(root: Path, patch_id: str, paths: list[str] | None = None,
            confirm_conflicts: bool = False, expected: dict[str, str] | None = None) -> dict:
    directory = safe_store(root) / "rollbacks" / patch_id
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("Rollback snapshot is missing or unsafe.")
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("patch_id") != patch_id or not isinstance(manifest.get("files"), dict):
        raise ValueError("Rollback manifest is invalid.")
    entries = manifest["files"]
    chosen = paths or list(entries)
    if not chosen or any(path not in entries for path in chosen):
        raise ValueError("Choose files from this patch snapshot.")
    if any(not isinstance(entries[path], dict) or not (isinstance(entries[path].get("snapshot"), str) or entries[path].get("snapshot") is None)
           or not (isinstance(entries[path].get("before_hash"), str) or entries[path].get("before_hash") is None)
           or not isinstance(entries[path].get("after_hash"), str)
           for path in chosen):
        raise ValueError("Rollback manifest contains invalid file metadata.")
    targets = {path: safe_path(root, path, must_exist=False) if not (root / path).exists() else safe_target(root, path)
               for path in chosen}
    def current_hash(target):
        return digest(target.read_bytes()) if target.exists() else ""
    conflicts = [path for path, target in targets.items() if current_hash(target) not in {
        entries[path]["before_hash"] or "", (expected or {}).get(path, entries[path]["after_hash"])}]
    if conflicts and not confirm_conflicts:
        return {"success": False, "conflicts": conflicts,
                "error": "Files changed since apply. Confirm conflict overwrite to restore exact snapshot bytes."}
    originals: dict[str, bytes | None] = {}
    for path in chosen:
        name = entries[path]["snapshot"]
        if name is None:
            originals[path] = None
            continue
        if not isinstance(name, str) or not re.fullmatch(r"\d{4}\.snapshot", name) or (directory / name).is_symlink():
            raise ValueError("Rollback snapshot path is unsafe.")
        raw = (directory / name).read_bytes()
        if digest(raw) != entries[path]["before_hash"]:
            raise ValueError("Rollback snapshot failed its integrity check.")
        originals[path] = raw
    # All paths and snapshots are validated before the first write.
    previous = {path: target.read_bytes() if target.exists() else None for path, target in targets.items()}
    restored = []
    try:
        for path, raw in originals.items():
            if raw is None:
                if targets[path].exists(): targets[path].unlink()
            elif targets[path].exists():
                atomic_replace(targets[path], raw)
            else:
                atomic_create(targets[path], raw)
            restored.append(path)
    except Exception:
        for path in reversed(restored):
            if previous[path] is None:
                if targets[path].exists(): targets[path].unlink()
            elif targets[path].exists():
                atomic_replace(targets[path], previous[path])
            else:
                atomic_create(targets[path], previous[path])
        raise
    return {"success": True, "restored": chosen, "conflicts": conflicts}
