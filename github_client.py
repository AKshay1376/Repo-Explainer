import base64
import os
import requests
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Ensure .env from project root is explicitly loaded
load_dotenv(os.path.join(BASE_DIR, ".env"))

BASE_URL = "https://api.github.com"


def get_headers():
    """
    Construct GitHub API request headers dynamically.
    Ensures GITHUB_TOKEN is read fresh from the environment on every call
    and strips any accidental surrounding quotes or whitespace.
    """
    token = os.getenv("GITHUB_TOKEN")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        cleaned_token = token.strip().strip("'\"")
        if cleaned_token:
            headers["Authorization"] = f"Bearer {cleaned_token}"
    return headers


def handle_github_response(response, resource_name="Repository"):
    """
    Inspect GitHub HTTP status, headers, and body to produce
    clear, specific error messages without leaking tokens.
    """
    if response.status_code in (200, 201):
        return

    if response.status_code == 401:
        raise RuntimeError(
            "GitHub authentication failed. Your GITHUB_TOKEN is invalid, expired, or revoked."
        )

    if response.status_code == 404:
        raise ValueError(f"{resource_name} not found. Check the GitHub URL.")

    if response.status_code == 429:
        raise RuntimeError(
            "GitHub API rate limit exceeded. Please wait a few minutes before trying again."
        )

    if response.status_code == 403:
        remaining = response.headers.get("x-ratelimit-remaining")
        body_text = ""
        try:
            body_json = response.json()
            body_text = str(body_json.get("message", "")).lower()
        except Exception:
            body_text = response.text.lower()

        if remaining == "0" or "rate limit" in body_text:
            token = os.getenv("GITHUB_TOKEN")
            if not token or not token.strip():
                raise RuntimeError(
                    "GitHub API rate limit reached (60 requests/hour unauthenticated limit). "
                    "Add a personal GITHUB_TOKEN to .env to unlock 5,000 requests/hour."
                )
            else:
                raise RuntimeError(
                    "GitHub API rate limit reached on your GITHUB_TOKEN. "
                    "Please wait for your hourly quota window to reset."
                )
        elif "abuse" in body_text or "secondary" in body_text:
            raise RuntimeError(
                "GitHub secondary rate limit triggered. Please wait a moment before trying again."
            )
        elif "saml" in body_text or "sso" in body_text:
            raise RuntimeError(
                "GitHub organization SAML SSO authorization is required to access this repository."
            )
        else:
            raise RuntimeError(
                f"GitHub access forbidden for {resource_name}. The repository may be private or requires additional permissions."
            )

    response.raise_for_status()


def verify_github_auth():
    """
    Safely diagnose GitHub authentication and rate-limit status without leaking tokens.
    Returns a dictionary of safe diagnostic metrics.
    """
    headers = get_headers()
    has_token = "Authorization" in headers

    result = {
        "has_token": has_token,
        "auth_status": "UNAUTHENTICATED",
        "user": None,
        "limit": 0,
        "remaining": 0,
        "reset_time": 0,
    }

    try:
        rate_resp = requests.get(f"{BASE_URL}/rate_limit", headers=headers, timeout=10)
        if rate_resp.status_code == 200:
            rate_data = rate_resp.json().get("rate", {})
            result["limit"] = rate_data.get("limit", 0)
            result["remaining"] = rate_data.get("remaining", 0)
            result["reset_time"] = rate_data.get("reset", 0)
        elif rate_resp.status_code == 401:
            result["auth_status"] = "FAILED (401 Bad Credentials)"
            return result

        if has_token:
            user_resp = requests.get(f"{BASE_URL}/user", headers=headers, timeout=10)
            if user_resp.status_code == 200:
                result["auth_status"] = "SUCCESS"
                result["user"] = user_resp.json().get("login")
            elif user_resp.status_code == 401:
                result["auth_status"] = "FAILED (401 Bad Credentials)"
            else:
                result["auth_status"] = f"FAILED ({user_resp.status_code})"
    except Exception as e:
        result["auth_status"] = f"ERROR ({type(e).__name__})"

    return result


def get_repo_info(owner, repo):
    """Fetch basic repository information."""
    url = f"{BASE_URL}/repos/{owner}/{repo}"
    headers = get_headers()

    try:
        response = requests.get(url, headers=headers, timeout=15)
    except requests.exceptions.Timeout:
        raise RuntimeError("GitHub API request timed out. Please try again.")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Unable to connect to GitHub: {e}")

    handle_github_response(response, resource_name=f"Repository '{owner}/{repo}'")

    data = response.json()

    return {
        "name": data["name"],
        "description": data.get("description"),
        "stars": data.get("stargazers_count", 0),
        "language": data.get("language"),
        "default_branch": data.get("default_branch", "main"),
    }


def get_tree(owner, repo, branch):
    """Fetch the repository's complete file tree."""
    url = f"{BASE_URL}/repos/{owner}/{repo}/git/trees/{branch}"
    params = {"recursive": "1"}
    headers = get_headers()

    try:
        response = requests.get(url, params=params, headers=headers, timeout=20)
    except requests.exceptions.Timeout:
        raise RuntimeError("GitHub API request timed out while fetching file tree. Please try again.")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Unable to connect to GitHub: {e}")

    handle_github_response(response, resource_name=f"Repository tree for '{owner}/{repo}'")

    data = response.json()

    if data.get("truncated"):
        print(
            "Warning: GitHub returned a truncated file tree. "
            "The repository may contain too many files."
        )

    return [
        item["path"]
        for item in data.get("tree", [])
        if item.get("type") == "blob"
    ]


def get_file_content(owner, repo, path, branch=None):
    """Fetch and decode a single file."""
    url = f"{BASE_URL}/repos/{owner}/{repo}/contents/{path}"
    params = {}
    if branch:
        params["ref"] = branch
    headers = get_headers()

    try:
        response = requests.get(url, params=params, headers=headers, timeout=15)
    except requests.exceptions.Timeout:
        raise RuntimeError(f"GitHub API request timed out while fetching {path}.")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"Unable to connect to GitHub to fetch {path}: {e}")

    handle_github_response(response, resource_name=f"File '{path}'")

    data = response.json()

    if data.get("encoding") != "base64" or "content" not in data:
        raise ValueError(f"Unsupported file encoding for {path}")

    return base64.b64decode(data["content"]).decode(
        "utf-8",
        errors="replace"
    )