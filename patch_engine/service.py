"""Stateful patch orchestration for one explicitly configured local checkout."""

import json
import os
import re
import subprocess
import threading
import sys
import time
import shutil
import uuid
from pathlib import Path
from typing import Any

from .applier import ApplyFailure, apply_files
from .diff_utils import digest, unified
from .generator import build_file, humanize_file, planner_file, selected_range
from .models import PatchSet
from .rollback import restore, safe_store
from .validator import safe_target, syntax_check, validate_selection

MAX_FILES = 20
MAX_CHANGED_LINES = 1500


def _git(root: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(["git", "-C", str(root), *args], capture_output=True,
                                text=True, timeout=3, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


class PatchService:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise ValueError("Patch root must be a directory.")
        git_root = _git(self.root, "rev-parse", "--show-toplevel")
        if git_root is not None:
            if Path(git_root).resolve() != self.root:
                raise ValueError("PATCH_LOCAL_ROOT must be the Git checkout root.")
            if _git(self.root, "check-ignore", "-q", ".repo-explainer/") is None:
                raise ValueError("The checkout must ignore .repo-explainer/ before patch history can be stored.")
        self._lock = threading.RLock()
        self._patches: dict[str, PatchSet] = {}
        self._cache: dict[str, str] = {}
        self._history_path = safe_store(self.root) / "patch-history.json"

    def git_info(self) -> dict[str, Any]:
        if _git(self.root, "rev-parse", "--is-inside-work-tree") != "true":
            return {"available": False}
        branch = _git(self.root, "symbolic-ref", "--short", "HEAD") or _git(self.root, "rev-parse", "--abbrev-ref", "HEAD") or "detached"
        status = _git(self.root, "status", "--porcelain")
        raw_origin = _git(self.root, "remote", "get-url", "origin") or ""
        match = re.search(r"github\.com[:/]([^/]+)/([^/?#]+)", raw_origin, re.IGNORECASE)
        origin = f"github.com/{match.group(1)}/{match.group(2).removesuffix('.git')}" if match else "non-GitHub origin"
        return {"available": True, "branch": branch, "dirty": bool(status),
                "head": _git(self.root, "rev-parse", "HEAD"),
                "origin": origin,
                "diff_stat": (_git(self.root, "diff", "--stat") or "")[:2000],
                "commit_status": "uncommitted" if status else "clean"}

    def _trusted_checks(self) -> list[dict]:
        """Fixed commands for this project only; caller must opt in after root verification."""
        try:
            scripts = json.loads((self.root / "frontend" / "package.json").read_text(encoding="utf-8"))["scripts"]
        except (OSError, ValueError, KeyError, TypeError):
            scripts = {}
        expected = {
            "test": "tsx --test src/tests/inspector.test.js src/tests/graph.test.ts src/tests/ask_repo.test.ts src/tests/trace.test.ts src/tests/impact.test.ts src/tests/source.test.ts src/tests/humanize.test.ts src/tests/refactor.test.ts src/tests/patch.test.ts",
            "build": "tsc && vite build",
        }
        if any(scripts.get(name) != command for name, command in expected.items()):
            return [{"state": "NOT_RUN", "command": "Repo Explainer trusted script check",
                     "exit_code": None, "duration_seconds": 0,
                     "output_summary": "Package scripts changed; explicit manual validation is required."}]
        commands = [
            ([sys.executable, "-B", "-m", "unittest", "-q", "test_architecture_engine", "test_ask_repo",
              "test_change_impact", "test_execution_trace", "test_performance_and_cache",
              "test_repository_intelligence", "test_source_service", "test_humanize",
              "test_refactor_planner", "test_patch_engine"], self.root),
            ([shutil.which("npm") or "npm", "test"], self.root / "frontend"),
            ([shutil.which("npx") or "npx", "tsc", "--noEmit"], self.root / "frontend"),
            ([shutil.which("npm") or "npm", "run", "build"], self.root / "frontend"),
        ]
        results = []
        for command, cwd in commands:
            started = time.monotonic()
            try:
                completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True,
                                           timeout=180, check=False)
                output = (completed.stdout + "\n" + completed.stderr)[-2000:]
                state = "PASSED" if completed.returncode == 0 else "FAILED"
                exit_code = completed.returncode
            except (OSError, subprocess.TimeoutExpired) as error:
                output, state, exit_code = str(error), "FAILED", None
            results.append({"state": state, "command": " ".join(command), "exit_code": exit_code,
                            "duration_seconds": round(time.monotonic() - started, 2),
                            "output_summary": output})
            if state == "FAILED":
                break
        return results

    def _history(self) -> list[dict]:
        safe_store(self.root)
        if self._history_path.is_symlink():
            raise ValueError("Patch history storage is unsafe.")
        if not self._history_path.exists():
            return []
        try:
            payload = json.loads(self._history_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise ValueError("Patch history could not be read; snapshots were not changed.") from error
        if not isinstance(payload, list):
            raise ValueError("Patch history format is invalid; snapshots were not changed.")
        return payload

    def _record(self, patch: PatchSet) -> None:
        safe_store(self.root)
        if self._history_path.is_symlink() or self._history_path.with_suffix(".tmp").is_symlink():
            raise ValueError("Patch history storage is unsafe.")
        self._history_path.parent.mkdir(parents=True, exist_ok=True)
        entries = [item for item in self._history() if item.get("id") != patch.id]
        entries.insert(0, {"id": patch.id, "source": patch.source, "source_id": patch.source_id,
                           "created_at": patch.created_at, "status": patch.status,
                           "risk_level": patch.risk_level, "files": [file.path for file in patch.files],
                           "validation": patch.validation, "rollback_available": patch.rollback_available,
                           "applied_hashes": patch.applied_hashes,
                           "rolled_back_files": patch.rolled_back_files})
        temp = self._history_path.with_suffix(".tmp")
        temp.write_text(json.dumps(entries[:200], indent=2), encoding="utf-8")
        os.replace(temp, self._history_path)

    def history(self) -> dict:
        with self._lock:
            return {"success": True, "patches": self._history()}

    def _public(self, patch: PatchSet) -> dict:
        result = patch.public()
        for index, file in enumerate(patch.files):
            before = file.original_bytes.decode("utf-8")
            after = file.proposed_bytes.decode("utf-8")
            result["files"][index]["unified_diff"] = unified(file.path, before, after)
            result["files"][index]["changed_lines"] = sum(
                max(hunk.old_count, hunk.new_count) for hunk in file.hunks)
        result["success"] = True
        return result

    def get(self, patch_id: str) -> dict:
        with self._lock:
            patch = self._patches.get(patch_id)
            if patch:
                return self._public(patch)
            item = next((entry for entry in self._history() if entry.get("id") == patch_id), None)
            if item:
                return {"success": True, **item, "preview_available": False}
            raise ValueError("Patch not found.")

    def generate(self, source: str, path: str, *, suggestion_id: str = "",
                 start_line: int = 0, end_line: int = 0, transformation: str = "",
                 replacement: str = "", plan: dict | None = None, step_id: str = "",
                 proposed_content: str | None = None, repo_revision: str = "",
                 impact: dict | None = None) -> dict:
        with self._lock:
            if source == "humanize":
                file = humanize_file(self.root, path, suggestion_id)
                source_id = suggestion_id
            elif source == "selection":
                file = selected_range(self.root, path, start_line, end_line, transformation, replacement)
                source_id = f"{path}:{start_line}-{end_line}:{transformation}"
            elif source == "planner":
                file = planner_file(self.root, plan or {}, step_id)
                source_id = f"{(plan or {}).get('id', '')}:{step_id}"
            elif source == "ai":
                if proposed_content is None:
                    raise ValueError("AI patch generation requires an explicit structured proposal.")
                file = build_file(self.root, path, proposed_content, "Explicit AI rewrite preview", "HIGH", True)
                source_id = f"ai:{path}"
            else:
                raise ValueError("Unsupported patch source.")
            return self._register(source, source_id, [file], repo_revision, impact)

    def generate_group(self, changes: list[dict], *, repo_revision: str = "",
                       impact: dict | None = None) -> dict:
        """Group explicitly selected independent file changes; never consume a full plan."""
        with self._lock:
            if not isinstance(changes, list) or not 1 <= len(changes) <= 100:
                raise ValueError("Select 1 to 100 independent file changes per request.")
            files = []
            for change in changes:
                if not isinstance(change, dict):
                    raise ValueError("Each change must be an object.")
                source, path = change.get("source"), change.get("path")
                if source == "humanize":
                    file = humanize_file(self.root, path, change.get("suggestion_id", ""))
                elif source == "selection":
                    file = selected_range(self.root, path, change.get("start_line", 0),
                        change.get("end_line", 0), change.get("transformation", ""),
                        change.get("replacement", ""))
                else:
                    raise ValueError("Groups support explicit Humanize or selected-range changes only.")
                if any(item.path == file.path for item in files):
                    raise ValueError("A patch group may contain each file only once.")
                files.append(file)
            groups = []
            current = []
            changed_lines = 0
            for file in files:
                size = sum(max(h.old_count, h.new_count) for h in file.hunks)
                if size > MAX_CHANGED_LINES:
                    raise ValueError(f"{file.path} exceeds the changed-line limit; split that file manually.")
                if current and (len(current) >= MAX_FILES or changed_lines + size > MAX_CHANGED_LINES):
                    groups.append(current)
                    current, changed_lines = [], 0
                current.append(file)
                changed_lines += size
            if current:
                groups.append(current)
            results = [self._register("group", digest(json.dumps([f.path + f.proposed_hash for f in group]).encode())[:20],
                                      group, repo_revision, impact) for group in groups]
            return results[0] if len(results) == 1 else {"success": True, "split": True, "patches": results,
                                                          "message": "Large selection was split into separate reviewable PatchSets."}

    def _register(self, source: str, source_id: str, files: list, repo_revision: str,
                  impact: dict | None) -> dict:
        if len(files) > MAX_FILES or sum(max(h.old_count, h.new_count) for file in files
                                      for h in file.hunks) > MAX_CHANGED_LINES:
            raise ValueError("Patch exceeds the 20-file or 1,500 changed-line limit; split the work.")
        for file in files:
            if file.risk_level == "LOW" and len(file.hunks) > 30:
                file.risk_level = "MEDIUM"
            if source == "ai":
                file.warnings.append("AI output requires manual review and explicit apply approval.")
        impact_hash = digest(json.dumps(impact or {}, sort_keys=True, default=str).encode())
        cache_key = ":".join([source, source_id, repo_revision, impact_hash] +
                             [file.path + file.original_hash + file.proposed_hash for file in files])
        existing = self._cache.get(cache_key)
        if existing and existing in self._patches and self._patches[existing].status == "ready":
            return {**self._public(self._patches[existing]), "cached": True}
        patch_id = uuid.uuid4().hex
        risk_level = "HIGH" if any(f.risk_level == "HIGH" for f in files) else "MEDIUM" if any(f.risk_level == "MEDIUM" for f in files) else "LOW"
        if (impact or {}).get("risk_level") == "HIGH" and risk_level != "HIGH":
            risk_level = "HIGH"
            for file in files:
                file.warnings.append("Change Impact rates this target as high risk.")
        patch = PatchSet(patch_id, source, source_id, repo_revision or self.git_info().get("head") or "local",
                         f"{source.title()} patch for {', '.join(f.path for f in files)}", files, risk_level=risk_level,
                         status="ready", impact=impact or {}, git=self.git_info())
        self._patches[patch_id] = patch
        self._cache[cache_key] = patch_id
        self._record(patch)
        return {**self._public(patch), "cached": False, "llm_calls": 0}

    def validate(self, patch_id: str, selected_hunks: list[str]) -> dict:
        with self._lock:
            patch = self._patches.get(patch_id)
            if patch is None:
                raise ValueError("Patch preview is unavailable; regenerate it.")
            if patch.source == "planner" and re.fullmatch(r"[0-9a-f]{40,64}", patch.repo_revision):
                head = self.git_info().get("head")
                if head and head != patch.repo_revision:
                    patch.status = "stale"
                    self._record(patch)
                    raise ValueError("Planner revision changed since patch generation. Regenerate patch.")
            try:
                replacements, checks = validate_selection(self.root, patch, selected_hunks)
            except ValueError:
                self._record(patch)
                raise
            if len(replacements) > MAX_FILES or sum(max(h.old_count, h.new_count) for file in patch.files
                                                    for h in file.hunks if f"{file.path}:{h.id}" in selected_hunks) > MAX_CHANGED_LINES:
                raise ValueError("Selection exceeds patch size limits.")
            failed = any(item["state"] == "FAILED" for item in checks)
            partial = any(item["state"] == "NOT_RUN" for item in checks)
            patch.validation = {"state": "FAILED" if failed else "PARTIAL" if partial else "PASSED",
                                "checks": checks, "affected_tests": (patch.impact or {}).get("affected_tests", []),
                                "selected_hunks": selected_hunks,
                                "checklist": {"hashes_current": True, "paths_safe": True,
                                              "sensitive_targets_blocked": True, "dependencies_satisfied": True,
                                              "public_api_ack_required": any(f.public_api_change for f in patch.files),
                                              "high_risk_ack_required": patch.risk_level == "HIGH"}}
            patch.selected_hunks = list(selected_hunks)
            self._record(patch)
            return {"success": not failed, "patch_id": patch_id, "status": patch.status,
                    "validation": patch.validation, "selected_diff": {
                        path: unified(path, next(f.original_bytes.decode("utf-8") for f in patch.files if f.path == path),
                                      raw.decode("utf-8")) for path, raw in replacements.items()}}

    def apply(self, patch_id: str, selected_hunks: list[str], *, confirm_apply: bool = False,
              confirm_high_risk: bool = False, confirm_public_api: bool = False,
              trusted_validation: bool = False) -> dict:
        if confirm_apply is not True:
            raise ValueError("Explicit apply confirmation is required.")
        with self._lock:
            if trusted_validation:
                git = self.git_info()
                if not git.get("available") or not re.search(r"github\.com[:/]AKshay1376/Repo-Explainer(?:\.git)?$",
                                                              git.get("origin") or "", re.IGNORECASE) or self.root.name.lower() != "repo-explainer":
                    raise ValueError("Trusted project commands are permitted only for the Repo Explainer checkout.")
            patch = self._patches.get(patch_id)
            if patch is None:
                raise ValueError("Patch preview is unavailable; regenerate it.")
            if patch.risk_level == "HIGH" and confirm_high_risk is not True:
                raise ValueError("High-risk changes require a second acknowledgement.")
            if any(file.public_api_change for file in patch.files) and confirm_public_api is not True:
                raise ValueError("Public API changes require explicit acknowledgement.")
            if selected_hunks != patch.selected_hunks or patch.validation["state"] not in {"PASSED", "PARTIAL"}:
                raise ValueError("Validate this exact hunk selection before apply.")
            replacements, checks = validate_selection(self.root, patch, selected_hunks)
            if any(item["state"] == "FAILED" for item in checks):
                raise ValueError("Pre-apply syntax validation failed.")
            patch.status = "approved"
            self._record(patch)
            patch.status = "snapshotting"
            self._record(patch)
            def snapshot_recorded(after_hashes):
                patch.applied_hashes = after_hashes
                patch.rollback_available = True
                patch.status = "applying"
                self._record(patch)
            try:
                result = apply_files(self.root, patch.id, replacements, on_snapshot=snapshot_recorded)
            except Exception as error:
                patch.status = "rejected"
                if isinstance(error, ApplyFailure) and error.rollback_failed:
                    patch.rollback_available = True
                    patch.applied_hashes = {path: digest(replacements[path]) for path in error.rollback_failed}
                    patch.warnings.append("Automatic rollback was incomplete; use the saved byte snapshot to restore the listed files.")
                else:
                    patch.rollback_available = False
                    patch.applied_hashes = {}
                    patch.warnings.append("Apply failed; already-written files were restored.")
                self._record(patch)
                raise ValueError(f"Patch apply failed: {error}") from error
            patch.applied_hashes = result["after_hashes"]
            patch.rollback_available = True
            post_checks = []
            for path, expected in result["after_hashes"].items():
                actual = (self.root / path).read_bytes()
                if digest(actual) != expected:
                    post_checks.append({"state": "FAILED", "command": "SHA-256 post-apply verification",
                                        "exit_code": 1, "output_summary": f"{path}: content differs from approved patch"})
                else:
                    post_checks.append(syntax_check(path, actual.decode("utf-8")))
            failed = any(item["state"] == "FAILED" for item in post_checks)
            partial = any(item["state"] == "NOT_RUN" for item in post_checks)
            if trusted_validation and not failed:
                post_checks.extend(self._trusted_checks())
                failed = any(item["state"] == "FAILED" for item in post_checks)
                partial = any(item["state"] == "NOT_RUN" for item in post_checks if item["command"] != "No trusted parser configured")
            patch.validation = {"state": "FAILED" if failed else "PARTIAL" if partial else "PASSED",
                                "checks": post_checks, "affected_tests": (patch.impact or {}).get("affected_tests", []),
                                "note": "Fixed Repo Explainer checks ran by explicit request." if trusted_validation else
                                        "Deterministic syntax checks ran. Project commands require explicit trust."}
            patch.status = "validation_failed" if failed else "applied"
            patch.git = self.git_info()
            self._record(patch)
            return {"success": True, "patch": self._public(patch), "applied_files": result["applied_files"]}

    def rollback(self, patch_id: str, *, paths: list[str] | None = None,
                 confirm_conflicts: bool = False) -> dict:
        if not re.fullmatch(r"[0-9a-f]{32}", patch_id):
            raise ValueError("Invalid patch ID.")
        with self._lock:
            patch = self._patches.get(patch_id)
            history = next((entry for entry in self._history() if entry.get("id") == patch_id), None)
            if not history or not history.get("rollback_available"):
                raise ValueError("No rollback snapshot is available.")
            already = set(history.get("rolled_back_files") or [])
            if paths and set(paths) & already:
                raise ValueError("Some selected files were already rolled back.")
            if not paths:
                paths = [path for path in history.get("applied_hashes", {}) if path not in already]
            if not paths:
                raise ValueError("All files in this patch were already rolled back.")
            result = restore(self.root, patch_id, paths, confirm_conflicts,
                             expected=history.get("applied_hashes") or None)
            if result["success"]:
                rolled_back = sorted(already | set(result["restored"]))
                remaining = set(history.get("applied_hashes") or {}) - set(rolled_back)
                if patch:
                    patch.status = "partially_rolled_back" if remaining else "rolled_back"
                    patch.rollback_available = bool(remaining)
                    patch.rolled_back_files = rolled_back
                    patch.git = self.git_info()
                    self._record(patch)
                else:
                    history["status"] = "partially_rolled_back" if remaining else "rolled_back"
                    history["rollback_available"] = bool(remaining)
                    history["rolled_back_files"] = rolled_back
                    entries = [history if item.get("id") == patch_id else item for item in self._history()]
                    temp = self._history_path.with_suffix(".tmp")
                    temp.write_text(json.dumps(entries, indent=2), encoding="utf-8")
                    os.replace(temp, self._history_path)
            return result

    def accept(self, patch_id: str, *, confirm_accept: bool = False) -> dict:
        if confirm_accept is not True:
            raise ValueError("Explicit acceptance is required.")
        with self._lock:
            patch = self._patches.get(patch_id)
            history = next((item for item in self._history() if item.get("id") == patch_id), None)
            if history is None or history.get("status") != "applied":
                raise ValueError("Only a successfully applied patch can be accepted.")
            for path, expected in (history.get("applied_hashes") or {}).items():
                if digest(safe_target(self.root, path).read_bytes()) != expected:
                    raise ValueError("Applied files changed; inspect the difference before accepting.")
            if patch:
                patch.status = "accepted"
                self._record(patch)
                return {"success": True, "patch": self._public(patch)}
            history["status"] = "accepted"
            entries = [history if item.get("id") == patch_id else item for item in self._history()]
            temp = self._history_path.with_suffix(".tmp")
            temp.write_text(json.dumps(entries, indent=2), encoding="utf-8")
            os.replace(temp, self._history_path)
            return {"success": True, "patch": {"id": patch_id, "status": "accepted",
                                                  "rollback_available": history.get("rollback_available")}}

    def reject(self, patch_id: str) -> dict:
        with self._lock:
            patch = self._patches.get(patch_id)
            if patch is None or patch.status not in {"ready", "stale"}:
                raise ValueError("Only a reviewable preview can be rejected.")
            patch.status = "rejected"
            self._record(patch)
            return {"success": True, "patch": self._public(patch)}
