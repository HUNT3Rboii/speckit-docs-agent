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
    (
        2,
        # The full model the HTTP backend carried: projects own artifacts,
        # artifacts own versions, and the board and file inventory hang off the
        # project. Migration 1's flat documents table was the subset needed to
        # prove the pipeline; this restores the rest of it.
        #
        # Existing rows are carried across rather than dropped: one project per
        # workspace, one artifact per document.
        """
        CREATE TABLE projects (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            repo_url        TEXT,
            automation_mode TEXT NOT NULL DEFAULT 'automatic'
                            CHECK (automation_mode IN ('automatic', 'manual')),
            created_at      TEXT NOT NULL
        );

        CREATE TABLE artifacts (
            id            TEXT PRIMARY KEY,
            project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_path   TEXT NOT NULL,
            artifact_type TEXT NOT NULL DEFAULT 'other'
                          CHECK (artifact_type IN ('spec', 'plan', 'task', 'constitution', 'other')),
            title         TEXT,
            status        TEXT NOT NULL DEFAULT 'pending',
            content_hash  TEXT NOT NULL DEFAULT '',
            tags          TEXT NOT NULL DEFAULT '[]',
            metadata      TEXT NOT NULL DEFAULT '{}',
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            UNIQUE (project_id, source_path)
        );

        CREATE INDEX idx_artifacts_project ON artifacts(project_id, created_at DESC);

        CREATE TABLE artifact_versions (
            id              TEXT PRIMARY KEY,
            artifact_id     TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
            version_no      INTEGER NOT NULL,
            pdf_path        TEXT NOT NULL,
            structured_json TEXT NOT NULL DEFAULT '{}',
            generated_by    TEXT NOT NULL DEFAULT 'speckit',
            diagram_count   INTEGER NOT NULL DEFAULT 0,
            warnings        TEXT NOT NULL DEFAULT '[]',
            generated_at    TEXT NOT NULL,
            UNIQUE (artifact_id, version_no)
        );

        CREATE TABLE project_files (
            id                  INTEGER PRIMARY KEY,
            project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_path         TEXT NOT NULL,
            size_bytes          INTEGER NOT NULL DEFAULT 0,
            modified_at         TEXT,
            transform_requested INTEGER NOT NULL DEFAULT 0,
            requested_at        TEXT,
            last_seen_at        TEXT NOT NULL,
            UNIQUE (project_id, source_path)
        );

        CREATE TABLE kanban_tasks (
            id            INTEGER PRIMARY KEY,
            project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            artifact_id   TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
            source_path   TEXT NOT NULL,
            task_key      TEXT NOT NULL,
            phase         TEXT NOT NULL DEFAULT '',
            phase_order   INTEGER NOT NULL DEFAULT 0,
            parallel      INTEGER NOT NULL DEFAULT 0,
            story         TEXT,
            description   TEXT NOT NULL DEFAULT '',
            checkbox_done INTEGER NOT NULL DEFAULT 0,
            board_status  TEXT NOT NULL DEFAULT 'todo'
                          CHECK (board_status IN ('todo', 'in_progress', 'done')),
            created_at    TEXT NOT NULL,
            updated_at    TEXT NOT NULL,
            UNIQUE (project_id, task_key)
        );

        CREATE TABLE project_exceptions (
            id          INTEGER PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_path TEXT NOT NULL,
            created_at  TEXT NOT NULL,
            UNIQUE (project_id, source_path)
        );

        INSERT INTO projects (id, name, repo_url, automation_mode, created_at)
        SELECT DISTINCT workspace,
               workspace,
               NULL,
               'automatic',
               COALESCE(MIN(created_at), datetime('now'))
        FROM documents
        GROUP BY workspace;

        INSERT INTO artifacts (id, project_id, source_path, artifact_type, title, status,
                               content_hash, tags, metadata, created_at, updated_at)
        SELECT 'doc-' || d.id, d.workspace, d.source_path, 'other', d.title, 'complete',
               COALESCE((SELECT v.content_hash FROM versions v
                         WHERE v.document_id = d.id ORDER BY v.id DESC LIMIT 1), ''),
               '[]', '{}', d.created_at, d.updated_at
        FROM documents d;

        INSERT INTO artifact_versions (id, artifact_id, version_no, pdf_path, structured_json,
                                       generated_by, diagram_count, warnings, generated_at)
        SELECT 'ver-' || v.id,
               'doc-' || v.document_id,
               (SELECT COUNT(*) FROM versions earlier
                WHERE earlier.document_id = v.document_id AND earlier.id <= v.id),
               v.pdf_path, '{}', 'speckit', v.diagram_count, v.warnings, v.created_at
        FROM versions v;

        INSERT INTO project_exceptions (project_id, source_path, created_at)
        SELECT workspace, source_path, created_at FROM exceptions;

        DROP TABLE versions;
        DROP TABLE exceptions;
        DROP TABLE documents;
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
