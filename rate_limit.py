"""
rate_limit.py
Centralized rate limiting for Repo Explainer using Flask-Limiter.
Protects sensitive and resource-heavy endpoints against abuse.
"""

from flask import jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import load_settings

_settings = load_settings()

RATELIMIT_ENABLED = _settings.rate_limit_enabled
RATELIMIT_STORAGE_URI = _settings.rate_limit_storage
RATELIMIT_ANALYZE_DEFAULT = _settings.rate_limits["analyze"]
RATELIMIT_DOWNLOAD_DEFAULT = _settings.rate_limits["download"]
RATELIMIT_ASK_DEFAULT = _settings.rate_limits["ask"]
RATELIMIT_TRACE_DEFAULT = _settings.rate_limits["trace"]
RATELIMIT_IMPACT_DEFAULT = _settings.rate_limits["impact"]
RATELIMIT_SOURCE_DEFAULT = _settings.rate_limits["source"]
RATELIMIT_HUMANIZE_DEFAULT = _settings.rate_limits["humanize"]
RATELIMIT_HUMANIZE_AI_DEFAULT = _settings.rate_limits["humanize_ai"]
RATELIMIT_REFACTOR_DEFAULT = _settings.rate_limits["refactor"]
RATELIMIT_REFACTOR_AI_DEFAULT = _settings.rate_limits["refactor_ai"]
RATELIMIT_VALIDATOR_RUN_DEFAULT = _settings.rate_limits["validator_run"]


def get_client_ip():
    """Retrieve client remote IP for rate limiting."""
    return get_remote_address()


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["120 per minute"] if _settings.production else [],
    storage_uri=RATELIMIT_STORAGE_URI,
    enabled=RATELIMIT_ENABLED,
)


def get_analyze_limit():
    """Dynamic limit getter for repository analysis."""
    return RATELIMIT_ANALYZE_DEFAULT


def get_download_limit():
    """Dynamic limit getter for report downloads."""
    return RATELIMIT_DOWNLOAD_DEFAULT


def get_ask_limit():
    """Dynamic limit getter for ask repository questions."""
    return RATELIMIT_ASK_DEFAULT


def get_trace_limit():
    """Dynamic limit getter for execution path tracing."""
    return RATELIMIT_TRACE_DEFAULT


def get_impact_limit():
    """Dynamic limit getter for change impact analysis."""
    return RATELIMIT_IMPACT_DEFAULT


def get_source_limit():
    """Dynamic limit getter for single source file retrieval."""
    return RATELIMIT_SOURCE_DEFAULT


def get_humanize_limit():
    """Limit deterministic Humanize requests."""
    return RATELIMIT_HUMANIZE_DEFAULT


def get_humanize_ai_limit():
    """Stricter limit for explicitly requested AI previews."""
    return RATELIMIT_HUMANIZE_AI_DEFAULT


def get_refactor_limit():
    """Limit deterministic refactor planning requests."""
    return RATELIMIT_REFACTOR_DEFAULT


def get_refactor_ai_limit():
    """Limit explicitly requested AI plan explanations."""
    return RATELIMIT_REFACTOR_AI_DEFAULT


def get_validator_run_limit():
    return RATELIMIT_VALIDATOR_RUN_DEFAULT


def init_limiter(app):
    """Attach limiter and custom 429 error handler to the Flask application."""
    limiter.init_app(app)

    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({
            "success": False,
            "error": "Rate limit exceeded. Please wait a moment before trying again."
        }), 429
