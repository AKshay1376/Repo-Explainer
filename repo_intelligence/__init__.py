"""
repo_intelligence package
Structured repository intelligence engine for Repo Explainer.
"""

from repo_intelligence.models import (
    RepositoryModel,
    RepositoryMetadata,
    FileModel,
    SymbolModel,
    DependencyEdge,
    RouteModel,
    DatabaseModel,
    EntryPoint,
    TechnologyDetection,
    ArchitectureLayer,
)
from repo_intelligence.engine import (
    build_repository_model,
    analyze_repository_structure,
)

__all__ = [
    "RepositoryModel",
    "RepositoryMetadata",
    "FileModel",
    "SymbolModel",
    "DependencyEdge",
    "RouteModel",
    "DatabaseModel",
    "EntryPoint",
    "TechnologyDetection",
    "ArchitectureLayer",
    "build_repository_model",
    "analyze_repository_structure",
]
