"""Bounded subprocess execution after service-level trust verification."""

import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

from .models import ValidatorCommand, timestamp
from .security import redact_output, safe_command, safe_directory, sanitized_environment


def run(root: Path, command: ValidatorCommand, *, revision: str = "", patch_id: str = "") -> dict:
    safe_command(command.command)
    cwd = safe_directory(root, command.working_directory)
    timeout = max(1, min(int(command.timeout_seconds), 180))
    cap = max(1, min(int(command.max_output_kb), 16)) * 1024
    started = time.monotonic()
    chunks: list[bytes] = []
    retained = 0
    truncated = False
    kwargs = {"cwd": cwd, "env": sanitized_environment(), "stdin": subprocess.DEVNULL,
              "stdout": subprocess.PIPE, "stderr": subprocess.STDOUT, "shell": False}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    executable = sys.executable if command.command[0] == "python" else shutil.which(command.command[0], path=kwargs["env"].get("PATH"))
    if not executable or Path(executable).resolve().is_relative_to(root.resolve()):
        raise ValueError("Validator executable is unavailable or resolves inside the repository.")
    argv = [executable, *command.command[1:]]
    process = subprocess.Popen(argv, **kwargs)

    def drain():
        nonlocal retained, truncated
        while True:
            data = process.stdout.read(4096)
            if not data: break
            available = cap - retained
            if retained < cap:
                chunk = data[:available]
                chunks.append(chunk)
                retained += len(chunk)
            if len(data) > available: truncated = True

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    timed_out = False
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, check=False)
        else:
            import signal
            os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
    reader.join(timeout=2)
    process.stdout.close()
    output = b"".join(chunks).decode("utf-8", errors="replace")
    if truncated: output += "\n[output truncated]"
    return {"command_id": command.id, "command": command.command,
            "timestamp": timestamp(), "duration_seconds": round(time.monotonic() - started, 2),
            "exit_code": None if timed_out else process.returncode,
            "state": "TIMEOUT" if timed_out else "PASSED" if process.returncode == 0 else "FAILED",
            "output_summary": redact_output(output, cap), "revision": revision[:64], "patch_id": patch_id[:64]}
