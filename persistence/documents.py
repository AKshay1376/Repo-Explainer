"""Bounded saved documents; no source cache or raw repository model."""

from .models import identifier, now, row, scrub, sha, text

FORMATS = {"markdown", "html", "json"}


def save(connection, project_id, doc_type, title, repo_sha, format, content):
    if format not in FORMATS or not isinstance(content, str) or len(content.encode("utf-8")) > 100_000:
        raise ValueError("Document format or size is unsupported.")
    # Generated Markdown has already been assembled from sanitized evidence. Recheck at the durable boundary.
    clean_content = scrub(content)
    if not clean_content:
        raise ValueError("Document content is empty or unsafe.")
    document_id, stamp = identifier(), now()
    connection.execute("""INSERT INTO generated_documents
        (id,project_id,type,title,repo_sha,format,content,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)""", (document_id, project_id, text(doc_type, 80), text(title, 200),
        sha(repo_sha), format, clean_content, stamp, stamp))
    return get(connection, document_id)


def get(connection, document_id):
    return row(connection.execute("SELECT * FROM generated_documents WHERE id=?", (document_id,)).fetchone())


def list_documents(connection, project_id, limit=50):
    return [dict(item) for item in connection.execute("""SELECT id,project_id,type,title,repo_sha,format,
        length(content) AS size_bytes,created_at,updated_at FROM generated_documents
        WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT ?""", (project_id, limit)).fetchall()]


def duplicate(connection, project_id, document_id):
    original = get(connection, document_id)
    if not original or original["project_id"] != project_id:
        raise ValueError("Saved document not found in this project.")
    return save(connection, project_id, original["type"], original["title"] + " (copy)",
                original["repo_sha"], original["format"], original["content"])


def delete(connection, project_id, document_id):
    if not get(connection, document_id) or get(connection, document_id)["project_id"] != project_id:
        raise ValueError("Saved document not found in this project.")
    connection.execute("DELETE FROM generated_documents WHERE id=?", (document_id,))
