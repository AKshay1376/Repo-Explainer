"""Short-lived SQLite connections; durable data never shares the analysis cache."""

from contextlib import contextmanager
from pathlib import Path
import os
import sqlite3
import threading
from datetime import datetime, timezone
import tempfile
import logging

from .migrations import migrate


class Database:
    def __init__(self, path=None):
        self.path = Path(path or os.getenv("REPO_EXPLAINER_DB_PATH") or
                         Path(__file__).resolve().parent.parent / ".repo-explainer" / "data" / "repo-explainer.db")
        self._lock = threading.Lock()
        self._ready = False

    def _connect(self):
        connection = sqlite3.connect(str(self.path), timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        return connection

    def _prepare(self):
        if self._ready:
            return
        with self._lock:
            if self._ready:
                return
            parent = self.path.parent
            if any(part.is_symlink() for part in (parent, *parent.parents)) or self.path.is_symlink():
                raise ValueError("Local database path is unsafe.")
            parent.mkdir(parents=True, exist_ok=True)
            if parent.is_symlink() or self.path.is_symlink():
                raise ValueError("Local database path is unsafe.")
            if os.name != "nt" and parent.stat().st_mode & 0o002:
                logging.getLogger(__name__).warning("Persistence directory is world-writable.")
            connection = self._connect()
            try:
                connection.execute("PRAGMA journal_mode=WAL")
                migrate(connection)
            finally:
                connection.close()
            self._ready = True

    @contextmanager
    def connection(self, *, write=False):
        self._prepare()
        connection = self._connect()
        try:
            if write:
                connection.execute("BEGIN IMMEDIATE")
            yield connection
            if write:
                connection.commit()
        except Exception:
            if write:
                connection.rollback()
            raise
        finally:
            connection.close()

    def size_bytes(self):
        self._prepare()
        return sum(path.stat().st_size for path in
                   (self.path, Path(str(self.path) + "-wal"), Path(str(self.path) + "-shm")) if path.exists())

    def check_ready(self):
        self._prepare()
        with self.connection() as connection:
            connection.execute("SELECT 1").fetchone()
        with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix=".ready-", delete=True):
            pass
        return True

    def backup(self, retain=7):
        """Use SQLite's online backup API; never copy a live WAL database as files."""
        if not isinstance(retain, int) or not 1 <= retain <= 100:
            raise ValueError("Backup retention must be between 1 and 100.")
        self._prepare()
        destination_dir = self.path.parent / "backups"
        destination_dir.mkdir(mode=0o700, exist_ok=True)
        if destination_dir.is_symlink():
            raise ValueError("Backup directory must not be a symbolic link.")
        name = "repo-explainer-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".db"
        destination = destination_dir / name
        source = self._connect()
        target = sqlite3.connect(str(destination))
        try:
            source.backup(target)
            if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise sqlite3.DatabaseError("Backup integrity check failed.")
        finally:
            target.close()
            source.close()
        for old in sorted(destination_dir.glob("repo-explainer-*.db"), reverse=True)[retain:]:
            old.unlink()
        return destination
