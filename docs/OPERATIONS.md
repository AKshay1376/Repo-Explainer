# Operations

## Startup and shutdown

Local: `python web_app.py` binds loopback by default. Production: `gunicorn -c gunicorn.conf.py web_app:app` on Linux or `waitress-serve --host=127.0.0.1 --port=5000 web_app:app` for a trusted Windows installation. Production startup validates configuration and SQLite writability. Gunicorn accepts SIGTERM and gives active requests a 30-second graceful window. Analysis workers are daemon threads; queued work is not resumed after process termination.

## Routine checks

Use `/api/health` for liveness and `/api/ready` for deployment readiness. Read JSON request logs from stdout/stderr in production. Each API response includes `X-Request-ID`; logs include the same ID, route pattern, status, and duration. Logs exclude request bodies, source code, authorization headers, and patch content.

## Backup, recovery, and rollback

Run `python -m persistence.backup` and copy the resulting file off-host. The backup uses SQLite's online API. Keep a backup before updating the service. If an update fails, roll back the image or Git revision, but ensure the older code supports the current schema version. The migration mechanism never drops user tables; it rejects a database from a newer app version. To restore an older database, stop the service and follow the procedure in [DEPLOYMENT.md](DEPLOYMENT.md).

## Jobs

`POST /api/jobs` with `{"type":"repository_analysis","repo_url":"owner/repo"}` queues a bounded analysis. Poll `GET /api/jobs/<id>`; use `POST /api/jobs/<id>/cancel` while queued. A running job is not cancellable. Job records contain status and a project reference, never full analysis blobs. Re-submit stale queued/running jobs after a process restart.

## Updating

Run CI, take a backup, deploy the new image, then verify health, readiness, version, capabilities, login, and a representative analysis. Monitor error rates and request duration. Keep one instance when using the attached SQLite disk. Review failed jobs and storage usage. The frontend is bundled in the same image, so API and UI revisions deploy together.

## Troubleshooting

If a request returns a generic error, use its request ID to locate the structured log entry. For rate-limit errors, check whether the storage URI is shared and whether there is more than one worker. For GitHub failures, check outbound access and token limits; deterministic cached features remain available without AI. For SQLite busy errors, check disk health and long write transactions. For CORS failures, confirm the browser Origin exactly matches `FRONTEND_ORIGINS`.

## GitHub branch protection

Require the CI workflow on pull requests, require branches to be current before merge, and block force pushes to `main`. Configure these in GitHub repository settings; this project does not change repository administration automatically.
