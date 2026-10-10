"""Bounded in-process analysis jobs with durable, compact status metadata."""

import atexit
from datetime import datetime, timezone
import queue
import threading
import time
import uuid

from persistence.database import Database
from security import validate_github_url


def stamp():
    return datetime.now(timezone.utc).isoformat()


class JobService:
    def __init__(self, database: Database, analyze, *, workers=2, queue_limit=20, timeout_seconds=180):
        self.db = database
        self.analyze = analyze
        self.timeout_seconds = timeout_seconds
        self.pending = queue.Queue(maxsize=queue_limit)
        self.running = 0
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.threads = []
        for index in range(workers):
            thread = threading.Thread(target=self._work, name=f"repo-job-{index}", daemon=True)
            thread.start()
            self.threads.append(thread)
        atexit.register(self.shutdown)

    def submit(self, kind, repo_url):
        if kind != "repository_analysis":
            raise ValueError("Unsupported background job type.")
        owner, repo = validate_github_url(repo_url or "")
        canonical = f"https://github.com/{owner}/{repo}"
        job_id = uuid.uuid4().hex
        with self.lock:
            if self.pending.full():
                raise OverflowError("Analysis queue is full.")
            with self.db.connection(write=True) as connection:
                connection.execute("""INSERT INTO jobs
                    (id,type,status,repo_url,created_at,message) VALUES (?,?,?,?,?,?)""",
                    (job_id, kind, "queued", canonical, stamp(), "Waiting for a worker"))
            self.pending.put_nowait(job_id)
        return self.get(job_id)

    def get(self, job_id):
        if not isinstance(job_id, str) or len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id):
            raise ValueError("Invalid job ID.")
        with self.db.connection() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row is None:
                raise ValueError("Job not found.")
            return dict(row)

    def cancel(self, job_id):
        with self.db.connection(write=True) as connection:
            row = connection.execute("SELECT status FROM jobs WHERE id=?", (job_id,)).fetchone()
            if row is None:
                raise ValueError("Job not found.")
            if row["status"] != "queued":
                raise RuntimeError("Only queued jobs can be cancelled safely.")
            connection.execute("UPDATE jobs SET status='cancelled',message='Cancelled before starting',finished_at=? WHERE id=?",
                               (stamp(), job_id))
        return self.get(job_id)

    def _work(self):
        while not self.stop.is_set():
            try:
                job_id = self.pending.get(timeout=0.25)
            except queue.Empty:
                continue
            try:
                with self.db.connection(write=True) as connection:
                    row = connection.execute("SELECT status,repo_url FROM jobs WHERE id=?", (job_id,)).fetchone()
                    if row is None or row["status"] != "queued":
                        continue
                    connection.execute("UPDATE jobs SET status='running',progress=10,message='Analyzing repository',started_at=? WHERE id=?",
                                       (stamp(), job_id))
                    repo_url = row["repo_url"]
                try:
                    started = time.monotonic()
                    project_id = self.analyze(repo_url)
                    if time.monotonic() - started > self.timeout_seconds:
                        status, message, progress = "failed", "Analysis exceeded the job time budget", 0
                        project_id = None
                    else:
                        status, message, progress = "completed", "Analysis complete", 100
                except Exception:
                    project_id = None
                    status, message, progress = "failed", "Analysis failed; retry the request", 0
                with self.db.connection(write=True) as connection:
                    connection.execute("""UPDATE jobs SET status=?,message=?,progress=?,
                        result_project_id=?,finished_at=? WHERE id=?""",
                        (status, message, progress, project_id, stamp(), job_id))
            finally:
                self.pending.task_done()

    def shutdown(self):
        self.stop.set()
        for thread in self.threads:
            thread.join(timeout=2)
