"""Serializable plan contracts shared by deterministic planning and the API."""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

PLAN_TYPES = (
    "rename_symbol", "move_file", "move_module", "extract_function",
    "extract_module", "split_large_file", "merge_duplicate_helpers",
    "replace_dependency", "upgrade_dependency", "framework_migration",
    "api_migration", "database_model_migration",
)


@dataclass
class PlanStep:
    id: str
    order: int
    title: str
    description: str
    target: str
    change_type: str
    prerequisites: List[str] = field(default_factory=list)
    affected_files: List[str] = field(default_factory=list)
    affected_symbols: List[str] = field(default_factory=list)
    source_locations: List[Dict[str, Any]] = field(default_factory=list)
    validation: List[str] = field(default_factory=list)
    risk_level: str = "LOW"
    confidence: str = "MEDIUM"
    can_auto_preview: bool = False
    requires_manual_review: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RefactorPlan:
    id: str
    plan_type: str
    target: str
    destination: Optional[str]
    summary: str
    risk_level: str
    steps: List[PlanStep]
    affected_files: List[str]
    affected_symbols: List[str]
    affected_routes: List[Dict[str, Any]]
    affected_models: List[Dict[str, Any]]
    affected_tests: List[Dict[str, Any]]
    dependencies: List[Dict[str, Any]]
    warnings: List[str]
    manual_review_items: List[str]
    confidence: str
    estimated_scope: Dict[str, Any]
    risk_factors: List[str] = field(default_factory=list)
    impact: Dict[str, Any] = field(default_factory=dict)
    execution_paths: List[Dict[str, Any]] = field(default_factory=list)
    proposed_partitions: List[Dict[str, Any]] = field(default_factory=list)
    partition_edges: List[Dict[str, str]] = field(default_factory=list)
    migration_evidence: Dict[str, Any] = field(default_factory=dict)
    validation: List[str] = field(default_factory=list)
    validation_state: str = "NOT_RUN"
    cycles: List[List[str]] = field(default_factory=list)
    external_information_needed: bool = False
    llm_calls: int = 0
    planning_only: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
