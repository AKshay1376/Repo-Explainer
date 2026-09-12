import os
import re
import logging
from dotenv import load_dotenv

# Ensure .env is explicitly loaded before any submodules
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

from flask import Flask, request, jsonify, send_from_directory, render_template_string, Response
from main import analyze_repository
from report_builder import generate_report
from security import validate_github_url
from github_client import verify_github_auth

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")

app = Flask(__name__, static_folder=None)

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
        "github": {
            "has_token": auth_info["has_token"],
            "auth_status": auth_info["auth_status"],
            "rate_limit": auth_info["limit"],
            "rate_remaining": auth_info["remaining"],
        }
    })


@app.route("/api/analyze", methods=["POST", "OPTIONS"])
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

    try:
        logger.info("Starting analysis for %s/%s", owner, repo)
        result = analyze_repository(owner, repo)

        report = generate_report(
            result["info"],
            result["tech_stack"],
            result["folder_summary"],
            result["key_file_contents"]
        )

        return jsonify({
            "success": True,
            "info": result["info"],
            "tech_stack": result["tech_stack"],
            "folder_summary": result["folder_summary"],
            "key_files": result["key_files"],
            "report": report
        })

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


@app.route("/api/download", methods=["POST"])
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
    port = int(os.getenv("PORT", 5000))
    auth = verify_github_auth()
    logger.info("GitHub Auth Status: %s | Limit: %s | Remaining: %s", auth["auth_status"], auth["limit"], auth["remaining"])
    app.run(host="0.0.0.0", port=port, debug=is_dev)