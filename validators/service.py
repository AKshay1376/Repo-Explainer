"""Repository-specific profile trust, command selection, and bounded history."""

import hashlib
import json
import os
import subprocess
import threading
import time
from pathlib import Path

from .detector import detect
from .models import ValidatorProfile, timestamp
from .runner import run
from .security import safe_command, safe_directory
from security import is_sensitive_file

_RUN_LOCK = threading.Lock()
_RUN_TIMES: dict[str, list[float]] = {}


class ValidatorService:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir(): raise ValueError("Validator root must be a directory.")
        base = self.root / ".repo-explainer"
        self.store = base / "validators"
        if base.is_symlink() or self.store.is_symlink() or (self.store.exists() and not self.store.is_dir()):
            raise ValueError("Validator storage is unsafe.")
        self._lock = threading.RLock()

    def _repo_id(self) -> str:
        try:
            value = subprocess.run(["git", "-C", str(self.root), "remote", "get-url", "origin"],
                                   capture_output=True, text=True, timeout=2, check=False)
            if value.returncode == 0:
                return "git:" + hashlib.sha256(value.stdout.strip().lower().encode()).hexdigest()[:20]
        except (OSError, subprocess.TimeoutExpired): pass
        return "local:" + hashlib.sha256(str(self.root).encode()).hexdigest()[:20]

    def _fingerprint(self, commands: list) -> str:
        payload = [[item.id, item.command, item.working_directory, item.source] for item in commands]
        manifests = []
        for directory in (self.root, self.root / "frontend"):
            for name in ("package.json", "pyproject.toml", "requirements.txt", "setup.cfg", "tox.ini", "pytest.ini", "tsconfig.json"):
                path = directory / name
                if path.is_file() and not path.is_symlink() and path.stat().st_size <= 200_000:
                    manifests.append([str(path.relative_to(self.root)), hashlib.sha256(path.read_bytes()).hexdigest()])
        return hashlib.sha256(json.dumps([str(self.root), self._repo_id(), payload, manifests], sort_keys=True).encode()).hexdigest()

    def _file(self, name: str) -> Path:
        if (self.root / ".repo-explainer").is_symlink() or self.store.is_symlink():
            raise ValueError("Validator storage is unsafe.")
        path = self.store / name
        if path.is_symlink(): raise ValueError("Validator storage file is unsafe.")
        return path

    def _read(self, name: str, default):
        path = self._file(name)
        if not path.exists(): return default
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, type(default)):
            raise ValueError("Validator local storage has an invalid format.")
        return data

    def _write(self, name: str, data) -> None:
        self.store.mkdir(parents=True, exist_ok=True)
        path = self._file(name)
        temp = self._file(name + ".tmp")
        temp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        os.replace(temp, path)

    def _profile(self) -> ValidatorProfile:
        stack, commands, warnings = detect(self.root)
        for item in commands:
            safe_command(item.command)
            safe_directory(self.root, item.working_directory)
        fingerprint = self._fingerprint(commands)
        state = self._read("trust.json", {})
        scope = state.get("scope", "untrusted") if state.get("profile_id") == fingerprint and state.get("root") == str(self.root) and state.get("repo_id") == self._repo_id() else "untrusted"
        approved = set(state.get("command_ids", [])) if scope != "untrusted" else set()
        for command in commands: command.trusted = command.id in approved
        return ValidatorProfile(fingerprint, self._repo_id(), stack, commands, bool(approved), scope,
                                warnings=warnings)

    def profile(self) -> dict:
        with self._lock: return {"success": True, "profile": self._profile().public()}

    detect = profile

    def trust(self, scope: str, command_ids: list[str], *, confirm: bool = False) -> dict:
        if confirm is not True or scope not in {"trusted_once", "trusted_repo"}:
            raise ValueError("Explicit validator trust confirmation is required.")
        with self._lock:
            profile = self._profile()
            known = {item.id for item in profile.commands}
            if not isinstance(command_ids, list) or not command_ids or any(not isinstance(item, str) for item in command_ids) or len(set(command_ids)) != len(command_ids) or not set(command_ids) <= known:
                raise ValueError("Select discovered validator commands to trust.")
            self._write("trust.json", {"profile_id": profile.id, "repo_id": profile.repo_id,
                                       "root": str(self.root), "scope": scope,
                                       "command_ids": command_ids, "updated_at": timestamp()})
            return self.profile()

    def run(self, command_ids: list[str], *, revision: str = "", patch_id: str = "",
            paths: list[str] | None = None, affected_tests: list | None = None) -> dict:
        with self._lock:
            if not isinstance(revision, str) or not isinstance(patch_id, str):
                raise ValueError("Validator revision and patch ID must be text.")
            if paths is None: paths = []
            if not isinstance(paths, list) or len(paths) > 20 or any(
                not isinstance(path, str) or len(path) > 300 or path.startswith("/") or ".." in path.split("/")
                for path in paths):
                raise ValueError("Invalid validator target paths.")
            profile = self._profile()
            available = {item.id: item for item in profile.commands}
            if not isinstance(command_ids, list) or not command_ids or any(not isinstance(item, str) for item in command_ids) or len(set(command_ids)) != len(command_ids) or not set(command_ids) <= available.keys():
                raise ValueError("Select discovered validators.")
            if any(not available[item].trusted for item in command_ids):
                raise ValueError("Selected validator commands are untrusted. Review and trust them first.")
            with _RUN_LOCK:
                now = time.monotonic()
                for stale in [root for root, moments in _RUN_TIMES.items() if all(now - moment >= 60 for moment in moments)]:
                    _RUN_TIMES.pop(stale, None)
                key = str(self.root)
                recent = [value for value in _RUN_TIMES.get(key, []) if now - value < 60]
                if len(recent) >= 5:
                    raise ValueError("Validator execution limit reached (5 runs per minute).")
                _RUN_TIMES[key] = [*recent, now]
            if profile.trust_scope == "trusted_once":
                # Consume before launching any process, including failed or timed-out runs.
                self._write("trust.json", {"scope": "untrusted", "profile_id": profile.id,
                                           "root": str(self.root), "repo_id": profile.repo_id,
                                           "command_ids": [], "updated_at": timestamp()})
            results = []
            targeted = self.recommended(paths, affected_tests).get("targeted_tests", [])
            for command_id in command_ids[:5]:
                try:
                    selected = available[command_id]
                    if targeted and selected.kind in {"test", "unit"} and selected.command[:3] in (
                            ["python", "-m", "unittest"], ["python", "-m", "pytest"]):
                        from dataclasses import replace
                        if selected.command[2] == "unittest":
                            modules = [path[:-3].replace("/", ".") for path in targeted if path.startswith("test_")]
                            if modules: selected = replace(selected, command=[*selected.command, *modules])
                        else:
                            selected = replace(selected, command=[*selected.command, *targeted])
                    result = run(self.root, selected, revision=revision, patch_id=patch_id)
                    result["paths"] = paths
                    results.append(result)
                except (OSError, subprocess.SubprocessError) as error:
                    results.append({"command_id": command_id, "state": "FAILED", "exit_code": None,
                                    "output_summary": f"Validator could not start: {type(error).__name__}",
                                    "duration_seconds": 0, "timestamp": timestamp(), "revision": revision[:64],
                                    "patch_id": patch_id[:64]})
                if results[-1]["state"] != "PASSED": break
            history = self._read("history.json", [])
            self._write("history.json", (results + history)[:100])
            return {"success": True, "results": results, "profile": self._profile().public()}

    def history(self) -> dict:
        with self._lock: return {"success": True, "history": self._read("history.json", [])}

    def recommended(self, paths: list[str], affected_tests: list | None = None) -> dict:
        profile = self._profile()
        paths = [path for path in paths if isinstance(path, str)]
        commands = profile.commands
        kinds = ["typecheck", "unit", "test", "build"] if any(path.endswith((".ts", ".tsx", ".js", ".jsx")) for path in paths) else ["unit", "test", "lint"]
        suggested = [item.id for kind in kinds for item in commands if item.kind == kind]
        candidate_tests = []
        for item in affected_tests or []:
            candidate_tests.append(item.get("file") if isinstance(item, dict) else item)
        for path in paths:
            if path.endswith(".py"):
                candidate_tests.append("test_" + Path(path).stem + ".py")
        targeted = []
        for path in candidate_tests[:30]:
            if not isinstance(path, str) or "\\" in path or ":" in path or any(
                part in {"", ".", "..", ".repo-explainer", ".git", "node_modules"} for part in path.split("/"
            )) or is_sensitive_file(path) or not Path(path).name.startswith("test_") or not path.endswith(".py"):
                continue
            candidate = self.root / path
            if not candidate.is_file() or candidate.is_symlink() or not candidate.resolve().is_relative_to(self.root):
                continue
            if path not in targeted: targeted.append(path)
        stages = [{"name": name, "state": "NOT_RUN" if any(item.kind == kind for item in commands) else "NOT_TRUSTED",
                   "command_ids": [item.id for item in commands if item.kind == kind]}
                  for name, kind in (("Syntax", "syntax"), ("Typecheck", "typecheck"),
                                     ("Targeted Tests", "unit"), ("Full Tests", "test"), ("Build", "build"))]
        for stage in stages:
            if stage["command_ids"] and not all(next(item for item in commands if item.id == cid).trusted for cid in stage["command_ids"]):
                stage["state"] = "NOT_TRUSTED"
        return {"recommended_command_ids": list(dict.fromkeys(suggested)),
                "affected_tests": affected_tests or [], "targeted_tests": targeted[:10],
                "graph": [{"name": "Patch", "state": "PASSED"}] + stages}
