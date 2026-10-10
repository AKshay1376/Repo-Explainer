"""Validated, bounded values permitted in durable records."""

from datetime import datetime, timezone
import re
from uuid import uuid4

from security import is_sensitive_file, sanitize_content, validate_github_url


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier():
    return uuid4().hex


def text(value, limit=300):
    if value is None:
        return ""
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError("Invalid or oversized project metadata.")
    return scrub(value).replace("\x00", "")


def scrub(value):
    sanitized = sanitize_content("durable-metadata.txt", value) or ""
    sanitized = re.sub(r"(?i)\b(?:api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key|password|token|secret)\b\s*[:=]\s*[^\s,;]+",
                       "[REDACTED SECRET]", sanitized)
    sanitized = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
                       "[REDACTED PRIVATE KEY]", sanitized)
    return sanitized


def sha(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{7,64}", value):
        raise ValueError("Invalid repository revision.")
    return value.lower()


def canonical_repo(value):
    owner, repo = validate_github_url(value)
    return f"https://github.com/{owner.lower()}/{repo.lower()}", owner, repo


def safe_path(value):
    if not isinstance(value, str) or not value or len(value) > 300 or is_sensitive_file(value):
        raise ValueError("Invalid or sensitive file path.")
    if value.startswith(("/", "\\")) or ":" in value or "\\" in value or any(part in {"", ".", ".."} for part in value.split("/")):
        raise ValueError("Invalid file path.")
    return value


def row(value):
    return dict(value) if value is not None else None
