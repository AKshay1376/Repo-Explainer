"""Local-first durable project state, separate from recomputable caches."""

from .service import PersistenceService

__all__ = ["PersistenceService"]
