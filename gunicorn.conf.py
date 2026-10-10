"""Single-host threaded Gunicorn profile for Render and Linux Docker."""

from config import load_settings

settings = load_settings()
bind = f"{settings.host}:{settings.port}"
workers = 1  # SQLite disk and in-process job queue are intentionally single-host.
worker_class = "gthread"
threads = max(4, settings.worker_threads)
timeout = max(120, settings.job_timeout)
graceful_timeout = 30
keepalive = 5
accesslog = "-"
errorlog = "-"
capture_output = True
loglevel = "info"
