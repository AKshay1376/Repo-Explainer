"""Compact analysis snapshots and comparable numeric metrics."""

import json

from .models import identifier, now, row, sha, text

TYPES = {"repository_model", "project_health", "humanize", "impact", "history", "documentation", "refactor_plan", "validation"}
STATUSES = {"complete", "partial", "failed"}
METRICS = {"health_score", "finding_count", "cycle_count", "file_count", "risk_score", "commit_count"}


def record(connection, project_id, analysis_type, *, repo_sha=None, summary="", status="complete", metrics=None, limit=50):
    if analysis_type not in TYPES or status not in STATUSES:
        raise ValueError("Unsupported analysis snapshot.")
    metrics = metrics or {}
    if not isinstance(metrics, dict) or any(key not in METRICS or isinstance(value, bool) or
        not isinstance(value, (int, float)) or abs(value) > 1_000_000 for key, value in metrics.items()):
        raise ValueError("Only bounded numeric analysis metrics may be saved.")
    snapshot_id, stamp = identifier(), now()
    connection.execute("""INSERT INTO analysis_snapshots
        (id,project_id,repo_sha,analysis_type,created_at,summary,status,version,metrics_json)
        VALUES (?,?,?,?,?,?,?,?,?)""", (snapshot_id, project_id, sha(repo_sha), analysis_type,
        stamp, text(summary, 500), status, 1, json.dumps(metrics, sort_keys=True)))
    connection.execute("UPDATE projects SET last_analysis_id=?,updated_at=? WHERE id=?", (snapshot_id, stamp, project_id))
    connection.execute("""DELETE FROM analysis_snapshots WHERE id IN (
        SELECT id FROM analysis_snapshots WHERE project_id=? AND analysis_type=?
        ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?)""", (project_id, analysis_type, limit))
    return get(connection, snapshot_id)


def get(connection, snapshot_id):
    item = row(connection.execute("SELECT * FROM analysis_snapshots WHERE id=?", (snapshot_id,)).fetchone())
    if item:
        item["metrics"] = json.loads(item.pop("metrics_json"))
    return item


def list_snapshots(connection, project_id, limit=50):
    ids = connection.execute("SELECT id FROM analysis_snapshots WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?",
                             (project_id, limit)).fetchall()
    return [get(connection, item["id"]) for item in ids]


def compare(connection, project_id, first, second):
    before, after = get(connection, first), get(connection, second)
    if not before or not after or before["project_id"] != project_id or after["project_id"] != project_id or before["analysis_type"] != after["analysis_type"]:
        raise ValueError("Choose two matching snapshots from this project.")
    keys = before["metrics"].keys() & after["metrics"].keys()
    return {"type": before["analysis_type"], "before": before["id"], "after": after["id"],
            "changes": {key: {"before": before["metrics"][key], "after": after["metrics"][key],
                              "delta": after["metrics"][key] - before["metrics"][key]} for key in keys}}
