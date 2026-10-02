import os
import re
import logging
from dotenv import load_dotenv

# Ensure .env is explicitly loaded before any submodules
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

import sys
from flask import Flask, request, jsonify, send_from_directory, render_template_string, Response
from main import analyze_repository
from report_builder import generate_report
from security import validate_github_url
from github_client import verify_github_auth
from cache_manager import (
    get_cached_analysis,
    set_cached_analysis,
    get_cache_stats,
    get_cached_repository_model,
    set_cached_repository_model,
    get_cached_file_contents,
    set_cached_file_contents,
)
from rate_limit import (
    limiter,
    init_limiter,
    get_analyze_limit,
    get_download_limit,
    get_ask_limit,
    get_trace_limit,
    get_impact_limit,
    get_source_limit,
)
from repo_qa import default_ask_service
from execution_trace import default_trace_service
from change_impact import ChangeImpactService
from source_service import get_source_file

default_impact_service = ChangeImpactService()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")

app = Flask(__name__, static_folder=None)
init_limiter(app)

FALLBACK_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GitHub Repo Explainer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #090d16;
            color: #f3f4f6;
            max-width: 900px;
            margin: 40px auto;
            padding: 20px;
        }
        h1 { color: #4ade80; text-align: center; }
        .tagline { text-align: center; color: #9ca3af; margin-bottom: 30px; }
        form { display: flex; gap: 10px; margin: 20px 0; }
        input {
            flex: 1;
            padding: 14px;
            font-size: 16px;
            background: #111827;
            border: 1px solid #374151;
            color: white;
            border-radius: 8px;
        }
        button {
            padding: 14px 24px;
            font-size: 16px;
            background: #22c55e;
            color: black;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
        }
        pre {
            white-space: pre-wrap;
            background: #111827;
            border: 1px solid #1f2937;
            padding: 20px;
            border-radius: 10px;
            color: #e5e7eb;
        }
        .error {
            background: #7f1d1d;
            color: #fecaca;
            padding: 14px;
            border-radius: 8px;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <h1>GitHub Repo Explainer</h1>
    <p class="tagline">Understand any GitHub repository in seconds.</p>
    <form method="POST">
        <input
            type="text"
            name="github_url"
            placeholder="https://github.com/owner/repository"
            required
        >
        <button type="submit">Analyze Repository</button>
    </form>
    {% if error %}
        <div class="error">{{ error }}</div>
    {% endif %}
    {% if report %}
        <h2>Repository Analysis</h2>
        <pre>{{ report }}</pre>
    {% endif %}
</body>
</html>
"""


@app.after_request
def add_cors_and_security_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.route("/api/health", methods=["GET"])
def health_check():
    auth_info = verify_github_auth()
    return jsonify({
        "status": "ok",
        "product": "GitHub Repo Explainer",
        "tagline": "Understand any GitHub repository in seconds.",
        "cache": get_cache_stats(),
        "github": {
            "has_token": auth_info["has_token"],
            "auth_status": auth_info["auth_status"],
            "rate_limit": auth_info["limit"],
            "rate_remaining": auth_info["remaining"],
        }
    })


@app.route("/api/analyze", methods=["POST", "OPTIONS"])
@limiter.limit(get_analyze_limit)
def api_analyze():
    if request.method == "OPTIONS":
        return Response(status=204)

    data = request.get_json(silent=True) or {}
    github_url = (data.get("url") or data.get("repo_url") or "").strip()

    if not github_url:
        return jsonify({"success": False, "error": "Please enter a valid GitHub repository URL."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    # 1. Check server-side cache
    cached_payload = get_cached_analysis(owner, repo)
    if cached_payload is not None:
        logger.info("Serving cached analysis for %s/%s", owner, repo)
        return jsonify(cached_payload)

    try:
        logger.info("Starting fresh analysis for %s/%s", owner, repo)
        result = analyze_repository(owner, repo)

        report = generate_report(
            result["info"],
            result["tech_stack"],
            result["folder_summary"],
            result["key_file_contents"]
        )

        raw_stack = result["tech_stack"]
        stack_list = raw_stack.get("stack_list", []) if isinstance(raw_stack, dict) else list(raw_stack)
        detected_tech = raw_stack.get("detected_technologies", []) if isinstance(raw_stack, dict) else []

        payload = {
            "success": True,
            "info": result["info"],
            "tech_stack": stack_list,
            "detected_technologies": detected_tech,
            "folder_summary": result["folder_summary"],
            "key_files": result["key_files"],
            "report": report,
            "repository_model": result.get("repository_model"),
        }

        # Store in cache only on successful complete analysis
        set_cached_analysis(owner, repo, payload)
        if result.get("repository_model"):
            set_cached_repository_model(owner, repo, result["repository_model"])
        if result.get("key_file_contents"):
            set_cached_file_contents(owner, repo, result["key_file_contents"])

        return jsonify(payload)

    except ValueError as e:
        logger.warning("Validation or repository lookup error for %s/%s: %s", owner, repo, e)
        msg = str(e)
        if "not found" in msg.lower():
            return jsonify({"success": False, "error": "Repository not found. Check the URL and try again."}), 404
        return jsonify({"success": False, "error": msg}), 400

    except RuntimeError as e:
        logger.warning("Runtime error for %s/%s: %s", owner, repo, e)
        msg = str(e)
        if "authentication failed" in msg.lower():
            return jsonify({"success": False, "error": msg}), 401
        elif "rate limit" in msg.lower():
            return jsonify({"success": False, "error": msg}), 429
        elif "forbidden" in msg.lower():
            return jsonify({"success": False, "error": msg}), 403
        elif "not found" in msg.lower():
            return jsonify({"success": False, "error": msg}), 404
        return jsonify({"success": False, "error": msg or "An error occurred while connecting to GitHub. Please try again."}), 502

    except Exception as e:
        # Never leak internal credentials, tokens, or traceback in client response
        logger.exception("Unexpected error during analysis for %s/%s", owner, repo)
        return jsonify({"success": False, "error": "Analysis could not be completed. Please try again."}), 500


@app.route("/api/ask", methods=["POST", "OPTIONS"])
@limiter.limit(get_ask_limit)
def api_ask():
    """Answer developer questions about an analyzed repository using grounded evidence."""
    if request.method == "OPTIONS":
        return Response(status=204)

    data = request.get_json(silent=True) or {}
    github_url = (data.get("url") or data.get("repo_url") or "").strip()
    query = (data.get("query") or data.get("question") or "").strip()
    conversation_history = data.get("conversation_history") or []
    scoped_file = data.get("scoped_file")
    scoped_edge = data.get("scoped_edge")

    if not query:
        return jsonify({"success": False, "error": "Please provide a question."}), 400

    if not github_url:
        return jsonify({"success": False, "error": "Repository URL is required."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    # Retrieve repository model from cache or client payload
    repo_model = get_cached_repository_model(owner, repo) or data.get("repository_model")
    cached_contents = get_cached_file_contents(owner, repo) or {}

    if not repo_model:
        # If not cached, run full analysis to construct model
        try:
            logger.info("Repository model not in cache for %s/%s; analyzing before answering question", owner, repo)
            analysis_res = analyze_repository(owner, repo)
            repo_model = analysis_res.get("repository_model")
            cached_contents = analysis_res.get("key_file_contents", {})
            if repo_model:
                set_cached_repository_model(owner, repo, repo_model)
            if cached_contents:
                set_cached_file_contents(owner, repo, cached_contents)
        except Exception as e:
            logger.warning("Failed to analyze repository for QA: %s", e)
            return jsonify({
                "success": False,
                "error": "This repository must be analyzed before asking questions. Please analyze it first."
            }), 400

    if not repo_model:
        return jsonify({"success": False, "error": "Unable to load repository intelligence model."}), 500

    try:
        response_data = default_ask_service.ask(
            query=query,
            repo_model=repo_model,
            conversation_history=conversation_history,
            scoped_file=scoped_file,
            scoped_edge=scoped_edge,
            available_contents=cached_contents,
            owner=owner,
            repo=repo
        )
        return jsonify({
            "success": True,
            **response_data
        })
    except Exception as e:
        logger.exception("Error answering question for %s/%s: %s", owner, repo, e)
        return jsonify({"success": False, "error": "Failed to generate answer. Please try again."}), 500


@app.route("/api/ask/stream", methods=["POST", "OPTIONS"])
@limiter.limit(get_ask_limit)
def api_ask_stream():
    """Stream answers token-by-token using Server-Sent Events (SSE)."""
    if request.method == "OPTIONS":
        return Response(status=204)

    data = request.get_json(silent=True) or {}
    github_url = (data.get("url") or data.get("repo_url") or "").strip()
    query = (data.get("query") or data.get("question") or "").strip()
    conversation_history = data.get("conversation_history") or []
    scoped_file = data.get("scoped_file")
    scoped_edge = data.get("scoped_edge")

    if not query or not github_url:
        return jsonify({"success": False, "error": "Both query and repository URL are required."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    repo_model = get_cached_repository_model(owner, repo) or data.get("repository_model")
    cached_contents = get_cached_file_contents(owner, repo) or {}

    if not repo_model:
        try:
            analysis_res = analyze_repository(owner, repo)
            repo_model = analysis_res.get("repository_model")
            cached_contents = analysis_res.get("key_file_contents", {})
            if repo_model:
                set_cached_repository_model(owner, repo, repo_model)
            if cached_contents:
                set_cached_file_contents(owner, repo, cached_contents)
        except Exception as e:
            return jsonify({"success": False, "error": "Please analyze repository first."}), 400

    def generate_events():
        for event in default_ask_service.ask_stream(
            query=query,
            repo_model=repo_model,
            conversation_history=conversation_history,
            scoped_file=scoped_file,
            scoped_edge=scoped_edge,
            available_contents=cached_contents,
            owner=owner,
            repo=repo
        ):
            yield event

    resp = Response(generate_events(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


@app.route("/api/trace", methods=["POST", "OPTIONS"])
@limiter.limit(get_trace_limit)
def api_trace():
    """Compute deterministic execution traces through the repository."""
    if request.method == "OPTIONS":
        return Response(status=204)

    data = request.get_json(silent=True) or {}
    github_url = (data.get("url") or data.get("repo_url") or "").strip()
    query = (data.get("query") or "").strip()
    start_file = data.get("start_file")
    start_symbol = data.get("start_symbol")
    route = data.get("route")
    ask_repo_context = data.get("ask_repo_context")

    if not github_url:
        # Check repository object format
        repo_obj = data.get("repository") or {}
        owner_name = repo_obj.get("owner", "")
        repo_name = repo_obj.get("repo", "")
        if owner_name and repo_name:
            github_url = f"https://github.com/{owner_name}/{repo_name}"

    if not github_url:
        return jsonify({"success": False, "error": "Repository URL is required."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    repo_model = get_cached_repository_model(owner, repo) or data.get("repository_model")
    cached_contents = get_cached_file_contents(owner, repo) or {}

    if not repo_model:
        try:
            logger.info("Repository model not in cache for %s/%s; analyzing before tracing", owner, repo)
            analysis_res = analyze_repository(owner, repo)
            repo_model = analysis_res.get("repository_model")
            cached_contents = analysis_res.get("key_file_contents", {})
            if repo_model:
                set_cached_repository_model(owner, repo, repo_model)
            if cached_contents:
                set_cached_file_contents(owner, repo, cached_contents)
        except Exception as e:
            logger.warning("Failed to analyze repository for trace: %s", e)
            return jsonify({
                "success": False,
                "error": "This repository must be analyzed before tracing. Please analyze it first."
            }), 400

    if not repo_model:
        return jsonify({"success": False, "error": "Unable to load repository intelligence model."}), 500

    try:
        trace_result = default_trace_service.trace_execution(
            repo_model=repo_model,
            query=query,
            start_file=start_file,
            start_symbol=start_symbol,
            route=route,
            ask_repo_context=ask_repo_context,
            file_contents=cached_contents
        )
        return jsonify(trace_result)
    except Exception as e:
        logger.exception("Error computing execution trace for %s/%s: %s", owner, repo, e)
        return jsonify({"success": False, "error": "Failed to compute execution trace. Please try again."}), 500


@app.route("/api/impact", methods=["POST", "OPTIONS"])
@limiter.limit(get_impact_limit)
def api_impact():
    """Compute deterministic change impact analysis for a file, symbol, route, model, or env var."""
    if request.method == "OPTIONS":
        return Response(status=204)

    data = request.get_json(silent=True) or {}
    github_url = (data.get("url") or data.get("repo_url") or "").strip()
    target_file = data.get("target_file")
    target_symbol = data.get("target_symbol")
    target_route = data.get("target_route")
    target_model = data.get("target_model")
    target_env_var = data.get("target_env_var")
    change_type = data.get("change_type", "GENERAL")
    depth = data.get("depth", 2)

    if not github_url:
        repo_obj = data.get("repository") or {}
        owner_name = repo_obj.get("owner", "")
        repo_name = repo_obj.get("repo", "")
        if owner_name and repo_name:
            github_url = f"https://github.com/{owner_name}/{repo_name}"

    if not github_url:
        return jsonify({"success": False, "error": "Repository URL is required."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    repo_model = get_cached_repository_model(owner, repo) or data.get("repository_model")
    cached_contents = get_cached_file_contents(owner, repo) or {}

    if not repo_model:
        try:
            logger.info("Repository model not in cache for %s/%s; analyzing before impact analysis", owner, repo)
            analysis_res = analyze_repository(owner, repo)
            repo_model = analysis_res.get("repository_model")
            cached_contents = analysis_res.get("key_file_contents", {})
            if repo_model:
                set_cached_repository_model(owner, repo, repo_model)
            if cached_contents:
                set_cached_file_contents(owner, repo, cached_contents)
        except Exception as e:
            logger.warning("Failed to analyze repository for impact analysis: %s", e)
            return jsonify({
                "success": False,
                "error": "This repository must be analyzed before running change impact analysis. Please analyze it first."
            }), 400

    if not repo_model:
        return jsonify({"success": False, "error": "Unable to load repository intelligence model."}), 500

    try:
        impact_result = default_impact_service.analyze_impact(
            repo_model=repo_model,
            target_file=target_file,
            target_symbol=target_symbol,
            target_route=target_route,
            target_model=target_model,
            target_env_var=target_env_var,
            change_type=change_type,
            depth=depth,
            file_contents=cached_contents,
            repo_cache_key=f"{owner}/{repo}",
        )
        return jsonify(impact_result)
    except Exception as e:
        logger.exception("Error computing change impact for %s/%s: %s", owner, repo, e)
        return jsonify({"success": False, "error": "Failed to compute change impact. Please try again."}), 500


@app.route("/api/source", methods=["GET", "POST", "OPTIONS"])
@limiter.limit(get_source_limit)
def api_source():
    """Retrieve, sanitize, and return a single source file from cache or GitHub."""
    if request.method == "OPTIONS":
        return Response(status=204)

    if request.method == "GET":
        github_url = (request.args.get("url") or request.args.get("repo_url") or "").strip()
        file_path = (request.args.get("path") or request.args.get("file_path") or "").strip()
        commit_or_branch = (request.args.get("commit") or request.args.get("ref") or request.args.get("branch") or "").strip()
    else:
        data = request.get_json(silent=True) or {}
        github_url = (data.get("url") or data.get("repo_url") or "").strip()
        file_path = (data.get("path") or data.get("file_path") or "").strip()
        commit_or_branch = (data.get("commit_sha") or data.get("commit") or data.get("ref") or data.get("branch") or "").strip()

    if not github_url:
        return jsonify({"success": False, "error": "Repository URL is required."}), 400

    if not file_path:
        return jsonify({"success": False, "error": "File path is required."}), 400

    try:
        owner, repo = validate_github_url(github_url)
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400

    repo_model = get_cached_repository_model(owner, repo)

    try:
        source_result = get_source_file(
            owner=owner,
            repo=repo,
            file_path=file_path,
            commit_or_branch=commit_or_branch or None,
            repo_model=repo_model,
        )
        return jsonify(source_result)
    except Exception as e:
        logger.exception("Error retrieving source file %s for %s/%s: %s", file_path, owner, repo, e)
        return jsonify({"success": False, "error": f"Failed to retrieve source file: {str(e)}"}), 500


@app.route("/api/download", methods=["POST"])
@limiter.limit(get_download_limit)
def api_download():
    """Safely stream the markdown report as a downloadable file."""
    data = request.get_json(silent=True) or {}
    report_content = data.get("report", "")
    repo_name = data.get("name", "repository")

    if not report_content:
        return jsonify({"error": "No report content provided."}), 400

    # Sanitize repo name for safe filename
    safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", repo_name).strip("_") or "report"
    filename = f"{safe_name}-explanation.md"

    response = Response(report_content, mimetype="text/markdown; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


# Static file serving & SPA routing
@app.route("/", defaults={"path": ""}, methods=["GET", "POST"])
@app.route("/<path:path>", methods=["GET", "POST"])
def serve_spa(path):
    # Handle legacy POST on root route for backward compatibility
    if request.method == "POST" and (path == "" or path == "index.html"):
        github_url = request.form.get("github_url", "").strip()
        report = None
        error = None

        try:
            owner, repo = validate_github_url(github_url)
            result = analyze_repository(owner, repo)
            report = generate_report(
                result["info"],
                result["tech_stack"],
                result["folder_summary"],
                result["key_file_contents"]
            )
        except ValueError as e:
            msg = str(e)
            error = "Repository not found. Check the URL and try again." if "not found" in msg.lower() else msg
        except RuntimeError as e:
            msg = str(e)
            error = "GitHub API rate limit reached. Please try again later." if "rate limit" in msg.lower() else "GitHub connection error."
        except Exception:
            logger.exception("Legacy form submission error")
            error = "AI analysis could not be completed. Please try again."

        return render_template_string(FALLBACK_HTML, report=report, error=error)

    # Serve built React frontend if available
    if os.path.exists(FRONTEND_DIST):
        target = os.path.join(FRONTEND_DIST, path)
        if path and os.path.isfile(target):
            return send_from_directory(FRONTEND_DIST, path)
        return send_from_directory(FRONTEND_DIST, "index.html")

    # If frontend not yet built, serve the fallback HTML
    return render_template_string(FALLBACK_HTML, report=None, error=None)


if __name__ == "__main__":
    is_dev = os.getenv("FLASK_ENV") == "development" or os.getenv("FLASK_DEBUG", "0") in ("1", "true")
    is_prod_flag = "--prod" in sys.argv or os.getenv("SERVER_MODE") == "production"
    port = int(os.getenv("PORT", 5000))
    auth = verify_github_auth()
    logger.info("GitHub Auth Status: %s | Limit: %s | Remaining: %s", auth["auth_status"], auth["limit"], auth["remaining"])

    if is_prod_flag or (not is_dev and os.getenv("FLASK_ENV") == "production"):
        try:
            from waitress import serve
            logger.info("Starting production server (Waitress) on port %d...", port)
            serve(app, host="0.0.0.0", port=port)
        except ImportError:
            logger.warning("Waitress not available, falling back to standard server.")
            app.run(host="0.0.0.0", port=port, debug=False)
    else:
        logger.info("Starting development server on port %d (debug=%s)...", port, is_dev)
        app.run(host="0.0.0.0", port=port, debug=is_dev)