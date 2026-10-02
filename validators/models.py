"""Small serializable validator contracts."""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ValidatorCommand:
    id: str
    kind: str
    label: str
    command: list[str]
    working_directory: str
    source: str
    confidence: str
    timeout_seconds: int = 120
    max_output_kb: int = 8
    trusted: bool = False

    def public(self) -> dict:
        return asdict(self)


@dataclass
class ValidatorProfile:
    id: str
    repo_id: str
    detected_stack: list[str]
    commands: list[ValidatorCommand]
    trusted: bool = False
    trust_scope: str = "untrusted"
    created_at: str = field(default_factory=timestamp)
    updated_at: str = field(default_factory=timestamp)
    warnings: list[str] = field(default_factory=list)

    def public(self) -> dict:
        return {**asdict(self), "commands": [command.public() for command in self.commands]}
