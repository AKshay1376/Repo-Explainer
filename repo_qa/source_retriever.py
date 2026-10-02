"""
repo_qa/source_retriever.py
Safe, budget-capped source code extraction with secret sanitization.
Extracts relevant snippets from analyzed or cached repository files.
"""

import os
from typing import Dict, List, Optional
from security import sanitize_content, limit_content_size
from github_client import get_files_content_parallel


MAX_CHARS_PER_EXCERPT = 2500
MAX_TOTAL_SOURCE_CHARS = 10000


def get_source_excerpts_for_files(
    file_paths: List[str],
    available_contents: Optional[Dict[str, str]] = None,
    owner: str = "",
    repo: str = "",
    branch: str = "main",
    max_files: int = 4
) -> Dict[str, str]:
    """
    Retrieve sanitized, bounded source code excerpts for top candidate files.
    Prefers in-memory contents and lazily fetches missing files when needed.
    """
    excerpts: Dict[str, str] = {}
    available = dict(available_contents or {})
    to_fetch: List[str] = []

    # Filter down to top max_files
    target_files = file_paths[:max_files]

    for path in target_files:
        if path in available and available[path]:
            excerpts[path] = available[path]
        else:
            to_fetch.append(path)

    # Lazily fetch missing files if owner and repo are known
    if to_fetch and owner and repo:
        try:
            fetched = get_files_content_parallel(
                owner=owner,
                repo=repo,
                file_paths=to_fetch,
                branch=branch,
                max_workers=2
            )
            for path, content in fetched.items():
                if content:
                    excerpts[path] = content
        except Exception:
            # Tolerant: Q&A must never crash if individual source retrieval fails
            pass

    # Sanitize and truncate excerpts
    total_chars = 0
    final_excerpts: Dict[str, str] = {}

    for path in target_files:
        if path not in excerpts:
            continue

        raw = excerpts[path]
        sanitized = sanitize_content(path, raw)
        if sanitized is None:
            continue

        # Cap characters per file
        capped = limit_content_size(sanitized, max_chars=MAX_CHARS_PER_EXCERPT)
        if total_chars + len(capped) > MAX_TOTAL_SOURCE_CHARS:
            remaining_budget = max(0, MAX_TOTAL_SOURCE_CHARS - total_chars)
            if remaining_budget > 300:
                capped = capped[:remaining_budget] + "\n... [Source truncated for context limit]"
                final_excerpts[path] = capped
                total_chars += len(capped)
            break
        else:
            final_excerpts[path] = capped
            total_chars += len(capped)

    return final_excerpts
