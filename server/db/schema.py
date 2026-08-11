"""Schema and migrations.

Migrations run on startup, every startup. The extension can update while a
user's database sits at an older schema - that is the normal case, not an edge
case, because nothing coordinates the two.

Each migration is append-only and numbered. `PRAGMA user_version` records how
far a file has got; a file at version N runs everything after N and nothing
else. Editing an existing migration would leave already-migrated databases
inconsistent with new ones, so changes go on the end.
"""

from __future__ import annotations

import sqlite3
from typing import Callable, List, Tuple

Migration = Tuple[int, str]

MIGRATIONS: List[Migration] = [
    (
        1,
        """
        CREATE TABLE documents (
            id           INTEGER PRIMARY KEY,
            workspace    TEXT NOT NULL,
            source_path  TEXT NOT NULL,
            title        TEXT,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            UNIQUE (workspace, source_path)
        );

        CREATE TABLE versions (
            id            INTEGER PRIMARY KEY,
            document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            content_hash  TEXT NOT NULL,
            pdf_path      TEXT NOT NULL,
            diagram_count INTEGER NOT NULL DEFAULT 0,
            warnings      TEXT NOT NULL DEFAULT '[]',
            created_at    TEXT NOT NULL
        );

        CREATE INDEX idx_versions_document ON versions(document_id, created_at DESC);

        CREATE TABLE exceptions (
            id          INTEGER PRIMARY KEY,
            workspace   TEXT NOT NULL,
            source_path TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            UNIQUE (workspace, source_path)
        );

        CREATE TABLE settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """,
    ),
]


def connect(path: str) -> sqlite3.Connection:
    """Open the database with the pragmas this design depends on."""
    connection = sqlite3.connect(path, timeout=10.0, isolation_level=None)
    connection.row_factory = sqlite3.Row

    # Two VS Code windows means two backend processes on one file. WAL lets a
    # reader and a writer coexist instead of one blocking the other; without it
    # the second window sees SQLITE_BUSY under perfectly ordinary use.
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA busy_timeout=5000")
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def migrate(connection: sqlite3.Connection, log: Callable[[str], None] | None = None) -> int:
    """Bring a database up to the latest schema. Returns the version reached."""
    current = connection.execute("PRAGMA user_version").fetchone()[0]

    for version, statements in MIGRATIONS:
        if version <= current:
            continue
        if log:
            log(f"applying migration {version}")
        connection.executescript(statements)
        # PRAGMA does not take a bound parameter, and version is an int from
        # this module's own table rather than anything a caller supplies.
        connection.execute(f"PRAGMA user_version={version}")
        current = version

    return current


LATEST_VERSION = MIGRATIONS[-1][0]
