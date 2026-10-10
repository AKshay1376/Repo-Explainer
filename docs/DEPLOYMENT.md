# Deployment

Repo Explainer has two explicit modes. Local mode (default) binds 127.0.0.1, uses local SQLite, and does not require sign-in. Production mode validates its configuration at startup, binds a configurable host, requires session authentication, and expects a persistent data directory.

## Local

```powershell
python -m pip install -r requirements.txt
cd frontend
npm ci
npm run build
cd ..
python web_app.py
```

Visit http://127.0.0.1:5000/. Local development can also run Vite on port 5173 with its existing API proxy. Set `APP_ENV=local`; the Flask development server is used only in this mode. A local production-style Windows process can use `waitress-serve --host=127.0.0.1 --port=5000 web_app:app`.

## Docker and Render

The [Dockerfile](../Dockerfile) builds the frontend, installs pinned Python dependencies, runs as a non-root user, and starts one threaded Gunicorn worker. Flask serves the built SPA and API from one origin. Unknown `/api/*` routes return JSON 404; other browser routes fall back to `index.html`.

Set `APP_ENV=production`, `APP_HOST=0.0.0.0`, exact HTTPS `FRONTEND_ORIGINS`, `AUTH_MODE=required`, a random 32+ character `APP_SECRET_KEY`, a strong 16+ character `APP_ADMIN_PASSWORD`, and an absolute `DATA_DIR` on durable storage. Do not bake either credential into the image. The `render.yaml` blueprint attaches a persistent disk at `/data`; fill its three `sync: false` values in Render before deployment. Match `FRONTEND_ORIGINS` to the actual public HTTPS origin. The Docker image needs a writable mounted `/data` for UID 10001.

Render's [disk documentation](https://render.com/docs/disks) says only files under the mount persist and a disk is available to one service instance. This deployment intentionally uses one Gunicorn worker and one Render instance. SQLite and the in-process job queue are not a multi-host architecture. A Render disk also prevents zero-downtime instance swaps.

For another Docker host, mount a durable volume at `/data`, set the same production environment values, expose the configured `PORT`, and use a trusted TLS terminating proxy. Set `TRUSTED_PROXY_COUNT=1` only when exactly one trusted proxy controls forwarded headers.

## Configuration and security

See [`.env.example`](../.env.example) for every setting. Production rejects debug mode, wildcard or non-HTTPS frontend origins, missing durable data path, weak/missing auth credentials, and multiple web workers with in-memory rate-limit storage. Production defaults to `ALLOW_LOCAL_FS_OPERATIONS=0`, `ALLOW_PATCH_APPLY=0`, and `ALLOW_VALIDATOR_EXECUTION=0`. Enable these only in a separately trusted deployment. Public write operations require a signed, HttpOnly, Secure, SameSite=Lax session and a CSRF header. Local mode needs no account.

The initial job backend is an in-process bounded queue. It persists compact job status in SQLite. Only queued jobs can be cancelled; a running analysis cannot be interrupted safely. If the process restarts during a job, its prior status is historical, not a resumable task. Production uses one process so memory rate limits and the queue have a clear scope. To scale to multiple processes or hosts, add a shared rate-limit backend and external job queue first.

The built frontend is served by Flask. A strict CSP uses external scripts; inline styles remain allowed because existing React components use dynamic styles. The application does not need OpenAI for deterministic analysis.

## Health and backups

`GET /api/health` checks process liveness without GitHub/OpenAI calls in production. `GET /api/ready` checks SQLite access, writable data storage, workers, and the frontend build. `GET /api/version` gives safe build metadata. `GET /api/capabilities` describes enabled features.

Run `python -m persistence.backup` in the service environment for an online SQLite backup. It writes timestamped files under `${DATA_DIR}/backups` and retains seven by default. Copy backups off-host regularly; a single attached disk is not an off-site backup.

To restore: stop the service, copy the selected backup to a new path on the mounted disk, verify it with `PRAGMA integrity_check`, set `REPO_EXPLAINER_DB_PATH` to that path, and start the service. Keep the old database until the restored service is verified. Do not copy only the live `.db` file while WAL is active.

## Common failures

- `/api/ready` returns 503: check the data mount, write permissions, built `frontend/dist`, and worker startup.
- Startup rejects origins/auth: supply exact HTTPS origins and strong credentials.
- Login succeeds but writes return 403: refresh the session and send the returned CSRF token in `X-CSRF-Token`.
- Saved projects disappear after deploy: verify `DATA_DIR` points under the mounted persistent disk.
- Jobs stay queued after restart: resubmit them; the in-process queue is intentionally not durable execution.
