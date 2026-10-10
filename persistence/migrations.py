"""Incremental, idempotent schema migration; user data is never dropped."""

SCHEMA_VERSION = 3


def _statements(connection, sql):
    for statement in sql.split(";"):
        if statement.strip():
            connection.execute(statement)


def migrate(connection):
    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
        row = connection.execute("SELECT version FROM schema_version LIMIT 1").fetchone()
        version = row[0] if row else 0
        if version > SCHEMA_VERSION:
            raise ValueError("Local database was created by a newer Repo Explainer version.")
        if version < 1:
            _statements(connection, """
                CREATE TABLE IF NOT EXISTS user_profile (
                  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS saved_repositories (
                  id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
                  local_path TEXT, owner TEXT NOT NULL, repo_name TEXT NOT NULL, default_branch TEXT,
                  last_known_sha TEXT, last_opened_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  favorite INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS projects (
                  id TEXT PRIMARY KEY, saved_repository_id TEXT NOT NULL REFERENCES saved_repositories(id),
                  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', current_branch TEXT,
                  current_sha TEXT, last_analysis_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  archived INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS analysis_snapshots (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  repo_sha TEXT, analysis_type TEXT NOT NULL, created_at TEXT NOT NULL, summary TEXT NOT NULL,
                  status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, metrics_json TEXT NOT NULL DEFAULT '{}');
                CREATE TABLE IF NOT EXISTS generated_documents (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  type TEXT NOT NULL, title TEXT NOT NULL, repo_sha TEXT, format TEXT NOT NULL,
                  content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS patch_records (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  repo_sha TEXT, status TEXT NOT NULL, risk TEXT, files_json TEXT NOT NULL,
                  created_at TEXT NOT NULL, applied_at TEXT, rolled_back_at TEXT, validation_json TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS validation_records (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  profile_id TEXT, repo_id TEXT, root TEXT, status TEXT, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS bookmarks (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  type TEXT NOT NULL, target TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL,
                  UNIQUE(project_id, type, target));
                CREATE TABLE IF NOT EXISTS recent_items (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  type TEXT NOT NULL, target TEXT NOT NULL, view TEXT, created_at TEXT NOT NULL,
                  UNIQUE(project_id, type, target));
                CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS workspace_session (
                  id INTEGER PRIMARY KEY CHECK(id=1), project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
                  repo_sha TEXT, active_view TEXT, selected_file TEXT, selected_symbol TEXT,
                  source_start INTEGER, source_end INTEGER, graph_mode TEXT, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS activity (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  type TEXT NOT NULL, label TEXT NOT NULL, reference_id TEXT, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS saved_plans (
                  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                  repo_sha TEXT, scope TEXT, risk TEXT, steps_json TEXT NOT NULL, created_at TEXT NOT NULL);
            """)
            version = 1
        if version < 2:
            _statements(connection, """
                CREATE INDEX IF NOT EXISTS ix_projects_repo ON projects(saved_repository_id, archived);
                CREATE INDEX IF NOT EXISTS ix_analysis_project ON analysis_snapshots(project_id, analysis_type, created_at DESC);
                CREATE INDEX IF NOT EXISTS ix_docs_project ON generated_documents(project_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS ix_activity_project ON activity(project_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS ix_recent_project ON recent_items(project_id, created_at DESC);
            """)
            version = 2
        if version < 3:
            _statements(connection, """
                CREATE TABLE IF NOT EXISTS jobs (
                  id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL,
                  progress INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
                  repo_url TEXT NOT NULL, result_project_id TEXT,
                  created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT);
                CREATE INDEX IF NOT EXISTS ix_jobs_created ON jobs(created_at DESC);
            """)
            version = 3
        connection.execute("DELETE FROM schema_version")
        connection.execute("INSERT INTO schema_version(version) VALUES (?)", (version,))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
