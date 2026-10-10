"""Short-lived SQLite connections; durable data never shares the analysis cache."""

from contextlib import contextmanager
from pathlib import Path
import os
import sqlite3
import threading

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
