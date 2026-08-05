from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None

# Tooling/config directories no project ever wants converted to PDFs -
# excluded by default for every new project (server-side, so it applies
# regardless of any given client's own exclude-pattern config). The user
# can still remove any of these via the Exceptions tab; removal is
# permanent since this only ever runs once, at project creation.
DEFAULT_EXCLUDED_PATHS = (".specify/templates", ".github", ".claude")


class PostgresArtifactRepository:
    """PostgreSQL-based artifact repository for production use."""

    def __init__(self, connection_string: Optional[str] = None) -> None:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 is not installed. Install with: pip install psycopg2-binary")
        
        self.connection_string = connection_string or self._build_connection_string()
        self._init_db()

    def _build_connection_string(self) -> str:
        """Build PostgreSQL connection string from environment variables."""
        host = os.getenv("POSTGRES_HOST", "db")
        port = os.getenv("POSTGRES_PORT", "5432")
        database = os.getenv("POSTGRES_DB", "docsagent")
        user = os.getenv("POSTGRES_USER", "docsagent")
        password = os.getenv("POSTGRES_PASSWORD", "docsagent")
        
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"

    def _connect(self):
        """Create a new database connection."""
        conn = psycopg2.connect(self.connection_string)
        conn.cursor_factory = RealDictCursor
        return conn

    def _init_db(self) -> None:
        """Initialize database schema."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        repo_url TEXT,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS artifacts (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL REFERENCES projects(id),
                        source_path TEXT NOT NULL,
                        source_tool TEXT NOT NULL,
                        artifact_type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        content_hash TEXT NOT NULL,
                        metadata JSONB DEFAULT '{}'::jsonb,
                        tags TEXT[] NOT NULL DEFAULT '{}',
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(project_id, source_path)
                    )
                    """
                )
                # Migration: an existing database created before tagging was
                # added won't have this column yet - CREATE TABLE IF NOT
                # EXISTS above is a no-op against an already-existing
                # artifacts table. Unlike SQLite, Postgres supports
                # IF NOT EXISTS directly here, so no manual existence check
                # is needed.
                cursor.execute(
                    "ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'"
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS doc_versions (
                        id TEXT PRIMARY KEY,
                        artifact_id TEXT NOT NULL REFERENCES artifacts(id),
                        version_no INTEGER NOT NULL,
                        pdf_path TEXT NOT NULL,
                        structured_json JSONB NOT NULL,
                        generated_by TEXT NOT NULL,
                        generated_at TIMESTAMP NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(artifact_id, version_no)
                    )
                    """
                )
                # Server-side exclusion list: a source_path (exact file) or
                # folder prefix (e.g. ".specify/templates") that should
                # never be processed into a PDF. Enforced here rather than
                # client-side in the VS Code extension's file watcher,
                # since that requires a repackage+reinstall+reload for
                # every change and proved unreliable in practice; a backend
                # check applies immediately to every caller with no
                # extension changes needed.
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS excluded_paths (
                        id SERIAL PRIMARY KEY,
                        project_id TEXT NOT NULL REFERENCES projects(id),
                        source_path TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(project_id, source_path)
                    )
                    """
                )
                # One row per task parsed out of a tasks.md-classified
                # artifact (see tasks_parser.py), backing the Kanban board.
                # Synced from the file on every successful (re)render - see
                # AgenticPipelineService's _sync_kanban_tasks - so
                # board_status is the only field that survives a resync
                # untouched (unless the task's own checkbox newly flips to
                # done); everything else is always overwritten from the
                # file's current content.
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS kanban_tasks (
                        id SERIAL PRIMARY KEY,
                        project_id TEXT NOT NULL REFERENCES projects(id),
                        artifact_id TEXT NOT NULL REFERENCES artifacts(id),
                        source_path TEXT NOT NULL,
                        task_key TEXT NOT NULL,
                        phase TEXT NOT NULL,
                        phase_order INTEGER NOT NULL,
                        parallel BOOLEAN NOT NULL DEFAULT FALSE,
                        story TEXT,
                        description TEXT NOT NULL,
                        checkbox_done BOOLEAN NOT NULL DEFAULT FALSE,
                        board_status TEXT NOT NULL DEFAULT 'todo',
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        UNIQUE(artifact_id, task_key)
                    )
                    """
                )
                # Sequences for atomic id generation - see create_project's
                # docstring for why "SELECT COUNT(*) + 1" isn't safe under
                # concurrent writers.
                cursor.execute("CREATE SEQUENCE IF NOT EXISTS project_id_seq")
                cursor.execute("CREATE SEQUENCE IF NOT EXISTS artifact_id_seq")
                conn.commit()

                # Seed each sequence from the current max numeric suffix in
                # the corresponding table, so a database that already has
                # rows doesn't start generating ids that collide with them.
                # Gated on is_called (a sequence's own permanent "has
                # nextval() ever been called on this sequence" flag) so this
                # only ever runs once, before the sequence's first real use -
                # _init_db() runs on every repository construction (i.e.
                # every request, per get_repository()'s lazy pattern), and
                # re-running setval() against currently-committed rows on
                # every request would be actively unsafe once the sequence
                # is live: a concurrent request could have already reserved
                # a value via nextval() without committing yet, and a reseed
                # based on the not-yet-updated committed data would roll the
                # sequence backward and hand that same value out again -
                # reintroducing the exact race this migration exists to fix.
                cursor.execute(
                    r"""
                    DO $$
                    BEGIN
                        IF NOT (SELECT is_called FROM project_id_seq) THEN
                            PERFORM setval('project_id_seq',
                                (SELECT COALESCE(MAX(substring(id from '\d+$')::int), 0) FROM projects));
                        END IF;
                        IF NOT (SELECT is_called FROM artifact_id_seq) THEN
                            PERFORM setval('artifact_id_seq',
                                (SELECT COALESCE(MAX(substring(id from '\d+$')::int), 0) FROM artifacts));
                        END IF;
                    END $$;
                    """
                )
                conn.commit()

                # Enforce one project per name so two concurrent
                # create_project() calls for the same name can't both
                # succeed. Best-effort: an existing database that already
                # has duplicate names can't have this created retroactively
                # without a manual dedupe first - don't crash startup for
                # that, leave that database unprotected until cleaned up.
                self._has_unique_project_name = True
                try:
                    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name ON projects(name)")
                    conn.commit()
                except Exception:
                    conn.rollback()
                    self._has_unique_project_name = False

    def create_project(self, name: str, repo_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Get-or-create by name, race-safe: project_id_seq's nextval() is
        atomic in Postgres regardless of transaction boundaries, so two
        concurrent calls never get the same id. ON CONFLICT (name) DO
        NOTHING then means at most one of two concurrent calls for the same
        name actually inserts; the other gets no RETURNING row back and
        falls through to SELECT-ing the row the first call just committed,
        rather than either erroring or creating a duplicate.
        """
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT nextval('project_id_seq')")
                project_id = f"proj-{cursor.fetchone()['nextval']}"

                if getattr(self, "_has_unique_project_name", True):
                    cursor.execute(
                        """
                        INSERT INTO projects (id, name, repo_url) VALUES (%s, %s, %s)
                        ON CONFLICT (name) DO NOTHING
                        RETURNING id, name, repo_url
                        """,
                        (project_id, name, repo_url),
                    )
                    result = cursor.fetchone()
                    if result:
                        self._seed_default_exceptions(cursor, project_id)
                        conn.commit()
                        return dict(result)
                    # Another concurrent call already created this name -
                    # return that row instead.
                    conn.commit()
                    cursor.execute("SELECT id, name, repo_url FROM projects WHERE name = %s", (name,))
                    return dict(cursor.fetchone())

                # No unique constraint available on this (legacy/dirty)
                # database - fall back to the old unprotected insert.
                cursor.execute(
                    "INSERT INTO projects (id, name, repo_url) VALUES (%s, %s, %s) RETURNING id, name, repo_url",
                    (project_id, name, repo_url),
                )
                result = cursor.fetchone()
                self._seed_default_exceptions(cursor, project_id)
                conn.commit()
                return dict(result)

    def _seed_default_exceptions(self, cursor, project_id: str) -> None:
        """Seeds DEFAULT_EXCLUDED_PATHS for a brand-new project. Only ever
        called right after a genuinely new project row was inserted (never
        on the "get" branch of get-or-create), so this runs exactly once
        per project - any later removal via the Exceptions tab is
        permanent."""
        now = datetime.now(timezone.utc).isoformat()
        for default_path in DEFAULT_EXCLUDED_PATHS:
            cursor.execute(
                """
                INSERT INTO excluded_paths (project_id, source_path, created_at) VALUES (%s, %s, %s)
                ON CONFLICT (project_id, source_path) DO NOTHING
                """,
                (project_id, default_path, now),
            )

    def next_artifact_id(self) -> str:
        """Atomically reserve and return the next global artifact id
        ("artifact-{n}"). See count_all_artifacts's docstring for why this
        must be global, not per-project; see create_project's docstring for
        why nextval() is the race-safe way to generate it."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT nextval('artifact_id_seq')")
                return f"artifact-{cursor.fetchone()['nextval']}"

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get a project by ID."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id, name, repo_url FROM projects WHERE id = %s", (project_id,))
                result = cursor.fetchone()
                return dict(result) if result else None

    def list_projects(self) -> List[Dict[str, Any]]:
        """List all projects."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT id, name, repo_url FROM projects ORDER BY id")
                results = cursor.fetchall()
                return [dict(row) for row in results]

    def upsert_artifact(self, artifact: Dict[str, Any]) -> Dict[str, Any]:
        """Insert or update an artifact."""
        metadata = json.dumps(artifact.get("metadata") or {})
        
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO artifacts (id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        project_id = EXCLUDED.project_id,
                        source_path = EXCLUDED.source_path,
                        source_tool = EXCLUDED.source_tool,
                        artifact_type = EXCLUDED.artifact_type,
                        status = EXCLUDED.status,
                        content_hash = EXCLUDED.content_hash,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW()
                    RETURNING id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata
                    """,
                    (
                        artifact["id"],
                        artifact.get("project_id"),
                        artifact.get("source_path"),
                        artifact.get("source_tool"),
                        artifact.get("artifact_type"),
                        artifact.get("status"),
                        artifact.get("content_hash"),
                        metadata,
                    ),
                )
                result = cursor.fetchone()
                conn.commit()
                return self._row_to_artifact(result)

    def get_artifact_by_id(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        """Get an artifact by its ID."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags
                    FROM artifacts
                    WHERE id = %s
                    """,
                    (artifact_id,),
                )
                result = cursor.fetchone()
                return self._row_to_artifact(result) if result else None

    def get_artifact_by_path(self, project_id: str, source_path: str) -> Optional[Dict[str, Any]]:
        """Get an artifact by project ID and source path."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags
                    FROM artifacts 
                    WHERE project_id = %s AND source_path = %s
                    """,
                    (project_id, source_path),
                )
                result = cursor.fetchone()
                return self._row_to_artifact(result) if result else None

    def list_artifacts(self, project_id: str) -> List[Dict[str, Any]]:
        """List all artifacts for a project."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags
                    FROM artifacts
                    WHERE project_id = %s
                    ORDER BY id
                    """,
                    (project_id,),
                )
                results = cursor.fetchall()
                return [self._row_to_artifact(row) for row in results]

    def count_all_artifacts(self) -> int:
        """Global artifact count, across all projects. `id` is a table-wide
        primary key, not scoped per project, so callers generating a new
        artifact id must count globally - counting per-project (as
        list_artifacts() does) causes every project's first artifact to
        collide on the same id ("artifact-1"), silently overwriting
        whichever project got there first."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) as count FROM artifacts")
                return int(cursor.fetchone()["count"])

    def add_doc_version(self, artifact_id: str, version: Dict[str, Any]) -> Dict[str, Any]:
        """Add a new document version."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO doc_versions (id, artifact_id, version_no, pdf_path, structured_json, generated_by, generated_at)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                    RETURNING id, artifact_id, version_no, pdf_path, structured_json, generated_by, generated_at
                    """,
                    (
                        version["id"],
                        artifact_id,
                        version["version_no"],
                        version["pdf_path"],
                        json.dumps(version["structured_json"]),
                        version["generated_by"],
                        version["generated_at"],
                    ),
                )
                result = cursor.fetchone()
                conn.commit()
                return {
                    "id": result["id"],
                    "artifact_id": result["artifact_id"],
                    "version_no": result["version_no"],
                    "pdf_path": result["pdf_path"],
                    "structured_json": result["structured_json"],
                    "generated_by": result["generated_by"],
                    "generated_at": result["generated_at"],
                }

    def list_versions(self, artifact_id: str) -> List[Dict[str, Any]]:
        """List all versions for an artifact."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, artifact_id, version_no, pdf_path, structured_json, generated_by, generated_at 
                    FROM doc_versions 
                    WHERE artifact_id = %s 
                    ORDER BY version_no
                    """,
                    (artifact_id,),
                )
                results = cursor.fetchall()
                return [
                    {
                        "id": row["id"],
                        "artifact_id": row["artifact_id"],
                        "version_no": row["version_no"],
                        "pdf_path": row["pdf_path"],
                        "structured_json": row["structured_json"],
                        "generated_by": row["generated_by"],
                        "generated_at": row["generated_at"],
                    }
                    for row in results
                ]

    def list_exceptions(self, project_id: str) -> List[Dict[str, Any]]:
        """List all excluded paths for a project."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "SELECT id, project_id, source_path, created_at FROM excluded_paths WHERE project_id = %s ORDER BY source_path",
                    (project_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def add_exception(self, project_id: str, source_path: str, created_at: str) -> Dict[str, Any]:
        """Get-or-create by (project_id, source_path)."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO excluded_paths (project_id, source_path, created_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (project_id, source_path) DO NOTHING
                    """,
                    (project_id, source_path, created_at),
                )
                conn.commit()
                cursor.execute(
                    "SELECT id, project_id, source_path, created_at FROM excluded_paths WHERE project_id = %s AND source_path = %s",
                    (project_id, source_path),
                )
                return dict(cursor.fetchone())

    def remove_exception(self, project_id: str, exception_id: int) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM excluded_paths WHERE id = %s AND project_id = %s",
                    (exception_id, project_id),
                )
                conn.commit()

    _KANBAN_TASK_COLUMNS = (
        "id, project_id, artifact_id, source_path, task_key, phase, phase_order, "
        "parallel, story, description, checkbox_done, board_status, created_at, updated_at"
    )

    def list_kanban_tasks(self, project_id: str) -> List[Dict[str, Any]]:
        """All Kanban tasks for a project, across every tasks.md-classified
        artifact - the Board tab groups these into swimlanes by source_path
        client-side."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                    "WHERE project_id = %s ORDER BY source_path, phase_order, task_key",
                    (project_id,),
                )
                return [self._row_to_kanban_task(row) for row in cursor.fetchall()]

    def list_kanban_tasks_for_artifact(self, artifact_id: str) -> List[Dict[str, Any]]:
        """Used by the sync logic to diff the current DB state against a
        freshly re-parsed tasks.md."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                    "WHERE artifact_id = %s ORDER BY phase_order, task_key",
                    (artifact_id,),
                )
                return [self._row_to_kanban_task(row) for row in cursor.fetchall()]

    def get_kanban_task_by_key(
        self, project_id: str, source_path: str, task_key: str
    ) -> Optional[Dict[str, Any]]:
        """Looks up a task by its natural key (source_path, task_key) rather
        than our internal numeric id - used by the live progress-report
        endpoint, whose caller (an external agent working through tasks.md)
        only ever knows a task by that key, never our DB id."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                    "WHERE project_id = %s AND source_path = %s AND task_key = %s",
                    (project_id, source_path, task_key),
                )
                row = cursor.fetchone()
                return self._row_to_kanban_task(row) if row else None

    def upsert_kanban_task(self, task: Dict[str, Any], now: str) -> Dict[str, Any]:
        """Insert or update by (artifact_id, task_key). created_at is only
        ever set on first insert - the caller decides board_status (e.g.
        preserving it across a resync unless the file's own checkbox newly
        flipped to done), this just persists whatever it's given."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO kanban_tasks (
                        project_id, artifact_id, source_path, task_key, phase, phase_order,
                        parallel, story, description, checkbox_done, board_status, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (artifact_id, task_key) DO UPDATE SET
                        source_path = EXCLUDED.source_path,
                        phase = EXCLUDED.phase,
                        phase_order = EXCLUDED.phase_order,
                        parallel = EXCLUDED.parallel,
                        story = EXCLUDED.story,
                        description = EXCLUDED.description,
                        checkbox_done = EXCLUDED.checkbox_done,
                        board_status = EXCLUDED.board_status,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        task["project_id"],
                        task["artifact_id"],
                        task["source_path"],
                        task["task_key"],
                        task["phase"],
                        task["phase_order"],
                        bool(task["parallel"]),
                        task.get("story"),
                        task["description"],
                        bool(task["checkbox_done"]),
                        task["board_status"],
                        now,
                        now,
                    ),
                )
                conn.commit()
                cursor.execute(
                    f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks WHERE artifact_id = %s AND task_key = %s",
                    (task["artifact_id"], task["task_key"]),
                )
                return self._row_to_kanban_task(cursor.fetchone())

    def update_kanban_task_status(
        self,
        task_id: int,
        board_status: str,
        now: str,
        phase: Optional[str] = None,
        phase_order: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Move a card between columns and, optionally (when dragged into a
        different phase's board), between phase lanes too - phase/phase_order
        are only included in the UPDATE when the caller actually supplied
        them, so a plain same-phase column move never touches those columns."""
        set_clauses = ["board_status = %s", "updated_at = %s"]
        params: List[Any] = [board_status, now]
        if phase is not None:
            set_clauses.append("phase = %s")
            params.append(phase)
        if phase_order is not None:
            set_clauses.append("phase_order = %s")
            params.append(phase_order)
        params.append(task_id)

        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    f"UPDATE kanban_tasks SET {', '.join(set_clauses)} WHERE id = %s",
                    tuple(params),
                )
                conn.commit()
                cursor.execute(
                    f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks WHERE id = %s",
                    (task_id,),
                )
                row = cursor.fetchone()
                return self._row_to_kanban_task(row) if row else None

    def delete_kanban_task(self, task_id: int) -> None:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("DELETE FROM kanban_tasks WHERE id = %s", (task_id,))
                conn.commit()

    def _row_to_kanban_task(self, row: Any) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "artifact_id": row["artifact_id"],
            "source_path": row["source_path"],
            "task_key": row["task_key"],
            "phase": row["phase"],
            "phase_order": row["phase_order"],
            "parallel": bool(row["parallel"]),
            "story": row["story"],
            "description": row["description"],
            "checkbox_done": bool(row["checkbox_done"]),
            "board_status": row["board_status"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _row_to_artifact(self, row: Any) -> Dict[str, Any]:
        """Convert a database row to an artifact dictionary."""
        if row is None:
            return {}
        
        metadata = row.get("metadata")
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "source_path": row["source_path"],
            "source_tool": row["source_tool"],
            "artifact_type": row["artifact_type"],
            "status": row["status"],
            "content_hash": row["content_hash"],
            "metadata": metadata or {},
            "tags": list(row["tags"]) if row.get("tags") is not None else [],
        }

    def set_artifact_tags(self, artifact_id: str, tags: List[str]) -> Optional[List[str]]:
        """Replace an artifact's full tag list. Tags live in their own
        column specifically so upsert_artifact() (called every time the
        source file is re-processed) can never touch - let alone wipe out -
        tags the user added, since it doesn't reference this column at all.
        Returns the normalized tag list, or None if the artifact doesn't
        exist."""
        normalized = sorted({t.strip() for t in tags if t.strip()})
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    "UPDATE artifacts SET tags = %s WHERE id = %s RETURNING id",
                    (normalized, artifact_id),
                )
                result = cursor.fetchone()
                conn.commit()
                if result is None:
                    return None
        return normalized
