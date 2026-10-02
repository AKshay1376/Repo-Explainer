"""Atomic per-file writes with snapshot-first multi-file recovery."""

from pathlib import Path

from .diff_utils import digest
from .rollback import atomic_create, atomic_replace, snapshot
from .validator import safe_path, safe_target


class ApplyFailure(Exception):
    def __init__(self, cause: Exception, rollback_failed: list[str]):
        self.rollback_failed = rollback_failed
        detail = f"; automatic rollback failed for {', '.join(rollback_failed)}" if rollback_failed else "; written files restored"
        super().__init__(f"{cause}{detail}")


def apply_files(root: Path, patch_id: str, replacements: dict[str, bytes], on_snapshot=None,
                operations: dict[str, dict] | None = None) -> dict:
    operations = operations or {}
    originals: dict[str, bytes | None] = {}
    after_hashes = {}
    for path, raw in replacements.items():
        op = operations.get(path, {}).get("operation", "modify")
        if op == "create":
            safe_path(root, path, must_exist=False)
            originals[path] = None
            after_hashes[path] = digest(raw)
        else:
            originals[path] = safe_target(root, path).read_bytes()
            after_hashes[path] = "" if op in {"delete", "move"} else digest(raw)
        if op == "move":
            dest = operations[path].get("destination_path")
            safe_path(root, dest, must_exist=False)
            if dest in originals or dest in replacements:
                raise ValueError("Move destination conflicts with another patch path.")
            originals[dest] = None
            after_hashes[dest] = digest(raw)
    snapshot(root, patch_id, originals, after_hashes)
    if on_snapshot:
        on_snapshot(after_hashes)
    applied = []
    try:
        for path, content in replacements.items():
            op = operations.get(path, {}).get("operation", "modify")
            if op == "create":
                target = safe_path(root, path, must_exist=False)
                atomic_create(target, content)
                applied.append(path)
                continue
            target = safe_target(root, path)
            if digest(target.read_bytes()) != digest(originals[path]):
                raise ValueError(f"Source changed during apply: {path}")
            if op == "delete":
                target.unlink()
            elif op == "move":
                destination = safe_path(root, operations[path]["destination_path"], must_exist=False)
                atomic_create(destination, content)
                applied.append(operations[path]["destination_path"])
                target.unlink()
            else:
                atomic_replace(target, content)
            applied.append(path)
    except Exception as error:
        rollback_failed = []
        for path in reversed(applied):
            try:
                prior = originals[path]
                target = safe_target(root, path) if (root / path).exists() else safe_path(root, path, must_exist=False)
                if prior is None:
                    if target.exists(): target.unlink()
                elif target.exists():
                    atomic_replace(target, prior)
                else:
                    atomic_create(target, prior)
            except Exception:
                rollback_failed.append(path)
        raise ApplyFailure(error, rollback_failed) from error
    return {"applied_files": applied, "after_hashes": after_hashes,
            "snapshot": str(root / ".repo-explainer" / "rollbacks" / patch_id)}
