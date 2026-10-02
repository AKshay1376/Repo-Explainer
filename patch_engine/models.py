"""Patch contracts. Proposed bytes stay in process; durable history stores metadata only."""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class PatchHunk:
    id: str
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    original_lines: list[str]
    proposed_lines: list[str]
    reason: str
    confidence: str = "HIGH"
    selected: bool = True
    depends_on: list[str] = field(default_factory=list)


@dataclass
class PatchFile:
    path: str
    original_hash: str
    proposed_hash: str
    hunks: list[PatchHunk]
    risk_level: str = "LOW"
    public_api_change: bool = False
    warnings: list[str] = field(default_factory=list)
    status: str = "ready"
    original_bytes: bytes = field(default=b"", repr=False)
    proposed_bytes: bytes = field(default=b"", repr=False)
    operation: str = "modify"
    source_path: str | None = None
    destination_path: str | None = None
    confidence: str = "HIGH"
    patch_support: str = "Verified"

    def public(self) -> dict[str, Any]:
        return {key: value for key, value in asdict(self).items()
                if key not in {"original_bytes", "proposed_bytes"}}


@dataclass
class PatchSet:
    id: str
    source: str
    source_id: str
    repo_revision: str
    summary: str
    files: list[PatchFile]
    risk_level: str = "LOW"
    status: str = "draft"
    created_at: str = field(default_factory=now)
    warnings: list[str] = field(default_factory=list)
    validation: dict[str, Any] = field(default_factory=lambda: {"state": "NOT_RUN", "checks": []})
    rollback_available: bool = False
    impact: dict[str, Any] = field(default_factory=dict)
    git: dict[str, Any] = field(default_factory=dict)
    selected_hunks: list[str] = field(default_factory=list)
    applied_hashes: dict[str, str] = field(default_factory=dict)
    rolled_back_files: list[str] = field(default_factory=list)
    confidence: str = "HIGH"

    def public(self, *, include_diff: bool = True) -> dict[str, Any]:
        result = {key: value for key, value in asdict(self).items() if key != "files"}
        result["files"] = [file.public() for file in self.files]
        if not include_diff:
            for file in result["files"]:
                file.pop("hunks", None)
        return result
