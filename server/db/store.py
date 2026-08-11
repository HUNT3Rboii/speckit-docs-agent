"""Queries over the local database.

The store owns every statement; nothing else in the backend writes SQL. Callers
work in terms of documents and versions, which is also what the RPC surface
exposes.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional

from .schema import connect, migrate


def content_hash(markdown: str) -> str:
    """Identify a document by content, not by mtime.

    Touching a file, or a checkout that rewrites every timestamp, must not count
    as a change - rebuilding produces a byte-identical PDF and costs the user a
    wait for nothing.
    """
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Version:
    id: int
    content_hash: str
    pdf_path: str
    diagram_count: int
    warnings: List[str]
    created_at: str


@dataclass
class Document:
    id: int
    workspace: str
    source_path: str
    title: Optional[str]
    updated_at: str


class Store:
    def __init__(self, database_path: Path, log: Callable[[str], None] | None = None) -> None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = connect(str(database_path))
        self.schema_version = migrate(self._connection, log)

    def close(self) -> None:
        self._connection.close()

    # -- documents ------------------------------------------------------------

    def upsert_document(self, workspace: str, source_path: str, title: Optional[str]) -> Document:
        now = _now()
        self._connection.execute(
            """
            INSERT INTO documents (workspace, source_path, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (workspace, source_path)
            DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
            """,
            (workspace, source_path, title, now, now),
        )
        row = self._connection.execute(
            "SELECT * FROM documents WHERE workspace = ? AND source_path = ?",
            (workspace, source_path),
        ).fetchone()
        return _document(row)

    def list_documents(self, workspace: str) -> List[Document]:
        rows = self._connection.execute(
            "SELECT * FROM documents WHERE workspace = ? ORDER BY updated_at DESC",
            (workspace,),
        ).fetchall()
        return [_document(row) for row in rows]

    # -- versions -------------------------------------------------------------

    def record_version(
        self,
        document_id: int,
        *,
        hash_value: str,
        pdf_path: str,
        diagram_count: int,
        warnings: List[str],
    ) -> Version:
        cursor = self._connection.execute(
            """
            INSERT INTO versions (document_id, content_hash, pdf_path, diagram_count, warnings, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (document_id, hash_value, pdf_path, diagram_count, json.dumps(warnings), _now()),
        )
        row = self._connection.execute("SELECT * FROM versions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return _version(row)

    def latest_version(self, document_id: int) -> Optional[Version]:
        row = self._connection.execute(
            "SELECT * FROM versions WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
            (document_id,),
        ).fetchone()
        return _version(row) if row else None

    def versions(self, document_id: int, limit: int = 20) -> List[Version]:
        rows = self._connection.execute(
            "SELECT * FROM versions WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
            (document_id, limit),
        ).fetchall()
        return [_version(row) for row in rows]

    def unchanged_since_last_build(self, document_id: int, hash_value: str) -> Optional[Version]:
        """The previous build of identical content, if its PDF is still there.

        A recorded version whose file has been deleted is not a reason to skip
        the work - the user asked for a PDF and there isn't one.
        """
        latest = self.latest_version(document_id)
        if latest and latest.content_hash == hash_value and Path(latest.pdf_path).exists():
            return latest
        return None

    # -- exceptions -----------------------------------------------------------

    def add_exception(self, workspace: str, source_path: str) -> None:
        self._connection.execute(
            """
            INSERT INTO exceptions (workspace, source_path, created_at) VALUES (?, ?, ?)
            ON CONFLICT (workspace, source_path) DO NOTHING
            """,
            (workspace, source_path, _now()),
        )

    def remove_exception(self, workspace: str, source_path: str) -> None:
        self._connection.execute(
            "DELETE FROM exceptions WHERE workspace = ? AND source_path = ?",
            (workspace, source_path),
        )

    def exceptions(self, workspace: str) -> List[str]:
        rows = self._connection.execute(
            "SELECT source_path FROM exceptions WHERE workspace = ? ORDER BY source_path",
            (workspace,),
        ).fetchall()
        return [row["source_path"] for row in rows]

    def is_excepted(self, workspace: str, source_path: str) -> bool:
        row = self._connection.execute(
            "SELECT 1 FROM exceptions WHERE workspace = ? AND source_path = ?",
            (workspace, source_path),
        ).fetchone()
        return row is not None

    # -- settings -------------------------------------------------------------

    def set_setting(self, key: str, value: str) -> None:
        self._connection.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
            (key, value),
        )

    def get_setting(self, key: str, default: Optional[str] = None) -> Optional[str]:
        row = self._connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def _document(row: sqlite3.Row) -> Document:
    return Document(
        id=row["id"],
        workspace=row["workspace"],
        source_path=row["source_path"],
        title=row["title"],
        updated_at=row["updated_at"],
    )


def _version(row: sqlite3.Row) -> Version:
    return Version(
        id=row["id"],
        content_hash=row["content_hash"],
        pdf_path=row["pdf_path"],
        diagram_count=row["diagram_count"],
        warnings=json.loads(row["warnings"]),
        created_at=row["created_at"],
    )
