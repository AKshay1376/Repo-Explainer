"""Validated deployment configuration. Load once after .env is populated."""

from dataclasses import dataclass
from pathlib import Path
import os
from urllib.parse import urlparse
from limits import parse as parse_limit

RATE_DEFAULTS = {
    "analyze": "10 per minute", "download": "30 per minute", "ask": "20 per minute",
    "trace": "30 per minute", "impact": "30 per minute", "source": "60 per minute",
    "humanize": "30 per minute", "humanize_ai": "5 per minute",
    "refactor": "20 per minute", "refactor_ai": "5 per minute",
    "validator_run": "5 per minute",
}


def _bool(value, default=False):
    if value is None:
        return default
    if value.lower() not in {"0", "1", "false", "true", "no", "yes"}:
        raise ValueError("Invalid boolean configuration value.")
    return value.lower() in {"1", "true", "yes"}


def _int(value, default, minimum=1, maximum=1_000_000):
    result = int(value) if value is not None else default
    if not minimum <= result <= maximum:
        raise ValueError("Numeric configuration is outside the supported range.")
    return result


@dataclass(frozen=True)
class Settings:
    environment: str
    host: str
    port: int
    debug: bool
    frontend_origins: tuple[str, ...]
    data_dir: Path
    temp_dir: Path
    database_path: Path
    request_limit: int
    import_limit: int
    cache_enabled: bool
    cache_ttl: int
    cache_maxsize: int
    rate_limit_enabled: bool
    rate_limit_storage: str
    rate_limits: dict[str, str]
    auth_mode: str
    secret_key: str
    admin_password: str
    session_hours: int
    local_fs_operations: bool
    patch_apply: bool
    validator_execution: bool
    worker_threads: int
    job_timeout: int
    job_limit: int
    trusted_proxy_count: int
    app_version: str
    commit_sha: str
    build_timestamp: str

    @property
    def production(self):
        return self.environment == "production"

    def capabilities(self):
        return {
            "local_filesystem": self.local_fs_operations,
            "patch_apply": self.patch_apply,
            "validator_execution": self.validator_execution,
            "git_history": self.local_fs_operations,
            "persistent_projects": True,
            "ai_available": bool(os.environ.get("OPENAI_API_KEY")),
            "auth_enabled": self.auth_mode != "disabled",
            "background_jobs": True,
        }


def load_settings(env=None):
    values = os.environ if env is None else env
    get = values.get
    environment = get("APP_ENV", "local").lower()
    if environment not in {"local", "production"}:
        raise ValueError("APP_ENV must be local or production.")
    production = environment == "production"
    debug = _bool(get("APP_DEBUG", get("FLASK_DEBUG")), False)
    if production and debug:
        raise ValueError("Production cannot enable debug mode.")
    host = get("APP_HOST", "0.0.0.0" if production else "127.0.0.1")
    port = _int(get("PORT"), 5000, 1, 65535)
    default_origins = "" if production else (
        f"http://127.0.0.1:{port},http://localhost:{port},"
        "http://127.0.0.1:5173,http://localhost:5173")
    origins = tuple(x.strip().rstrip("/") for x in (get("FRONTEND_ORIGINS") or default_origins).split(",") if x.strip())
    if production and not origins:
        raise ValueError("Production requires FRONTEND_ORIGINS.")
    for origin in origins:
        parsed = urlparse(origin)
        if origin == "*" or parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.path or parsed.query or parsed.fragment:
            raise ValueError("FRONTEND_ORIGINS must contain explicit origins.")
        if production and parsed.scheme != "https":
            raise ValueError("Production frontend origins must use HTTPS.")
    data_dir = Path(get("DATA_DIR") or Path(__file__).resolve().parent.parent / ".repo-explainer" / "data")
    if production and (not get("DATA_DIR") or not data_dir.is_absolute()):
        raise ValueError("Production requires an absolute DATA_DIR on persistent storage.")
    db_path = Path(get("REPO_EXPLAINER_DB_PATH") or data_dir / "repo-explainer.db")
    if production and not db_path.is_absolute():
        raise ValueError("Production database path must be absolute.")
    if production and not db_path.resolve().is_relative_to(data_dir.resolve()):
        raise ValueError("Production database must live under DATA_DIR.")
    temp_dir = Path(get("TEMP_DIR") or data_dir / "temp")
    if production and (not temp_dir.is_absolute() or not temp_dir.resolve().is_relative_to(data_dir.resolve())):
        raise ValueError("Production TEMP_DIR must live under DATA_DIR.")
    auth_mode = get("AUTH_MODE", "required" if production else "disabled").lower()
    if auth_mode not in {"disabled", "optional", "required"}:
        raise ValueError("AUTH_MODE must be disabled, optional, or required.")
    if production and auth_mode == "disabled":
        raise ValueError("Public deployment requires AUTH_MODE optional or required.")
    secret = get("APP_SECRET_KEY", "")
    password = get("APP_ADMIN_PASSWORD", "")
    if auth_mode != "disabled" and (len(secret) < 32 or len(password) < 16):
        raise ValueError("Authentication requires APP_SECRET_KEY (32+ chars) and APP_ADMIN_PASSWORD (16+ chars).")
    local_fs = _bool(get("ALLOW_LOCAL_FS_OPERATIONS"), not production)
    patch_apply = _bool(get("ALLOW_PATCH_APPLY"), not production) and local_fs
    validator = _bool(get("ALLOW_VALIDATOR_EXECUTION"), not production) and local_fs
    storage = get("RATELIMIT_STORAGE_URI", "memory://")
    rate_limits = {name: get(f"RATELIMIT_{name.upper()}", default)
                   for name, default in RATE_DEFAULTS.items()}
    for value in rate_limits.values():
        try:
            parse_limit(value)
        except ValueError as error:
            raise ValueError("Invalid rate limit configuration.") from error
    workers = _int(get("JOB_WORKERS"), 2, 1, 8)
    if production and storage == "memory://" and _int(get("WEB_WORKERS"), 1, 1, 8) > 1:
        raise ValueError("Multiple web workers require shared RATELIMIT_STORAGE_URI.")
    return Settings(
        environment, host, port, debug, origins, data_dir, temp_dir, db_path,
        _int(get("MAX_REQUEST_BYTES"), 1_000_000, 1024, 50_000_000),
        _int(get("MAX_IMPORT_BYTES"), 10_000_000, 1024, 50_000_000),
        _bool(get("CACHE_ENABLED"), True),
        _int(get("CACHE_TTL"), 3600, 1, 86400),
        _int(get("CACHE_MAXSIZE"), 100, 1, 10000),
        _bool(get("RATELIMIT_ENABLED"), True),
        storage, rate_limits, auth_mode, secret, password,
        _int(get("SESSION_HOURS"), 12, 1, 168),
        local_fs, patch_apply, validator, workers,
        _int(get("JOB_TIMEOUT_SECONDS"), 180, 5, 3600),
        _int(get("JOB_QUEUE_LIMIT"), 20, 1, 1000),
        _int(get("TRUSTED_PROXY_COUNT"), 0, 0, 3),
        get("APP_VERSION", "1.0.0"), get("BUILD_COMMIT_SHA") or get("RENDER_GIT_COMMIT", ""),
        get("BUILD_TIMESTAMP", ""),
    )
