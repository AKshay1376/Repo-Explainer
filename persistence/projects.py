"""Project CRUD and bounded home/dashboard queries."""

from .models import identifier, now, row, sha, text


def create(connection, repository, *, name=None, description="", branch=None, repo_sha=None, allow_duplicate=False):
    if not allow_duplicate:
        existing = connection.execute("""SELECT p.id FROM projects p WHERE p.saved_repository_id=?
            AND p.archived=0 ORDER BY p.created_at LIMIT 1""", (repository["id"],)).fetchone()
        if existing:
            return get(connection, existing["id"]), False
    stamp = now()
    project_id = identifier()
    connection.execute("""INSERT INTO projects
        (id,saved_repository_id,name,description,current_branch,current_sha,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)""", (project_id, repository["id"], text(name or repository["display_name"]),
        text(description, 1000), text(branch, 100) if branch else None, sha(repo_sha), stamp, stamp))
    return get(connection, project_id), True


def get(connection, project_id):
    return row(connection.execute("""SELECT p.*, r.canonical_url AS repo_url, r.display_name AS repository_name,
        r.owner, r.repo_name, r.local_path, r.favorite, r.last_opened_at, r.last_known_sha,
        (SELECT json_extract(metrics_json,'$.health_score') FROM analysis_snapshots a
         WHERE a.project_id=p.id AND a.analysis_type='project_health' ORDER BY created_at DESC LIMIT 1) AS health_score,
        (SELECT created_at FROM analysis_snapshots a WHERE a.project_id=p.id ORDER BY created_at DESC LIMIT 1) AS last_analyzed_at
        ,(SELECT count(*) FROM generated_documents d WHERE d.project_id=p.id) AS document_count
        ,(SELECT title FROM generated_documents d WHERE d.project_id=p.id ORDER BY created_at DESC LIMIT 1) AS latest_document_title
        FROM projects p JOIN saved_repositories r ON r.id=p.saved_repository_id WHERE p.id=?""", (project_id,)).fetchone())


def list_projects(connection, *, archived=False, query="", limit=50):
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = connection.execute("""SELECT p.id FROM projects p JOIN saved_repositories r ON r.id=p.saved_repository_id
        WHERE p.archived=? AND (p.name LIKE ? ESCAPE '\\' OR r.repo_name LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM generated_documents d WHERE d.project_id=p.id AND d.title LIKE ? ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM bookmarks b WHERE b.project_id=p.id AND b.label LIKE ? ESCAPE '\\'))
        ORDER BY r.favorite DESC, r.last_opened_at DESC, p.updated_at DESC LIMIT ?""",
        (int(archived), pattern, pattern, pattern, pattern, limit)).fetchall()
    return [get(connection, item["id"]) for item in rows]


def update(connection, project_id, changes):
    current = get(connection, project_id)
    if not current:
        raise ValueError("Project not found.")
    fields = {}
    for key in ("name", "description", "current_branch"):
        if key in changes:
            fields[key] = text(changes[key], 1000 if key == "description" else 100)
    if "current_sha" in changes:
        fields["current_sha"] = sha(changes["current_sha"])
    if "archived" in changes:
        if not isinstance(changes["archived"], bool):
            raise ValueError("Archived must be true or false.")
        fields["archived"] = int(changes["archived"])
    if "favorite" in changes:
        if not isinstance(changes["favorite"], bool):
            raise ValueError("Favorite must be true or false.")
        connection.execute("UPDATE saved_repositories SET favorite=?,updated_at=? WHERE id=?",
                           (int(changes["favorite"]), now(), current["saved_repository_id"]))
    if "local_path" in changes:
        path = changes["local_path"]
        connection.execute("UPDATE saved_repositories SET local_path=?,updated_at=? WHERE id=?",
                           (text(path, 500) if path else None, now(), current["saved_repository_id"]))
    if fields:
        fields["updated_at"] = now()
        assignments = ",".join(f"{key}=?" for key in fields)
        connection.execute(f"UPDATE projects SET {assignments} WHERE id=?", (*fields.values(), project_id))
    return get(connection, project_id)


def delete(connection, project_id):
    current = get(connection, project_id)
    if not current:
        raise ValueError("Project not found.")
    connection.execute("DELETE FROM projects WHERE id=?", (project_id,))
    if not connection.execute("SELECT 1 FROM projects WHERE saved_repository_id=?", (current["saved_repository_id"],)).fetchone():
        connection.execute("DELETE FROM saved_repositories WHERE id=?", (current["saved_repository_id"],))
