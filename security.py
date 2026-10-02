import re


SENSITIVE_FILENAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
    "credentials.json",
    ".secrets.baseline",
}


SENSITIVE_EXTENSIONS = {
    ".pem",
    ".key",
    ".p12",
    ".pfx",
    ".pkcs12",
    ".keystore",
    ".jks",
}


BINARY_EXTENSIONS = {
    # Images & icons
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
    # Audio & video
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".flv", ".webm", ".m4a",
    # Fonts
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    # Compiled binaries & libraries
    ".exe", ".dll", ".so", ".dylib", ".bin", ".o", ".a", ".pyc", ".pyo", ".pyd", ".class",
    # Archives & compressed packages
    ".zip", ".tar", ".gz", ".tgz", ".bz2", ".7z", ".rar", ".whl", ".jar", ".war", ".ear",
    # Machine learning models & weights
    ".keras", ".h5", ".hdf5", ".onnx", ".pt", ".pth", ".pkl", ".pickle", ".joblib",
    # Databases & serialized data
    ".db", ".sqlite", ".sqlite3", ".parquet", ".arrow", ".feather",
    # Documents / PDFs
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
}


SECRET_PATTERNS = [
    r"(?i)(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{4,}['\"]",
    r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{20,}",
    r"gh[pousr]_[a-zA-Z0-9]{36,}",
    r"sk-[a-zA-Z0-9]{20,}",
    r"sk-proj-[a-zA-Z0-9_\-]{30,}",
    r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----",
    r"-----BEGIN [A-Z ]+ PRIVATE KEY-----",
]


def is_binary_file(filename: str) -> bool:
    """Determine if a file path is a non-text binary, model weight, archive, or media asset."""
    name_lower = filename.lower().replace("\\", "/")
    parts = name_lower.split("/")
    fname = parts[-1]

    for ext in BINARY_EXTENSIONS:
        if fname.endswith(ext):
            return True
    return False


def is_sensitive_file(filename: str) -> bool:
    """Determine if a file path or filename represents a sensitive secret file."""
    parts = filename.lower().replace("\\", "/")
    name = parts.rsplit("/", 1)[-1]

    # Explicit sensitive file checks
    if name in SENSITIVE_FILENAMES:
        return True

    # Catch any .env variant (.env.staging, .env.backup, etc.) except harmless .env.example / .env.template
    if name.startswith(".env") and not (name.endswith(".example") or name.endswith(".template") or name.endswith(".sample")):
        return True

    for extension in SENSITIVE_EXTENSIONS:
        if name.endswith(extension):
            return True

    # Also catch private key or credential filenames
    if any(k in name for k in ("id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "service-account", "oauth-credentials")):
        return True

    return False


def sanitize_content(filename: str, content: str):
    """
    Prevent obvious secrets and credential patterns from entering prompts or reports.
    Returns None if the file itself is inherently sensitive or binary and should be omitted.
    """
    if is_sensitive_file(filename) or is_binary_file(filename):
        return None

    sanitized = content

    for pattern in SECRET_PATTERNS:
        sanitized = re.sub(
            pattern,
            "[REDACTED SECRET]",
            sanitized
        )

    return sanitized


def limit_content_size(content: str, max_chars: int = 6000) -> str:
    """
    Prevent excessively large files from overloading prompt context and analyzers.
    """
    if len(content) <= max_chars:
        return content

    return content[:max_chars] + "\n\n[CONTENT TRUNCATED]"


def validate_github_url(url: str):
    """
    Validate a GitHub repository URL and extract (owner, repo).
    Accepts https://github.com/owner/repo, github.com/owner/repo, or owner/repo.
    Rejects malformed URLs, non-github domains, and invalid characters.
    """
    if not url or not isinstance(url, str):
        raise ValueError("Please enter a valid GitHub repository URL.")

    url = url.strip()

    # If user provided "owner/repo" shorthand (e.g. psf/requests)
    short_pattern = r"^([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(?:\.git)?(?:\/.*)?$"
    short_match = re.match(short_pattern, url)
    if short_match and not url.startswith(("http://", "https://", "www.", "github.com/")):
        owner, repo = short_match.group(1), short_match.group(2)
        if owner.lower() not in {"settings", "organizations", "login", "explore", "pricing"}:
            return owner, repo

    # Match standard GitHub repository URL formats:
    pattern = r"^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+?)(?:\.git)?(?:\/.*)?$"
    match = re.match(pattern, url, re.IGNORECASE)

    if not match:
        raise ValueError("Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repository or owner/repo).")

    owner, repo = match.group(1), match.group(2)

    if not owner or not repo or owner.lower() in {"settings", "organizations", "login", "explore", "pricing"}:
        raise ValueError("Please enter a valid GitHub repository URL.")

    return owner, repo