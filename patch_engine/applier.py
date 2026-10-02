"""Atomic per-file writes with snapshot-first multi-file recovery."""

from pathlib import Path

from .diff_utils import digest
from .rollback import atomic_replace, snapshot
from .validator import safe_target


class ApplyFailure(Exception):
    def __init__(self, cause: Exception, rollback_failed: list[str]):
        self.rollback_failed = rollback_failed
        detail = f"; automatic rollback failed for {', '.join(rollback_failed)}" if rollback_failed else "; written files restored"
        super().__init__(f"{cause}{detail}")


def apply_files(root: Path, patch_id: str, replacements: dict[str, bytes], on_snapshot=None) -> dict:
    originals = {path: safe_target(root, path).read_bytes() for path in replacements}
    after_hashes = {path: digest(raw) for path, raw in replacements.items()}
    snapshot(root, patch_id, originals, after_hashes)
    if on_snapshot:
        on_snapshot(after_hashes)
    applied = []
    try:
        for path, content in replacements.items():
            target = safe_target(root, path)
            if digest(target.read_bytes()) != digest(originals[path]):
                raise ValueError(f"Source changed during apply: {path}")
            atomic_replace(target, content)
            applied.append(path)
    except Exception as error:
        rollback_failed = []
        for path in reversed(applied):
            try:
                atomic_replace(safe_target(root, path), originals[path])
            except Exception:
                rollback_failed.append(path)
        raise ApplyFailure(error, rollback_failed) from error
    return {"applied_files": applied, "after_hashes": after_hashes,
            "snapshot": str(root / ".repo-explainer" / "rollbacks" / patch_id)}
