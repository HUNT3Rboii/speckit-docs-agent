from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    psycopg2 = None
    RealDictCursor = None


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
                        created_at TIMESTAMP DEFAULT NOW(),
                        updated_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(project_id, source_path)
                    )
                    """
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
                conn.commit()

    def create_project(self, name: str, repo_url: Optional[str] = None) -> Dict[str, Any]:
        """Create a new project."""
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM projects")
                count = cursor.fetchone()["count"]
                project_id = f"proj-{count + 1}"
                
                cursor.execute(
                    "INSERT INTO projects (id, name, repo_url) VALUES (%s, %s, %s) RETURNING id, name, repo_url",
                    (project_id, name, repo_url),
                )
                result = cursor.fetchone()
                conn.commit()
                return dict(result)

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
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata
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
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata 
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
                    SELECT id, project_id, source_path, source_tool, artifact_type, status, content_hash, metadata
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
        }
