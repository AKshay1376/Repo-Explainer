"""
cache_manager.py
Thread-safe, bounded, TTL in-memory caching for Repo Explainer.

Provides caching for:
1. Repository info (default_branch, description, stars)
2. Repository file trees
3. Complete repository analysis & reports

Failures, error states, and unauthenticated responses are never cached.
"""

import os
import threading
from typing import Any, Dict, List, Optional
from cachetools import TTLCache

CACHE_ENABLED = os.getenv("CACHE_ENABLED", "1").strip().lower() in ("1", "true", "yes")
DEFAULT_CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))
DEFAULT_CACHE_MAXSIZE = int(os.getenv("CACHE_MAXSIZE", "100"))

_lock = threading.Lock()

# Separate caches for different resource lifecycles
_repo_info_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_tree_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_analysis_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_repo_model_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_file_contents_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_impact_cache: TTLCache = TTLCache(maxsize=DEFAULT_CACHE_MAXSIZE, ttl=DEFAULT_CACHE_TTL)
_source_file_cache: TTLCache = TTLCache(maxsize=1000, ttl=DEFAULT_CACHE_TTL)
_humanize_cache: TTLCache = TTLCache(maxsize=500, ttl=DEFAULT_CACHE_TTL)
_refactor_cache: TTLCache = TTLCache(maxsize=300, ttl=DEFAULT_CACHE_TTL)


def _normalize_key(owner: str, repo: str, extra: str = "") -> str:
    owner_clean = (owner or "").strip().lower()
    repo_clean = (repo or "").strip().lower()
    key = f"{owner_clean}/{repo_clean}"
    if extra:
        key = f"{key}:{extra.strip()}"
    return key


def get_cached_repo_info(owner: str, repo: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached repository info if available and not expired."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo)
    with _lock:
        return _repo_info_cache.get(key)


def set_cached_repo_info(owner: str, repo: str, info: Dict[str, Any]) -> None:
    """Store repository info in cache."""
    if not CACHE_ENABLED or not info:
        return
    key = _normalize_key(owner, repo)
    with _lock:
        _repo_info_cache[key] = info


def get_cached_tree(owner: str, repo: str, branch: str) -> Optional[List[str]]:
    """Retrieve cached repository file tree if available and not expired."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo, branch)
    with _lock:
        return _tree_cache.get(key)


def set_cached_tree(owner: str, repo: str, branch: str, tree: List[str]) -> None:
    """Store repository file tree in cache."""
    if not CACHE_ENABLED or not tree:
        return
    key = _normalize_key(owner, repo, branch)
    with _lock:
        _tree_cache[key] = tree


def get_cached_analysis(owner: str, repo: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached repository analysis payload."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo)
    with _lock:
        return _analysis_cache.get(key)


def set_cached_analysis(owner: str, repo: str, analysis: Dict[str, Any]) -> None:
    """Store analysis result in cache."""
    if not CACHE_ENABLED or not analysis or not analysis.get("success", False):
        return
    key = _normalize_key(owner, repo)
    with _lock:
        _analysis_cache[key] = analysis


def get_cached_repository_model(owner: str, repo: str, commit_sha: str = "") -> Optional[Dict[str, Any]]:
    """Retrieve cached RepositoryModel dict."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo, commit_sha)
    with _lock:
        return _repo_model_cache.get(key)


def set_cached_repository_model(owner: str, repo: str, model_dict: Dict[str, Any], commit_sha: str = "") -> None:
    """Store RepositoryModel dict in cache."""
    if not CACHE_ENABLED or not model_dict:
        return
    key = _normalize_key(owner, repo, commit_sha)
    with _lock:
        _repo_model_cache[key] = model_dict


def get_cached_file_contents(owner: str, repo: str) -> Optional[Dict[str, str]]:
    """Retrieve cached raw file contents dictionary."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo)
    with _lock:
        return _file_contents_cache.get(key)


def set_cached_file_contents(owner: str, repo: str, contents: Dict[str, str]) -> None:
    """Store file contents dictionary in cache."""
    if not CACHE_ENABLED or not contents:
        return
    key = _normalize_key(owner, repo)
    with _lock:
        _file_contents_cache[key] = contents


def get_cached_impact(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached impact analysis by key."""
    if not CACHE_ENABLED:
        return None
    with _lock:
        return _impact_cache.get(key)


def set_cached_impact(key: str, data: Dict[str, Any]) -> None:
    """Store impact analysis in cache."""
    if not CACHE_ENABLED or not data:
        return
    with _lock:
        _impact_cache[key] = data


def get_cached_source_file(owner: str, repo: str, commit_or_branch: str, file_path: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached single source file metadata and content."""
    if not CACHE_ENABLED:
        return None
    key = _normalize_key(owner, repo, f"{commit_or_branch or 'default'}:{file_path}")
    with _lock:
        return _source_file_cache.get(key)


def set_cached_source_file(owner: str, repo: str, commit_or_branch: str, file_path: str, data: Dict[str, Any]) -> None:
    """Store single source file metadata and content in cache."""
    if not CACHE_ENABLED or not data:
        return
    key = _normalize_key(owner, repo, f"{commit_or_branch or 'default'}:{file_path}")
    with _lock:
        _source_file_cache[key] = data


def get_cached_humanize(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve a deterministic Humanize result by revision/content key."""
    if not CACHE_ENABLED:
        return None
    with _lock:
        return _humanize_cache.get(key)


def set_cached_humanize(key: str, data: Dict[str, Any]) -> None:
    """Cache only successful deterministic Humanize results."""
    if not CACHE_ENABLED or not data or not data.get("success"):
        return
    with _lock:
        _humanize_cache[key] = data


def get_cached_refactor_plan(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve a deterministic SHA-bound refactor plan."""
    if not CACHE_ENABLED:
        return None
    with _lock:
        return _refactor_cache.get(key)


def set_cached_refactor_plan(key: str, data: Dict[str, Any]) -> None:
    """Cache successful deterministic plans only."""
    if not CACHE_ENABLED or not data or not data.get("success"):
        return
    with _lock:
        _refactor_cache[key] = data


def clear_cache() -> None:
    """Clear all caches."""
    with _lock:
        _repo_info_cache.clear()
        _tree_cache.clear()
        _analysis_cache.clear()
        _repo_model_cache.clear()
        _file_contents_cache.clear()
        _impact_cache.clear()
        _source_file_cache.clear()
        _humanize_cache.clear()
        _refactor_cache.clear()


def get_cache_stats() -> Dict[str, Any]:
    """Return diagnostic cache statistics."""
    with _lock:
        return {
            "enabled": CACHE_ENABLED,
            "ttl": DEFAULT_CACHE_TTL,
            "maxsize": DEFAULT_CACHE_MAXSIZE,
            "repo_info_count": len(_repo_info_cache),
            "tree_count": len(_tree_cache),
            "analysis_count": len(_analysis_cache),
            "repository_model_count": len(_repo_model_cache),
            "file_contents_count": len(_file_contents_cache),
            "impact_count": len(_impact_cache),
            "source_file_count": len(_source_file_cache),
            "humanize_count": len(_humanize_cache),
            "refactor_count": len(_refactor_cache),
        }

