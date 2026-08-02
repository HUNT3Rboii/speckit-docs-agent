from __future__ import annotations

import json
import os
import sqlite3
from typing import Any, Dict, List, Optional


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
                connection.commit()
                return {"id": project_id, "name": name, "repo_url": repo_url}
            except sqlite3.IntegrityError:
                connection.rollback()
                row = connection.execute(
                    "SELECT id, name, repo_url FROM projects WHERE name = ?", (name,)
                ).fetchone()
                return {"id": row["id"], "name": row["name"], "repo_url": row["repo_url"]}
        finally:
            connection.close()

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
            row = connection.execute("SELECT id, name, repo_url FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            return None
        return {"id": row["id"], "name": row["name"], "repo_url": row["repo_url"]}

    def list_projects(self) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute("SELECT id, name, repo_url FROM projects ORDER BY id").fetchall()
        return [{"id": row["id"], "name": row["name"], "repo_url": row["repo_url"]} for row in rows]

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
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata FROM artifacts WHERE id = ?",
                (artifact_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def get_artifact_by_path(self, project_id: str, source_path: str) -> Optional[Dict[str, Any]]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata FROM artifacts WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_artifact(row)

    def list_artifacts(self, project_id: str) -> List[Dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata FROM artifacts WHERE project_id = ? ORDER BY id",
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

    def _row_to_artifact(self, row: Any) -> Dict[str, Any]:
        metadata = json.loads(row["metadata"] or "{}")
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "source_path": row["source_path"],
            "source_tool": row["source_tool"],
            "artifact_type": row["artifact_type"],
            "status": row["status"],
            "content_hash": row["content_hash"],
            "metadata": metadata,
        }
