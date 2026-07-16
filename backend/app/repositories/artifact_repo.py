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
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def create_project(self, name: str, repo_url: Optional[str] = None) -> Dict[str, Any]:
        project_id = f"proj-{self._next_id('projects')}"
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO projects (id, name, repo_url) VALUES (?, ?, ?)",
                (project_id, name, repo_url),
            )
            connection.commit()
        return {"id": project_id, "name": name, "repo_url": repo_url}

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

    def _next_id(self, table_name: str) -> int:
        with self._connect() as connection:
            row = connection.execute(f"SELECT COUNT(*) as count FROM {table_name}").fetchone()
        return int(row["count"]) + 1

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
