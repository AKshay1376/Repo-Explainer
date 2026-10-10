"""Start a disposable production-mode Waitress process and verify durability."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def main():
    with tempfile.TemporaryDirectory() as scratch:
        port = free_port()
        address = f"http://127.0.0.1:{port}"
        env = {**os.environ, "APP_ENV": "production", "APP_HOST": "127.0.0.1",
               "PORT": str(port), "DATA_DIR": scratch,
               "FRONTEND_ORIGINS": "https://app.example.test", "AUTH_MODE": "required",
               "APP_SECRET_KEY": "smoke-test-key-" * 4,
               "APP_ADMIN_PASSWORD": "smoke-test-password", "WEB_WORKERS": "1",
               "ALLOW_LOCAL_FS_OPERATIONS": "0", "ALLOW_PATCH_APPLY": "0",
               "ALLOW_VALIDATOR_EXECUTION": "0"}
        started = []

        def start():
            process = subprocess.Popen([sys.executable, "web_app.py"], cwd=ROOT, env=env,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            started.append(process)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError("Production server exited before readiness.")
                try:
                    with urlopen(address + "/api/ready", timeout=2) as response:
                        if response.status == 200:
                            return process
                except (URLError, TimeoutError, OSError):
                    time.sleep(0.2)
            raise RuntimeError("Production readiness timed out.")

        def stop(process):
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

        def call(path, method="GET", body=None, cookie=None, csrf=None):
            headers = {"Origin": "https://app.example.test"}
            if body is not None:
                headers["Content-Type"] = "application/json"
            if cookie:
                headers["Cookie"] = cookie
            if csrf:
                headers["X-CSRF-Token"] = csrf
            request = Request(address + path, method=method,
                              data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                with urlopen(request, timeout=5) as response:
                    return response.status, response.headers, response.read()
            except HTTPError as error:
                return error.code, error.headers, error.read()

        try:
            begin = time.perf_counter()
            process = start()
            startup_ms = round((time.perf_counter() - begin) * 1000)
            tick = time.perf_counter()
            assert call("/api/health")[0] == 200
            health_ms = round((time.perf_counter() - tick) * 1000, 2)
            tick = time.perf_counter()
            assert call("/api/ready")[0] == 200
            ready_ms = round((time.perf_counter() - tick) * 1000, 2)
            assert call("/api/version")[0] == 200
            capabilities = json.loads(call("/api/capabilities")[2])["capabilities"]
            assert not capabilities["local_filesystem"]
            assert call("/a/deep/spa/route")[0] == 200
            status, headers, html = call("/")
            assert status == 200 and b'theme-init.js' in html
            assert "script-src 'self'" in headers["Content-Security-Policy"]
            assert call("/theme-init.js")[0] == 200
            assert call("/api/not-found")[0] in {401, 404}
            assert call("/api/projects", "POST", {"repo_url": "owner/repo"})[0] == 401
            status, headers, data = call("/api/auth/login", "POST", {"password": env["APP_ADMIN_PASSWORD"]})
            assert status == 200
            cookie = headers["Set-Cookie"].split(";", 1)[0]
            csrf = json.loads(data)["csrf_token"]
            assert call("/api/not-found", cookie=cookie)[0] == 404
            assert call("/api/projects", "POST", {"repo_url": "owner/repo"}, cookie)[0] == 403
            tick = time.perf_counter()
            status, _, data = call("/api/projects", "POST", {"repo_url": "owner/repo"}, cookie, csrf)
            project_write_ms = round((time.perf_counter() - tick) * 1000, 2)
            assert status == 201
            project_id = json.loads(data)["project"]["id"]
            assert call("/api/patch/apply", "POST", {}, cookie, csrf)[0] == 403
            backup = subprocess.check_output([sys.executable, "-m", "persistence.backup"],
                                             cwd=ROOT, env=env, text=True, timeout=20).strip()
            assert Path(backup).is_file()
            stop(process)
            process = start()
            tick = time.perf_counter()
            status, _, data = call(f"/api/projects/{project_id}", cookie=cookie)
            project_read_ms = round((time.perf_counter() - tick) * 1000, 2)
            assert status == 200 and json.loads(data)["project"]["id"] == project_id
            print(json.dumps({"startup_ms": startup_ms, "health_ms": health_ms,
                              "ready_ms": ready_ms, "project_write_ms": project_write_ms,
                              "project_read_ms": project_read_ms, "health": 200, "ready": 200,
                              "version": 200, "capabilities": 200, "spa": 200,
                              "auth_csrf": "passed", "restart_persistence": "passed",
                              "sqlite_backup": "passed"}))
        finally:
            for process in started:
                if process.poll() is None:
                    stop(process)


if __name__ == "__main__":
    main()
