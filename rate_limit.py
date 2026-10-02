"""
rate_limit.py
Centralized rate limiting for Repo Explainer using Flask-Limiter.
Protects sensitive and resource-heavy endpoints against abuse.
"""

import os
from flask import jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

RATELIMIT_ENABLED = os.getenv("RATELIMIT_ENABLED", "1").strip().lower() in ("1", "true", "yes")
RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
RATELIMIT_ANALYZE_DEFAULT = os.getenv("RATELIMIT_ANALYZE", "10 per minute")
RATELIMIT_DOWNLOAD_DEFAULT = os.getenv("RATELIMIT_DOWNLOAD", "30 per minute")
RATELIMIT_ASK_DEFAULT = os.getenv("RATELIMIT_ASK", "20 per minute")
RATELIMIT_TRACE_DEFAULT = os.getenv("RATELIMIT_TRACE", "30 per minute")
RATELIMIT_IMPACT_DEFAULT = os.getenv("RATELIMIT_IMPACT", "30 per minute")
RATELIMIT_SOURCE_DEFAULT = os.getenv("RATELIMIT_SOURCE", "60 per minute")
RATELIMIT_HUMANIZE_DEFAULT = os.getenv("RATELIMIT_HUMANIZE", "30 per minute")
RATELIMIT_HUMANIZE_AI_DEFAULT = os.getenv("RATELIMIT_HUMANIZE_AI", "5 per minute")
RATELIMIT_REFACTOR_DEFAULT = os.getenv("RATELIMIT_REFACTOR", "20 per minute")
RATELIMIT_REFACTOR_AI_DEFAULT = os.getenv("RATELIMIT_REFACTOR_AI", "5 per minute")


def get_client_ip():
    """Retrieve client remote IP for rate limiting."""
    return get_remote_address()


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=[],
    storage_uri=RATELIMIT_STORAGE_URI,
    enabled=RATELIMIT_ENABLED,
)


def get_analyze_limit():
    """Dynamic limit getter for repository analysis."""
    return os.getenv("RATELIMIT_ANALYZE", RATELIMIT_ANALYZE_DEFAULT)


def get_download_limit():
    """Dynamic limit getter for report downloads."""
    return os.getenv("RATELIMIT_DOWNLOAD", RATELIMIT_DOWNLOAD_DEFAULT)


def get_ask_limit():
    """Dynamic limit getter for ask repository questions."""
    return os.getenv("RATELIMIT_ASK", RATELIMIT_ASK_DEFAULT)


def get_trace_limit():
    """Dynamic limit getter for execution path tracing."""
    return os.getenv("RATELIMIT_TRACE", RATELIMIT_TRACE_DEFAULT)


def get_impact_limit():
    """Dynamic limit getter for change impact analysis."""
    return os.getenv("RATELIMIT_IMPACT", RATELIMIT_IMPACT_DEFAULT)


def get_source_limit():
    """Dynamic limit getter for single source file retrieval."""
    return os.getenv("RATELIMIT_SOURCE", RATELIMIT_SOURCE_DEFAULT)


def get_humanize_limit():
    """Limit deterministic Humanize requests."""
    return os.getenv("RATELIMIT_HUMANIZE", RATELIMIT_HUMANIZE_DEFAULT)


def get_humanize_ai_limit():
    """Stricter limit for explicitly requested AI previews."""
    return os.getenv("RATELIMIT_HUMANIZE_AI", RATELIMIT_HUMANIZE_AI_DEFAULT)


def get_refactor_limit():
    """Limit deterministic refactor planning requests."""
    return os.getenv("RATELIMIT_REFACTOR", RATELIMIT_REFACTOR_DEFAULT)


def get_refactor_ai_limit():
    """Limit explicitly requested AI plan explanations."""
    return os.getenv("RATELIMIT_REFACTOR_AI", RATELIMIT_REFACTOR_AI_DEFAULT)


def init_limiter(app):
    """Attach limiter and custom 429 error handler to the Flask application."""
    limiter.init_app(app)

    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({
            "success": False,
            "error": "Rate limit exceeded. Please wait a moment before trying again."
        }), 429
