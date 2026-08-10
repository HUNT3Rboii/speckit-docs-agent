from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# Tooling/config directories no project ever wants converted to PDFs -
# excluded by default for every new project (server-side, so it applies
# regardless of any given client's own exclude-pattern config). The user
# can still remove any of these via the Exceptions tab; removal is
# permanent since this only ever runs once, at project creation.
DEFAULT_EXCLUDED_PATHS = (".specify/templates", ".github", ".claude")


class ArtifactRepository:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.getenv("DOC_AGENT_DB_PATH") or os.path.join(os.getcwd(), "doc_agent.sqlite3")
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    repo_url TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS artifacts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    source_tool TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    content_hash TEXT NOT NULL,
                    metadata TEXT
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS doc_versions (
                    id TEXT PRIMARY KEY,
                    artifact_id TEXT NOT NULL,
                    version_no INTEGER NOT NULL,
                    pdf_path TEXT NOT NULL,
                    structured_json TEXT NOT NULL,
                    generated_by TEXT NOT NULL,
                    generated_at TEXT NOT NULL
                )
                """
            )
            # Server-side exclusion list: a source_path (exact file) or
            # folder prefix (e.g. ".specify/templates") that should never be
            # processed into a PDF. Enforced here rather than client-side in
            # the VS Code extension's file watcher, since that requires a
            # repackage+reinstall+reload for every change and proved
            # unreliable in practice; a backend check applies immediately to
            # every caller with no extension changes needed.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS excluded_paths (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(project_id, source_path)
                )
                """
            )
            # Sequence counters for atomic id generation - see
            # _next_sequence_value for why plain "COUNT(*) + 1" isn't safe
            # under concurrent writers.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS id_sequences (
                    name TEXT PRIMARY KEY,
                    value INTEGER NOT NULL
                )
                """
            )
            # One row per task parsed out of a tasks.md-classified artifact
            # (see tasks_parser.py), backing the Kanban board. Synced from
            # the file on every successful (re)render - see
            # AgenticPipelineService's _sync_kanban_tasks - so board_status
            # is the only field that survives a resync untouched (unless
            # the task's own checkbox newly flips to done); everything else
            # is always overwritten from the file's current content.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS kanban_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    artifact_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    task_key TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    phase_order INTEGER NOT NULL,
                    parallel INTEGER NOT NULL DEFAULT 0,
                    story TEXT,
                    description TEXT NOT NULL,
                    checkbox_done INTEGER NOT NULL DEFAULT 0,
                    board_status TEXT NOT NULL DEFAULT 'todo',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(artifact_id, task_key)
                )
                """
            )
            # Inventory of every markdown file that exists in the project's
            # working tree, pushed by the VS Code extension (the backend has
            # no filesystem visibility into the caller's workspace - see
            # ProcessRequest.project_root). Backs the Context Files page,
            # which lists files that have NOT been turned into a PDF yet and
            # therefore have no artifacts row to be listed from.
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS project_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL DEFAULT 0,
                    modified_at TEXT,
                    transform_requested INTEGER NOT NULL DEFAULT 0,
                    requested_at TEXT,
                    last_seen_at TEXT NOT NULL,
                    UNIQUE(project_id, source_path)
                )
                """
            )
            connection.commit()

            # Migration: an existing database created before tagging was
            # added won't have this column yet - CREATE TABLE IF NOT EXISTS
            # above is a no-op against an already-existing artifacts table,
            # so it has to be added explicitly. SQLite has no
            # "ADD COLUMN IF NOT EXISTS", so check first; safe to run every
            # startup since it's a no-op once the column exists.
            existing_columns = {row[1] for row in cursor.execute("PRAGMA table_info(artifacts)").fetchall()}
            if "tags" not in existing_columns:
                cursor.execute("ALTER TABLE artifacts ADD COLUMN tags TEXT")
                connection.commit()

            # Same migration shape for per-project automatic/manual
            # transformation. Defaults to "automatic" so every pre-existing
            # project keeps behaving exactly as it did before the setting
            # existed.
            existing_project_columns = {row[1] for row in cursor.execute("PRAGMA table_info(projects)").fetchall()}
            if "automation_mode" not in existing_project_columns:
                cursor.execute(
                    "ALTER TABLE projects ADD COLUMN automation_mode TEXT NOT NULL DEFAULT 'automatic'"
                )
                connection.commit()

            # Enforce one project per name so two concurrent create_project()
            # calls for the same name can't both succeed. Best-effort: an
            # existing database that already has duplicate names (e.g. an
            # older dev DB predating this fix) can't have the index created
            # retroactively without a manual dedupe - don't crash startup for
            # that, just leave that specific database unprotected until
            # someone cleans it up. Fresh databases always get full protection.
            try:
                cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_name ON projects(name)")
                connection.commit()
            except sqlite3.IntegrityError:
                connection.rollback()

            self._seed_sequence_if_missing(connection, "projects", "projects", 5)
            self._seed_sequence_if_missing(connection, "artifacts", "artifacts", 9)

    def _seed_sequence_if_missing(self, connection: sqlite3.Connection, sequence_name: str, table: str, prefix_len: int) -> None:
        """Initialize id_sequences[sequence_name] from the current max numeric
        suffix in `table.id` (e.g. "proj-17" -> 17), so a database that
        already has rows doesn't start generating ids that collide with
        them. No-ops if already seeded."""
        cursor = connection.cursor()
        existing = cursor.execute("SELECT value FROM id_sequences WHERE name = ?", (sequence_name,)).fetchone()
        if existing is not None:
            return
        rows = cursor.execute(f"SELECT id FROM {table}").fetchall()
        max_n = 0
        for row in rows:
            # Positional index, not row["id"]: this runs against the raw
            # connection _init_db() opens (no row_factory set), not
            # self._connect()'s sqlite3.Row-configured one.
            suffix = row[0][prefix_len:]
            if suffix.isdigit():
                max_n = max(max_n, int(suffix))
        cursor.execute("INSERT INTO id_sequences (name, value) VALUES (?, ?)", (sequence_name, max_n))
        connection.commit()

    def _next_sequence_value(self, connection: sqlite3.Connection, sequence_name: str) -> int:
        """Atomically increment and return id_sequences[sequence_name].
        Caller must already hold a BEGIN IMMEDIATE write lock on `connection`
        so the read-increment-write below can't interleave with another
        connection's."""
        cursor = connection.cursor()
        cursor.execute("UPDATE id_sequences SET value = value + 1 WHERE name = ?", (sequence_name,))
        row = cursor.execute("SELECT value FROM id_sequences WHERE name = ?", (sequence_name,)).fetchone()
        return int(row["value"])

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def create_project(self, name: str, repo_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Get-or-create by name, race-safe: BEGIN IMMEDIATE takes SQLite's
        write lock before the id is generated, so two concurrent calls for
        the *same* name can't both proceed past the lock at once. If the
        name was already taken by the time this call gets the lock (a
        concurrent request that started slightly earlier already committed
        it, or the name pre-existed), the unique index raises
        IntegrityError, which just means "return the one that's already
        there" rather than an error.
        """
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            project_id = f"proj-{self._next_sequence_value(connection, 'projects')}"
            try:
                connection.execute(
                    "INSERT INTO projects (id, name, repo_url) VALUES (?, ?, ?)",
                    (project_id, name, repo_url),
                )
                now = datetime.now(timezone.utc).isoformat()
                for default_path in DEFAULT_EXCLUDED_PATHS:
                    connection.execute(
                        "INSERT OR IGNORE INTO excluded_paths (project_id, source_path, created_at) VALUES (?, ?, ?)",
                        (project_id, default_path, now),
                    )
                connection.commit()
                return {"id": project_id, "name": name, "repo_url": repo_url, "automation_mode": "automatic"}
            except sqlite3.IntegrityError:
                connection.rollback()
                row = connection.execute(
                    "SELECT id, name, repo_url, automation_mode FROM projects WHERE name = ?", (name,)
                ).fetchone()
                return self._row_to_project(row)
        finally:
            connection.close()

    @staticmethod
    def _row_to_project(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "repo_url": row["repo_url"],
            # Older rows written before the column existed read back as
            # NULL rather than the column default, so normalize here.
            "automation_mode": row["automation_mode"] or "automatic",
        }

    def next_artifact_id(self) -> str:
        """Atomically reserve and return the next global artifact id
        ("artifact-{n}"). See count_all_artifacts's docstring for why this
        must be global, not per-project; see create_project's docstring for
        why BEGIN IMMEDIATE is needed for the increment to be race-safe."""
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            next_id = self._next_sequence_value(connection, "artifacts")
            connection.commit()
            return f"artifact-{next_id}"
        finally:
            connection.close()

    def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, name, repo_url, automation_mode FROM projects WHERE id = ?", (project_id,)
            ).fetchone()
        if row is None:
            return None
        return self._row_to_project(row)

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, name, repo_url, automation_mode FROM projects ORDER BY id"
            ).fetchall()
        return [self._row_to_project(row) for row in rows]

    def set_project_automation_mode(self, project_id: str, mode: str) -> Optional[Dict[str, Any]]:
        """Switch a project between "automatic" (the file watcher processes
        every save) and "manual" (nothing is processed until it's asked for
        explicitly from the Context Files page). Returns the updated project,
        or None if it doesn't exist."""
        with self._connect() as connection:
            connection.execute(
                "UPDATE projects SET automation_mode = ? WHERE id = ?",
                (mode, project_id),
            )
            connection.commit()
        return self.get_project(project_id)

    def upsert_artifact(self, artifact: Dict[str, Any]) -> Dict[str, Any]:
        metadata = json.dumps(artifact.get("metadata") or {})
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO artifacts (id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    project_id=excluded.project_id,
                    source_path=excluded.source_path,
                    source_tool=excluded.source_tool,
                    artifact_type=excluded.artifact_type,
                    status=excluded.status,
                    content_hash=excluded.content_hash,
                    metadata=excluded.metadata
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
            connection.commit()
        return artifact

    def get_artifact_by_id(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags FROM artifacts WHERE id = ?",
                (artifact_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def get_artifact_by_path(self, project_id: str, source_path: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags FROM artifacts WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def list_artifacts(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata, tags FROM artifacts WHERE project_id = ? ORDER BY id",
                (project_id,),
            ).fetchall()
        return [self._row_to_artifact(row) for row in rows]

    def count_all_artifacts(self) -> int:
        """Global artifact count, across all projects. `id` is a table-wide
        primary key, not scoped per project, so callers generating a new
        artifact id must count globally - counting per-project (as
        list_artifacts() does) causes every project's first artifact to
        collide on the same id ("artifact-1"), silently overwriting
        whichever project got there first."""
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) as count FROM artifacts").fetchone()
        return int(row["count"])

    def add_doc_version(self, artifact_id: str, version: Dict[str, Any]) -> Dict[str, Any]:
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO doc_versions (id, artifact_id, version_no, pdf_path, structured_json, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
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
            connection.commit()
        return version

    def list_versions(self, artifact_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, artifact_id, version_no, pdf_path, structured_json, generated_by, generated_at FROM doc_versions WHERE artifact_id = ? ORDER BY version_no",
                (artifact_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "artifact_id": row["artifact_id"],
                "version_no": row["version_no"],
                "pdf_path": row["pdf_path"],
                "structured_json": json.loads(row["structured_json"]),
                "generated_by": row["generated_by"],
                "generated_at": row["generated_at"],
            }
            for row in rows
        ]

    def list_exceptions(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, project_id, source_path, created_at FROM excluded_paths WHERE project_id = ? ORDER BY source_path",
                (project_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def add_exception(self, project_id: str, source_path: str, created_at: str) -> Dict[str, Any]:
        with self._connect() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO excluded_paths (project_id, source_path, created_at) VALUES (?, ?, ?)",
                (project_id, source_path, created_at),
            )
            connection.commit()
            row = connection.execute(
                "SELECT id, project_id, source_path, created_at FROM excluded_paths WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            ).fetchone()
        return dict(row)

    def remove_exception(self, project_id: str, exception_id: int) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM excluded_paths WHERE id = ? AND project_id = ?",
                (exception_id, project_id),
            )
            connection.commit()

    _PROJECT_FILE_COLUMNS = (
        "id, project_id, source_path, size_bytes, modified_at, "
        "transform_requested, requested_at, last_seen_at"
    )

    @staticmethod
    def _row_to_project_file(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "source_path": row["source_path"],
            "size_bytes": row["size_bytes"],
            "modified_at": row["modified_at"],
            "transform_requested": bool(row["transform_requested"]),
            "requested_at": row["requested_at"],
            "last_seen_at": row["last_seen_at"],
        }

    def sync_project_files(self, project_id: str, files: List[Dict[str, Any]], now: str) -> int:
        """Replace the project's markdown inventory with what the client
        just found on disk. Files that disappeared are deleted rather than
        kept as tombstones - a pending transform request for a file that no
        longer exists is meaningless, and letting it linger would have the
        extension keep trying to read a missing path forever. Returns the
        number of files now tracked."""
        with self._connect() as connection:
            for entry in files:
                connection.execute(
                    """
                    INSERT INTO project_files
                        (project_id, source_path, size_bytes, modified_at, last_seen_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(project_id, source_path) DO UPDATE SET
                        size_bytes=excluded.size_bytes,
                        modified_at=excluded.modified_at,
                        last_seen_at=excluded.last_seen_at
                    """,
                    (
                        project_id,
                        entry["source_path"],
                        int(entry.get("size_bytes") or 0),
                        entry.get("modified_at"),
                        now,
                    ),
                )
            connection.execute(
                "DELETE FROM project_files WHERE project_id = ? AND last_seen_at != ?",
                (project_id, now),
            )
            connection.commit()
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM project_files WHERE project_id = ?",
                (project_id,),
            ).fetchone()
        return int(row["total"])

    def list_project_files(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT {self._PROJECT_FILE_COLUMNS} FROM project_files "
                "WHERE project_id = ? ORDER BY source_path",
                (project_id,),
            ).fetchall()
        return [self._row_to_project_file(row) for row in rows]

    def request_file_transform(self, project_id: str, source_path: str, now: str) -> Optional[Dict[str, Any]]:
        """Queue a known-on-disk markdown file for a one-off run through the
        pipeline. Returns the updated row, or None if the file isn't in the
        project's inventory (never synced, or deleted since)."""
        with self._connect() as connection:
            connection.execute(
                "UPDATE project_files SET transform_requested = 1, requested_at = ? "
                "WHERE project_id = ? AND source_path = ?",
                (now, project_id, source_path),
            )
            connection.commit()
            row = connection.execute(
                f"SELECT {self._PROJECT_FILE_COLUMNS} FROM project_files "
                "WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            ).fetchone()
        return self._row_to_project_file(row) if row is not None else None

    def list_file_transform_requests(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT {self._PROJECT_FILE_COLUMNS} FROM project_files "
                "WHERE project_id = ? AND transform_requested = 1 ORDER BY requested_at",
                (project_id,),
            ).fetchall()
        return [self._row_to_project_file(row) for row in rows]

    def clear_file_transform_request(self, project_id: str, source_path: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE project_files SET transform_requested = 0, requested_at = NULL "
                "WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            )
            connection.commit()

    _KANBAN_TASK_COLUMNS = (
        "id, project_id, artifact_id, source_path, task_key, phase, phase_order, "
        "parallel, story, description, checkbox_done, board_status, created_at, updated_at"
    )

    def list_kanban_tasks(self, project_id: str) -> List[Dict[str, Any]]:
        """All Kanban tasks for a project, across every tasks.md-classified
        artifact - the Board tab groups these into swimlanes by source_path
        client-side."""
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                "WHERE project_id = ? ORDER BY source_path, phase_order, task_key",
                (project_id,),
            ).fetchall()
        return [self._row_to_kanban_task(row) for row in rows]

    def list_kanban_tasks_for_artifact(self, artifact_id: str) -> List[Dict[str, Any]]:
        """Used by the sync logic to diff the current DB state against a
        freshly re-parsed tasks.md."""
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                "WHERE artifact_id = ? ORDER BY phase_order, task_key",
                (artifact_id,),
            ).fetchall()
        return [self._row_to_kanban_task(row) for row in rows]

    def get_kanban_task_by_key(
        self, project_id: str, source_path: str, task_key: str
    ) -> Optional[Dict[str, Any]]:
        """Looks up a task by its natural key (source_path, task_key) rather
        than our internal numeric id - used by the live progress-report
        endpoint, whose caller (an external agent working through tasks.md)
        only ever knows a task by that key, never our DB id."""
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks "
                "WHERE project_id = ? AND source_path = ? AND task_key = ?",
                (project_id, source_path, task_key),
            ).fetchone()
        return self._row_to_kanban_task(row) if row else None

    def upsert_kanban_task(self, task: Dict[str, Any], now: str) -> Dict[str, Any]:
        """Insert or update by (artifact_id, task_key). created_at is only
        ever set on first insert - the caller decides board_status (e.g.
        preserving it across a resync unless the file's own checkbox newly
        flipped to done), this just persists whatever it's given."""
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO kanban_tasks (
                    project_id, artifact_id, source_path, task_key, phase, phase_order,
                    parallel, story, description, checkbox_done, board_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(artifact_id, task_key) DO UPDATE SET
                    source_path = excluded.source_path,
                    phase = excluded.phase,
                    phase_order = excluded.phase_order,
                    parallel = excluded.parallel,
                    story = excluded.story,
                    description = excluded.description,
                    checkbox_done = excluded.checkbox_done,
                    board_status = excluded.board_status,
                    updated_at = excluded.updated_at
                """,
                (
                    task["project_id"],
                    task["artifact_id"],
                    task["source_path"],
                    task["task_key"],
                    task["phase"],
                    task["phase_order"],
                    int(task["parallel"]),
                    task.get("story"),
                    task["description"],
                    int(task["checkbox_done"]),
                    task["board_status"],
                    now,
                    now,
                ),
            )
            connection.commit()
            row = connection.execute(
                f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks WHERE artifact_id = ? AND task_key = ?",
                (task["artifact_id"], task["task_key"]),
            ).fetchone()
        return self._row_to_kanban_task(row)

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
        set_clauses = ["board_status = ?", "updated_at = ?"]
        params: List[Any] = [board_status, now]
        if phase is not None:
            set_clauses.append("phase = ?")
            params.append(phase)
        if phase_order is not None:
            set_clauses.append("phase_order = ?")
            params.append(phase_order)
        params.append(task_id)

        with self._connect() as connection:
            connection.execute(
                f"UPDATE kanban_tasks SET {', '.join(set_clauses)} WHERE id = ?",
                tuple(params),
            )
            connection.commit()
            row = connection.execute(
                f"SELECT {self._KANBAN_TASK_COLUMNS} FROM kanban_tasks WHERE id = ?",
                (task_id,),
            ).fetchone()
        return self._row_to_kanban_task(row) if row else None

    def delete_kanban_task(self, task_id: int) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM kanban_tasks WHERE id = ?", (task_id,))
            connection.commit()

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
        metadata = json.loads(row["metadata"] or "{}")
        tags = json.loads(row["tags"] or "[]")
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "source_path": row["source_path"],
            "source_tool": row["source_tool"],
            "artifact_type": row["artifact_type"],
            "status": row["status"],
            "content_hash": row["content_hash"],
            "metadata": metadata,
            "tags": tags,
        }

    def set_metadata_flag(self, artifact_id: str, key: str, value: Any) -> Optional[Dict[str, Any]]:
        """Read-modify-write a single key into an artifact's metadata JSON
        blob, leaving every other key untouched. Used for one-shot signal
        flags (cancel_requested, manual_retry_requested) set by a caller
        that only knows the artifact_id, not the rest of its metadata -
        unlike upsert_artifact() (which replaces metadata wholesale and is
        only ever called by the pipeline itself, which already has the full
        picture), this must never require the caller to already know/resend
        unrelated metadata just to flip one flag. Returns the updated
        artifact, or None if it doesn't exist."""
        with self._connect() as connection:
            row = connection.execute(
                "SELECT metadata FROM artifacts WHERE id = ?", (artifact_id,)
            ).fetchone()
            if row is None:
                return None
            metadata = json.loads(row["metadata"] or "{}")
            metadata[key] = value
            connection.execute(
                "UPDATE artifacts SET metadata = ? WHERE id = ?",
                (json.dumps(metadata), artifact_id),
            )
            connection.commit()
        return self.get_artifact_by_id(artifact_id)

    def set_artifact_tags(self, artifact_id: str, tags: List[str]) -> Optional[List[str]]:
        """Replace an artifact's full tag list. Tags live in their own
        column specifically so upsert_artifact() (called every time the
        source file is re-processed) can never touch - let alone wipe out -
        tags the user added, since it doesn't reference this column at all.
        Returns the normalized tag list, or None if the artifact doesn't
        exist."""
        normalized = sorted({t.strip() for t in tags if t.strip()})
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE artifacts SET tags = ? WHERE id = ?",
                (json.dumps(normalized), artifact_id),
            )
            connection.commit()
            if cursor.rowcount == 0:
                return None
        return normalized
