"""Phase 18 deployment boundary and durable job tests."""

import os
from pathlib import Path
import tempfile
import threading
import time
import unittest

from flask import Flask, jsonify

from config import load_settings
from deployment.observability import install_observability, RedactingFormatter
from deployment.security import install_security
from jobs import JobService
from persistence.database import Database
from web_app import app


def production_env(root):
    return {
        "APP_ENV": "production", "DATA_DIR": str(root), "FRONTEND_ORIGINS": "https://app.example.test",
        "AUTH_MODE": "required", "APP_SECRET_KEY": "s" * 40, "APP_ADMIN_PASSWORD": "p" * 20,
        "RATELIMIT_STORAGE_URI": "memory://", "WEB_WORKERS": "1",
    }


class ConfigurationTests(unittest.TestCase):
    def test_local_defaults_and_public_capabilities(self):
        value = load_settings({})
        self.assertEqual(value.host, "127.0.0.1")
        self.assertEqual(value.auth_mode, "disabled")
        self.assertTrue(value.local_fs_operations)
        with tempfile.TemporaryDirectory() as root:
            production = load_settings(production_env(root))
            self.assertFalse(production.local_fs_operations)
            self.assertFalse(production.capabilities()["validator_execution"])

    def test_rejects_unsafe_production_configuration(self):
        with tempfile.TemporaryDirectory() as root:
            baseline = production_env(root)
            for overrides in (
                {"APP_DEBUG": "true"}, {"FRONTEND_ORIGINS": "*"},
                {"FRONTEND_ORIGINS": "http://app.example.test"},
                {"APP_SECRET_KEY": "short"}, {"AUTH_MODE": "disabled"},
                {"DATA_DIR": "relative"}, {"WEB_WORKERS": "2"},
            ):
                with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                    load_settings({**baseline, **overrides})

    def test_session_csrf_origin_request_limit_and_capabilities(self):
        with tempfile.TemporaryDirectory() as root:
            settings = load_settings({**production_env(root), "MAX_REQUEST_BYTES": "1024"})
            target = Flask(__name__)
            install_observability(target)
            install_security(target, settings)

            @target.post("/api/action")
            def action():
                return jsonify({"success": True})

            @target.post("/api/patch/apply")
            def local_action():
                return jsonify({"success": True})

            client = target.test_client()
            self.assertEqual(client.post("/api/action").status_code, 401)
            self.assertEqual(client.post("/api/auth/login", json={"password": "wrong"}).status_code, 401)
            self.assertEqual(client.post("/api/auth/login", json={"password": "p" * 20},
                                         headers={"Origin": "https://evil.example.test"}).status_code, 403)
            login = client.post("/api/auth/login", json={"password": "p" * 20},
                                headers={"Origin": "https://app.example.test"})
            self.assertEqual(login.status_code, 200)
            self.assertIn("HttpOnly", login.headers["Set-Cookie"])
            self.assertIn("Secure", login.headers["Set-Cookie"])
            self.assertEqual(client.post("/api/action").status_code, 403)
            token = login.json["csrf_token"]
            self.assertEqual(client.post("/api/action", headers={"X-CSRF-Token": token}).status_code, 200)
            self.assertEqual(client.post("/api/action", data=b"x" * 1100,
                                         headers={"X-CSRF-Token": token}).status_code, 413)
            self.assertEqual(client.post("/api/patch/apply", headers={"X-CSRF-Token": token}).status_code, 403)
            self.assertIn("X-Request-ID", login.headers)
            self.assertEqual(client.get("/api/auth/session").json["authenticated"], True)

    def test_optional_auth_keeps_saved_data_private(self):
        with tempfile.TemporaryDirectory() as root:
            settings = load_settings({**production_env(root), "AUTH_MODE": "optional"})
            target = Flask(__name__)
            install_security(target, settings)

            @target.get("/api/docs/types")
            def public_read():
                return jsonify({"success": True})

            @target.get("/api/projects")
            def private_read():
                return jsonify({"success": True})

            client = target.test_client()
            self.assertEqual(client.get("/api/docs/types").status_code, 200)
            self.assertEqual(client.get("/api/projects").status_code, 401)

    def test_log_formatter_redacts_secrets(self):
        import logging
        record = logging.LogRecord("test", logging.ERROR, "test.py", 1,
                                   "Authorization: Bearer secret-value password=hidden", (), None)
        output = RedactingFormatter("%(message)s").format(record)
        self.assertNotIn("secret-value", output)
        self.assertNotIn("hidden", output)

    def test_health_cors_headers_and_spa_api_boundary(self):
        client = app.test_client()
        health = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.headers["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertNotEqual(health.headers["Access-Control-Allow-Origin"], "*")
        self.assertIn("frame-ancestors", health.headers["Content-Security-Policy"])
        self.assertNotIn("Access-Control-Allow-Origin",
                         client.get("/api/version", headers={"Origin": "https://untrusted.example.test"}).headers)
        self.assertEqual(client.get("/api/unknown").status_code, 404)
        self.assertEqual(client.get("/api/ready").status_code, 200)
        self.assertEqual(client.get("/api/version").status_code, 200)
        self.assertTrue(client.get("/api/capabilities").json["capabilities"]["persistent_projects"])


class JobAndBackupTests(unittest.TestCase):
    def test_job_lifecycle_cancel_and_backup(self):
        with tempfile.TemporaryDirectory() as root:
            db = Database(Path(root) / "repo.db")
            started = threading.Event()
            release = threading.Event()

            def analyze(_repo):
                started.set()
                release.wait(3)
                return "project-1"

            jobs = JobService(db, analyze, workers=1, queue_limit=1)
            try:
                first = jobs.submit("repository_analysis", "owner/repo")
                self.assertTrue(started.wait(2))
                second = jobs.submit("repository_analysis", "owner/other")
                with self.assertRaises(OverflowError):
                    jobs.submit("repository_analysis", "owner/third")
                self.assertEqual(jobs.cancel(second["id"])["status"], "cancelled")
                with self.assertRaises(RuntimeError):
                    jobs.cancel(first["id"])
                release.set()
                for _ in range(30):
                    if jobs.get(first["id"])["status"] == "completed":
                        break
                    time.sleep(0.05)
                self.assertEqual(jobs.get(first["id"])["result_project_id"], "project-1")
                backup = db.backup(retain=1)
                self.assertTrue(backup.is_file())
                latest = db.backup(retain=1)
                self.assertEqual(len(list(latest.parent.glob("repo-explainer-*.db"))), 1)
                self.assertTrue(db.check_ready())
            finally:
                release.set()
                jobs.shutdown()
