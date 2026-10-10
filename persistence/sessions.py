"""Navigation-only workspace restoration; patch/apply state is never resumed."""

from .models import now, row, safe_path, sha, text

VIEWS = {"health", "history", "docs", "explorer", "graph", "ask", "flow", "impact", "report",
         "source", "humanize", "refactor", "patch", "validation", "project"}


def get(connection, current_sha=None):
    result = row(connection.execute("SELECT * FROM workspace_session WHERE id=1").fetchone())
    if not result:
        return None
    if current_sha is not None:
        result["revision_changed"] = bool(result["repo_sha"] and sha(current_sha) != result["repo_sha"])
    return result


def save(connection, data):
    if not isinstance(data, dict):
        raise ValueError("Session must be an object.")
    project_id = data.get("project_id")
    if project_id is not None and not connection.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
        raise ValueError("Session project not found.")
    view = data.get("active_view", "project")
    if view not in VIEWS:
        raise ValueError("Invalid workspace view.")
    file = data.get("selected_file")
    start, end = data.get("source_start"), data.get("source_end")
    if any(value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 1 or value > 1000000) for value in (start, end)) or (start and end and end < start):
        raise ValueError("Invalid source line range.")
    connection.execute("""INSERT INTO workspace_session
        (id,project_id,repo_sha,active_view,selected_file,selected_symbol,source_start,source_end,graph_mode,updated_at)
        VALUES (1,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
        project_id=excluded.project_id,repo_sha=excluded.repo_sha,active_view=excluded.active_view,
        selected_file=excluded.selected_file,selected_symbol=excluded.selected_symbol,
        source_start=excluded.source_start,source_end=excluded.source_end,
        graph_mode=excluded.graph_mode,updated_at=excluded.updated_at""",
        (project_id, sha(data.get("repo_sha")), view, safe_path(file) if file else None,
         text(data.get("selected_symbol"), 200) if data.get("selected_symbol") else None,
         start, end, text(data.get("graph_mode"), 60) if data.get("graph_mode") else None, now()))
    return get(connection)


def recent(connection, project_id, kind, target, view=None, limit=500):
    if kind not in {"file", "route", "model", "commit", "document"}:
        raise ValueError("Invalid recent item type.")
    target = safe_path(target) if kind == "file" else text(target, 300)
    if not target:
        raise ValueError("Recent item target is required.")
    connection.execute("""INSERT INTO recent_items(id,project_id,type,target,view,created_at) VALUES
        (lower(hex(randomblob(16))),?,?,?,?,?) ON CONFLICT(project_id,type,target)
        DO UPDATE SET view=excluded.view,created_at=excluded.created_at""",
        (project_id, kind, target, text(view, 60) if view else None, now()))
    connection.execute("""DELETE FROM recent_items WHERE id IN
        (SELECT id FROM recent_items WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ?)""",
        (project_id, limit))


def list_recent(connection, project_id, limit=30):
    return [dict(item) for item in connection.execute("SELECT * FROM recent_items WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?",
                                                (project_id, limit)).fetchall()]
