"""
execution_trace/models.py
Normalized data models for static execution path tracing in Repo Explainer.
All structures are JSON-serializable dataclasses.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional


class StepType:
    UI_COMPONENT = "UI_COMPONENT"
    EVENT_HANDLER = "EVENT_HANDLER"
    CLIENT_SERVICE = "CLIENT_SERVICE"
    API_CLIENT = "API_CLIENT"
    API_ROUTE = "API_ROUTE"
    MIDDLEWARE = "MIDDLEWARE"
    CONTROLLER = "CONTROLLER"
    SERVICE = "SERVICE"
    MODEL = "MODEL"
    DATABASE = "DATABASE"
    UTILITY = "UTILITY"
    ENTRY_POINT = "ENTRY_POINT"
    UNKNOWN = "UNKNOWN"


class ConfidenceLevel:
    HIGH = "HIGH"        # Explicit function call, verified API route bridge, or AST import
    MEDIUM = "MEDIUM"    # Explicit file import + verified architectural layer progression
    LOW = "LOW"          # Structural inference without call-level verification


@dataclass
class ExecutionStep:
    id: str
    file: str
    symbol: Optional[str] = None
    type: str = StepType.UNKNOWN
    label: str = ""
    architecture_layer: str = "general"
    evidence: str = ""
    confidence: str = ConfidenceLevel.HIGH
    line: Optional[int] = None
    is_inferred: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionEdge:
    id: str
    source_step: str
    target_step: str
    relationship: str    # "HTTP Request", "calls", "imports", "queries", "renders", "dispatches to"
    evidence: str
    confidence: str = ConfidenceLevel.HIGH

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ExecutionFlow:
    id: str
    title: str
    description: str
    trigger: str
    steps: List[ExecutionStep] = field(default_factory=list)
    edges: List[ExecutionEdge] = field(default_factory=list)
    confidence: str = ConfidenceLevel.HIGH
    warnings: List[str] = field(default_factory=list)
    cycle_detected: bool = False
    is_primary: bool = True
    flow_category: str = "general"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "trigger": self.trigger,
            "steps": [s.to_dict() for s in self.steps],
            "edges": [e.to_dict() for e in self.edges],
            "confidence": self.confidence,
            "warnings": self.warnings,
            "cycle_detected": self.cycle_detected,
            "is_primary": self.is_primary,
            "flow_category": self.flow_category,
        }
