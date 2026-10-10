"""Session authentication, CSRF, capability gates, and consistent boundary errors."""

import hmac
import secrets
from datetime import timedelta
from flask import jsonify, request, session

PUBLIC = {"/api/health", "/api/ready", "/api/version", "/api/capabilities",
          "/api/auth/login", "/api/auth/session"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def error_response(code, message, status):
    from flask import g
    request_id = getattr(g, "request_id", "")
    return jsonify({"success": False, "error": message,
                    "error_detail": {"code": code, "message": message, "request_id": request_id},
                    "request_id": request_id}), status


def install_security(app, settings):
    app.secret_key = settings.secret_key or secrets.token_hex(32)
    app.permanent_session_lifetime = timedelta(hours=settings.session_hours)
    app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SECURE=settings.production,
                      SESSION_COOKIE_SAMESITE="Lax")

    @app.errorhandler(413)
    def oversized(_error):
        return error_response("request_too_large", "Request body is too large.", 413)

    @app.errorhandler(500)
    def internal(_error):
        return error_response("internal_error", "The request could not be completed.", 500)

    @app.post("/api/auth/login")
    def login():
        if settings.auth_mode == "disabled":
            return error_response("auth_disabled", "Authentication is disabled.", 400)
        body = request.get_json(silent=True) or {}
        password = body.get("password") if isinstance(body, dict) else None
        if not isinstance(password, str) or not hmac.compare_digest(password, settings.admin_password):
            return error_response("invalid_credentials", "Invalid credentials.", 401)
        session.clear()
        session["authenticated"] = True
        session["csrf"] = secrets.token_urlsafe(32)
        session.permanent = True
        return jsonify({"success": True, "authenticated": True, "csrf_token": session["csrf"]})

    @app.get("/api/auth/session")
    def auth_session():
        return jsonify({"success": True, "auth_mode": settings.auth_mode,
                        "authenticated": bool(session.get("authenticated")),
                        "csrf_token": session.get("csrf") if session.get("authenticated") else None})

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"success": True})

    @app.before_request
    def guard():
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") not in settings.frontend_origins:
            return error_response("origin_forbidden", "Request origin is not allowed.", 403)
        if not request.path.startswith("/api/") or request.method == "OPTIONS":
            return None
        if request.content_length is not None:
            limit = settings.import_limit if request.path == "/api/local-data/import" else settings.request_limit
            if request.content_length > limit:
                return error_response("request_too_large", "Request body is too large.", 413)
        else:
            limit = settings.import_limit if request.path == "/api/local-data/import" else settings.request_limit
        request.max_content_length = limit
        if not settings.local_fs_operations and (
            request.path.startswith("/api/patch/") or
            request.path.startswith("/api/validators/") or
            request.path.startswith("/api/history/") or
            ((request.path == "/api/projects" or request.path.startswith("/api/projects/")) and
             request.method in {"POST", "PATCH"} and
             isinstance(request.get_json(silent=True), dict) and "local_path" in request.get_json(silent=True))
        ):
            return error_response("capability_unavailable", "Available only in a local or trusted deployment.", 403)
        if settings.auth_mode == "disabled" or request.path in PUBLIC:
            return None
        authenticated = session.get("authenticated") is True
        private_path = request.path.startswith((
            "/api/projects", "/api/local-data", "/api/session", "/api/settings",
            "/api/profile", "/api/storage", "/api/bookmarks", "/api/jobs",
            "/api/patch", "/api/validators", "/api/history", "/api/metrics",
        ))
        if settings.auth_mode == "required" or request.method in WRITE_METHODS or private_path:
            if not authenticated:
                return error_response("authentication_required", "Sign in to continue.", 401)
        if authenticated and request.method in WRITE_METHODS and request.path != "/api/auth/login":
            supplied = request.headers.get("X-CSRF-Token", "")
            expected = session.get("csrf", "")
            if not supplied or not expected or not hmac.compare_digest(supplied, expected):
                return error_response("csrf_invalid", "Session verification failed. Refresh and try again.", 403)
        return None
