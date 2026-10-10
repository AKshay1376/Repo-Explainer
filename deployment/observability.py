"""Minimal structured request logs. Never record bodies, tokens, or source paths."""

import json
import logging
import re
import time
import uuid
import threading
from flask import g, request

REQUEST_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
SECRET = re.compile(r"(?i)(bearer\s+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*)\S+")
CONNECTION = re.compile(r"(?i)(?:postgres(?:ql)?|mysql|mongodb|redis)://[^\s]+")
TOKEN = re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}")
_error_reporter = None


def set_error_reporter(callback):
    """Optional vendor-neutral callback receiving only exception type and request ID."""
    global _error_reporter
    _error_reporter = callback


class RedactingFilter(logging.Filter):
    def filter(self, record):
        message = CONNECTION.sub("[redacted-connection]", str(record.getMessage()))
        message = SECRET.sub(r"\1[redacted]", message)
        record.msg = TOKEN.sub("[redacted]", message)
        record.args = ()
        return True


class RedactingFormatter(logging.Formatter):
    def format(self, record):
        message = super().format(record)
        message = CONNECTION.sub("[redacted-connection]", message)
        message = SECRET.sub(r"\1[redacted]", message)
        return TOKEN.sub("[redacted]", message)


def install_observability(app):
    metrics = {"requests": 0, "errors": 0, "duration_ms_total": 0.0}
    metrics_lock = threading.Lock()
    app.extensions["repo_metrics"] = (metrics, metrics_lock)
    if not any(isinstance(item, RedactingFilter) for existing in logging.getLogger().handlers for item in existing.filters):
        for existing in logging.getLogger().handlers:
            existing.addFilter(RedactingFilter())
            original = existing.formatter
            existing.setFormatter(RedactingFormatter(original._fmt if original else "%(message)s"))

    @app.before_request
    def start_request():
        candidate = request.headers.get("X-Request-ID", "")
        g.request_id = candidate if REQUEST_ID.fullmatch(candidate) else uuid.uuid4().hex
        g.request_started = time.monotonic()

    @app.after_request
    def finish_request(response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        if request.path.startswith("/api/"):
            duration = round((time.monotonic() - getattr(g, "request_started", time.monotonic())) * 1000, 2)
            with metrics_lock:
                metrics["requests"] += 1
                metrics["errors"] += int(response.status_code >= 500)
                metrics["duration_ms_total"] += duration
            logging.getLogger("repo_explainer.requests").info(json.dumps({
                "timestamp": int(time.time()), "level": "info",
                "request_id": getattr(g, "request_id", ""),
                "route": request.url_rule.rule if request.url_rule else "<unmatched>",
                "status": response.status_code,
                "duration_ms": duration,
            }))
        if response.status_code >= 400 and response.is_json:
            payload = response.get_json(silent=True)
            if isinstance(payload, dict) and isinstance(payload.get("error"), str):
                payload.setdefault("request_id", getattr(g, "request_id", ""))
                payload.setdefault("error_detail", {
                    "code": f"http_{response.status_code}", "message": payload["error"],
                    "request_id": getattr(g, "request_id", ""),
                })
                response.set_data(json.dumps(payload))
        return response

    @app.teardown_request
    def report_uncaught(error):
        if error is not None and _error_reporter is not None:
            try:
                _error_reporter(type(error).__name__, getattr(g, "request_id", ""))
            except Exception:
                pass
