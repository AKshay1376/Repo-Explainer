"""
repo_intelligence/models.py
Normalized data models for repository intelligence.
All models are structured using Python dataclasses and are JSON-serializable.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional


@dataclass
class RepositoryMetadata:
    owner: str
    repo: str
    description: Optional[str] = None
    default_branch: str = "main"
    latest_commit_sha: Optional[str] = None
    primary_language: Optional[str] = None
    languages: List[str] = field(default_factory=list)
    stars: int = 0
    forks: int = 0
    license: Optional[str] = None


@dataclass
class SymbolModel:
    name: str
    type: str  # "function", "class", "method", "variable", "component", "hook", "type", "interface"
    file: str
    line: Optional[int] = None
    signature: Optional[str] = None


@dataclass
class DependencyEdge:
    source: str
    target: str
    type: str  # "imports", "calls", "renders", "queries", "implements", "extends"
    confidence: float = 1.0  # 0.0 - 1.0
    evidence: str = ""


@dataclass
class RouteModel:
    method: str  # "GET", "POST", "PUT", "DELETE", "ALL", etc.
    path: str
    file: str
    handler: Optional[str] = None
    framework: str = ""  # "express", "flask", "fastapi", "nextjs", "django"


@dataclass
class DatabaseModel:
    name: str
    file: str
    framework: str  # "sqlalchemy", "prisma", "mongoose", "django", "sequelize", "typeorm"
    fields: List[Dict[str, Any]] = field(default_factory=list)
    relationships: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class EntryPoint:
    path: str
    type: str  # "web-backend", "web-frontend", "cli", "library", "worker", "job"
    confidence: float = 1.0
    evidence: str = ""


@dataclass
class TechnologyDetection:
    name: str
    category: str  # "frontend", "backend", "database", "orm", "tooling", "testing", "language"
    confidence: str  # "high", "medium", "low"
    evidence: str


@dataclass
class FileModel:
    path: str
    name: str
    extension: str
    language: str
    size: int = 0
    category: str = "unknown"  # "entrypoint", "frontend-component", "frontend-page", "backend-route", "controller", "service", "model", "database", "config", "middleware", "utility", "test", "documentation", "build", "deployment", "script", "unknown"
    purpose: str = ""
    imports: List[str] = field(default_factory=list)
    exports: List[str] = field(default_factory=list)
    classes: List[str] = field(default_factory=list)
    functions: List[str] = field(default_factory=list)
    constants: List[str] = field(default_factory=list)
    routes: List[RouteModel] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # resolved internal file paths this file imports
    dependents: List[str] = field(default_factory=list)    # resolved internal file paths that import this file (reverse deps)
    env_vars: List[str] = field(default_factory=list)
    confidence: float = 1.0


@dataclass
class ArchitectureLayer:
    name: str
    files: List[str] = field(default_factory=list)
    confidence: float = 1.0
    description: str = ""


@dataclass
class RepositoryModel:
    metadata: RepositoryMetadata
    technologies: List[TechnologyDetection] = field(default_factory=list)
    directories: Dict[str, List[str]] = field(default_factory=dict)
    files: Dict[str, FileModel] = field(default_factory=dict)
    symbols: List[SymbolModel] = field(default_factory=list)
    dependencies: List[DependencyEdge] = field(default_factory=list)
    entry_points: List[EntryPoint] = field(default_factory=list)
    api_routes: List[RouteModel] = field(default_factory=list)
    database_models: List[DatabaseModel] = field(default_factory=list)
    architecture_layers: Dict[str, List[str]] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert the complete repository model to a JSON-serializable dictionary."""
        return asdict(self)
