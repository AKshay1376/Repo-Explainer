"""Canonical GitHub repository identity and saved project metadata."""

from .models import canonical_repo, identifier, now, row, sha, text


def save(connection, repo_url, *, display_name=None, local_path=None, default_branch=None, repo_sha=None):
    url, owner, name = canonical_repo(repo_url)
    existing = connection.execute("SELECT * FROM saved_repositories WHERE canonical_url=?", (url,)).fetchone()
    stamp = now()
    if existing:
        connection.execute("""UPDATE saved_repositories SET display_name=COALESCE(?,display_name),
            local_path=COALESCE(?,local_path), default_branch=COALESCE(?,default_branch),
            last_known_sha=COALESCE(?,last_known_sha), last_opened_at=?, updated_at=? WHERE id=?""",
            (text(display_name) if display_name else None, text(local_path, 500) if local_path is not None else None,
             text(default_branch, 100) if default_branch else None, sha(repo_sha), stamp, stamp, existing["id"]))
        repo_id = existing["id"]
    else:
        repo_id = identifier()
        connection.execute("""INSERT INTO saved_repositories
            (id,canonical_url,display_name,local_path,owner,repo_name,default_branch,last_known_sha,
             last_opened_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (repo_id, url, text(display_name or name), text(local_path, 500) if local_path else None,
             owner, name, text(default_branch, 100) if default_branch else None, sha(repo_sha), stamp, stamp, stamp))
    return row(connection.execute("SELECT * FROM saved_repositories WHERE id=?", (repo_id,)).fetchone())


def get(connection, repo_id):
    return row(connection.execute("SELECT * FROM saved_repositories WHERE id=?", (repo_id,)).fetchone())
