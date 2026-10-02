"""
change_impact/models.py
Data models for Phase 8 Change Impact Analysis.
All structures are dataclasses with serialization helpers.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import List, Dict, Optional, Any


class ImpactConfidence(str, Enum):
    CONFIRMED = "CONFIRMED"
    LIKELY = "LIKELY"
    INFERRED = "INFERRED"


class ImpactType(str, Enum):
    TARGET = "TARGET"
    DIRECT = "DIRECT"
    TRANSITIVE = "TRANSITIVE"
    TEST = "TEST"
    ROUTE = "ROUTE"
    MODEL = "MODEL"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ChangeType(str, Enum):
    GENERAL = "GENERAL"
    FUNCTION_SIGNATURE = "FUNCTION_SIGNATURE"
    ROUTE_PATH = "ROUTE_PATH"
    DATABASE_SCHEMA = "DATABASE_SCHEMA"
    RETURN_TYPE = "RETURN_TYPE"
    ENVIRONMENT_VARIABLE = "ENVIRONMENT_VARIABLE"
    PUBLIC_API = "PUBLIC_API"


@dataclass
class ImpactTarget:
    file: str
    symbol: Optional[str] = None
    type: str = "file"  # "file", "function", "method", "component", "route", "database_model", "environment_variable"
    line: Optional[int] = None
    route: Optional[str] = None
    model_name: Optional[str] = None
    env_var: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ImpactNode:
    id: str
    file: str
    symbol: Optional[str] = None
    category: str = "unknown"
    architecture_layer: str = "Unassigned"
    impact_type: str = "DIRECT"  # ImpactType value
    depth: int = 1
    confidence: str = "CONFIRMED"  # ImpactConfidence value
    evidence: str = ""
    path_from_target: List[str] = field(default_factory=list)
    line: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ImpactEdge:
    id: str
    source: str
    target: str
    relationship: str
    confidence: str = "CONFIRMED"
    evidence: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BlastRadius:
    directly_affected: int = 0
    transitively_affected: int = 0
    tests_affected: int = 0
    routes_affected: int = 0
    models_affected: int = 0
    total_affected: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ImpactAnalysis:
    target: ImpactTarget
    id: str = ""
    change_type: str = "GENERAL"
    depth: int = 2
    summary: str = ""
    blast_radius: BlastRadius = field(default_factory=BlastRadius)
    risk_level: str = "LOW"
    risk_score: float = 0.0
    risk_factors: List[str] = field(default_factory=list)
    nodes: List[ImpactNode] = field(default_factory=list)
    edges: List[ImpactEdge] = field(default_factory=list)
    affected_tests: List[Dict[str, Any]] = field(default_factory=list)
    affected_routes: List[Dict[str, Any]] = field(default_factory=list)
    affected_models: List[Dict[str, Any]] = field(default_factory=list)
    affected_features: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    truncated: bool = False

    def __post_init__(self):
        if not self.id:
            sym = f":{self.target.symbol}" if self.target.symbol else ""
            self.id = f"impact:{self.target.file}{sym}:{self.change_type}:{self.depth}"

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["direct_impacts"] = [n.to_dict() for n in self.nodes if n.impact_type == ImpactType.DIRECT.value]
        data["transitive_impacts"] = [n.to_dict() for n in self.nodes if n.impact_type == ImpactType.TRANSITIVE.value]
        data["affected_layers"] = sorted(list({n.architecture_layer for n in self.nodes if n.architecture_layer and n.architecture_layer != "Unassigned"}))
        data["paths"] = [n.path_from_target for n in self.nodes if n.path_from_target]
        data["risk"] = {
            "level": self.risk_level,
            "score": self.risk_score,
            "reasons": self.risk_factors
        }
        return data