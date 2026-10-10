"""Loopback-only local data API. No account or network sync is required."""

import sqlite3
from urllib.parse import urlparse

from flask import Blueprint, Response, jsonify, request

from .service import PersistenceService


def create_blueprint(service: PersistenceService):
    api = Blueprint("local_persistence", __name__, url_prefix="/api")

    @api.before_request
    def local_only():
        if request.remote_addr not in {"127.0.0.1", "::1", "localhost"}:
            return jsonify({"success": False, "error": "Local project data is available only on this computer."}), 403
        origin = request.headers.get("Origin")
        if origin:
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost"}:
                return jsonify({"success": False, "error": "Local project data requires a local app origin."}), 403
        limit = 10_000_000 if request.path == "/api/local-data/import" else 1_000_000
        if request.content_length is not None and request.content_length > limit:
            return jsonify({"success": False, "error": "Local data request is too large."}), 413

    @api.errorhandler(ValueError)
    def invalid(error):
        return jsonify({"success": False, "error": str(error)}), 400

    @api.errorhandler(sqlite3.DatabaseError)
    def database_error(_error):
        return jsonify({"success": False, "error": "Local database is unavailable or damaged. Saved files were not deleted."}), 503

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("A JSON object is required.")
        return value

    @api.route("/projects", methods=["GET", "POST"])
    def project_collection():
        if request.method == "GET":
            return jsonify({"success": True, "projects": service.list_projects(
                archived=request.args.get("archived") == "true", query=request.args.get("q", ""))})
        value = body()
        project = service.save_project(value.get("repo_url"), name=value.get("name"),
            description=value.get("description", ""), local_path=value.get("local_path"),
            branch=value.get("branch"), repo_sha=value.get("repo_sha"),
            allow_duplicate=value.get("allow_duplicate") is True)
        return jsonify({"success": True, "project": project}), (201 if project["created"] else 200)

    @api.route("/projects/<project_id>", methods=["GET", "PATCH", "DELETE"])
    def project_item(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "project": service.get_project(project_id)})
        if request.method == "PATCH":
            return jsonify({"success": True, "project": service.update_project(project_id, body())})
        return jsonify({"success": True, **service.delete_project(project_id, confirm=body().get("confirm_delete") is True)})

    @api.post("/projects/<project_id>/open")
    def project_open(project_id):
        return jsonify({"success": True, "project": service.open_project(project_id)})

    @api.get("/projects/<project_id>/activity")
    def activity(project_id):
        return jsonify({"success": True, "activity": service.activity(project_id)})

    @api.route("/projects/<project_id>/analyses", methods=["GET", "POST"])
    def analysis_collection(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "analyses": service.analyses(project_id)})
        value = body()
        return jsonify({"success": True, "analysis": service.add_analysis(project_id, value.get("analysis_type"),
            repo_sha=value.get("repo_sha"), summary=value.get("summary", ""),
            status=value.get("status", "complete"), metrics=value.get("metrics"))}), 201

    @api.get("/projects/<project_id>/analyses/compare")
    def analysis_compare(project_id):
        return jsonify({"success": True, "comparison": service.compare(project_id,
            request.args.get("before"), request.args.get("after"))})

    @api.route("/projects/<project_id>/documents", methods=["GET", "POST"])
    def document_collection(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "documents": service.documents(project_id)})
        value = body()
        # A saved document must come from the server's generated, sanitized document cache.
        from web_app import default_documentation_service
        generated = default_documentation_service.get(value.get("document_id"))
        project = service.get_project(project_id)
        if generated.get("repository", {}).get("owner", "").lower() != project["owner"].lower() or \
           generated.get("repository", {}).get("repo", "").lower() != project["repo_name"].lower():
            raise ValueError("Document repository does not match this project.")
        content, _, _ = default_documentation_service.export(generated, value.get("format", "markdown"))
        return jsonify({"success": True, "document": service.save_document(project_id, generated, content,
            value.get("format", "markdown"))}), 201

    @api.route("/projects/<project_id>/documents/<document_id>", methods=["GET", "DELETE"])
    def document_item(project_id, document_id):
        if request.method == "GET":
            return jsonify({"success": True, "document": service.document(project_id, document_id)})
        service.delete_document(project_id, document_id)
        return jsonify({"success": True})

    @api.post("/projects/<project_id>/documents/<document_id>/duplicate")
    def document_duplicate(project_id, document_id):
        return jsonify({"success": True, "document": service.duplicate_document(project_id, document_id)}), 201

    @api.get("/projects/<project_id>/documents/<document_id>/export")
    def document_export(project_id, document_id):
        item = service.document(project_id, document_id)
        mimetype = {"markdown": "text/markdown", "html": "text/html", "json": "application/json"}[item["format"]]
        extension = "md" if item["format"] == "markdown" else item["format"]
        return Response(item["content"], content_type=mimetype + "; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="saved-document.{extension}"'})

    @api.route("/projects/<project_id>/bookmarks", methods=["GET", "POST"])
    def project_bookmarks(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "bookmarks": service.bookmarks(project_id)})
        value = body()
        return jsonify({"success": True, "bookmark": service.bookmark(project_id, value.get("type"),
            value.get("target"), value.get("label"))}), 201

    @api.post("/bookmarks")
    def bookmark_alias():
        value = body()
        return jsonify({"success": True, "bookmark": service.bookmark(value.get("project_id"),
            value.get("type"), value.get("target"), value.get("label"))}), 201

    @api.delete("/bookmarks/<bookmark_id>")
    def bookmark_delete(bookmark_id):
        service.delete_bookmark(bookmark_id)
        return jsonify({"success": True})

    @api.route("/projects/<project_id>/recent", methods=["GET", "POST"])
    def project_recent(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "recent": service.recent(project_id)})
        value = body()
        return jsonify({"success": True, "recent": service.add_recent(project_id, value.get("type"),
            value.get("target"), value.get("view"))})

    @api.get("/projects/<project_id>/patches")
    def project_patches(project_id):
        return jsonify({"success": True, "patches": service.patches(project_id)})

    @api.route("/projects/<project_id>/plans", methods=["GET", "POST"])
    def project_plans(project_id):
        if request.method == "GET":
            return jsonify({"success": True, "plans": service.plans(project_id)})
        return jsonify({"success": True, "plan": service.save_plan(project_id, body())}), 201

    @api.route("/session", methods=["GET", "PUT"])
    def workspace_session():
        if request.method == "GET":
            return jsonify({"success": True, "session": service.session(request.args.get("current_sha"))})
        return jsonify({"success": True, "session": service.save_session(body())})

    @api.route("/settings", methods=["GET", "PATCH"])
    def settings():
        return jsonify({"success": True, "settings": service.settings() if request.method == "GET" else service.save_settings(body())})

    @api.route("/profile", methods=["GET", "PATCH"])
    def profile():
        return jsonify({"success": True, "profile": service.profile() if request.method == "GET" else
                        service.save_profile(body().get("display_name"))})

    @api.get("/storage")
    def storage():
        return jsonify({"success": True, "storage": service.storage()})

    @api.get("/local-data/export")
    def export_data():
        return jsonify({"success": True, "data": service.export_data()})

    @api.post("/local-data/import")
    def import_data():
        return jsonify({"success": True, **service.import_data(body())})

    return api
