"""Queries over the local database.

The store owns every statement; nothing else in the backend writes SQL. It is
organised the way the old HTTP backend's repositories were - projects,
artifacts, versions, files, board, exceptions - because the dashboard being
ported speaks in exactly those terms.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .models import (
    Artifact,
    KanbanTask,
    ProcessingException,
    Project,
    ProjectFile,
    Version,
    artifact_from_row,
    exception_from_row,
    kanban_task_from_row,
    project_from_row,
    version_from_row,
)
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


def _identifier(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


class Store:
    def __init__(self, database_path: Path, log: Callable[[str], None] | None = None) -> None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = connect(str(database_path))
        self.schema_version = migrate(self._connection, log)

    def close(self) -> None:
        self._connection.close()

    # -- projects -------------------------------------------------------------

    def upsert_project(self, project_id: str, name: str, repo_url: Optional[str] = None) -> Project:
        self._connection.execute(
            """
            INSERT INTO projects (id, name, repo_url, automation_mode, created_at)
            VALUES (?, ?, ?, 'automatic', ?)
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, repo_url = excluded.repo_url
            """,
            (project_id, name, repo_url, _now()),
        )
        return self.project(project_id)  # type: ignore[return-value]

    def project(self, project_id: str) -> Optional[Project]:
        row = self._connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return project_from_row(row) if row else None

    def projects(self) -> List[Project]:
        rows = self._connection.execute("SELECT * FROM projects ORDER BY name").fetchall()
        return [project_from_row(row) for row in rows]

    def set_automation_mode(self, project_id: str, mode: str) -> Project:
        if mode not in ("automatic", "manual"):
            raise ValueError(f"automation_mode must be 'automatic' or 'manual', got {mode!r}")
        self._connection.execute("UPDATE projects SET automation_mode = ? WHERE id = ?", (mode, project_id))
        project = self.project(project_id)
        if not project:
            raise ValueError(f"No such project: {project_id}")
        return project

    # -- artifacts ------------------------------------------------------------

    def upsert_artifact(
        self,
        project_id: str,
        source_path: str,
        *,
        title: Optional[str] = None,
        artifact_type: Optional[str] = None,
        status: Optional[str] = None,
        content_hash_value: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Artifact:
        existing = self.artifact_by_path(project_id, source_path)
        now = _now()

        if existing is None:
            artifact_id = _identifier("art")
            self._connection.execute(
                """
                INSERT INTO artifacts (id, project_id, source_path, artifact_type, title, status,
                                       content_hash, tags, metadata, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
                """,
                (
                    artifact_id,
                    project_id,
                    source_path,
                    artifact_type or classify(source_path),
                    title,
                    status or "pending",
                    content_hash_value or "",
                    json.dumps(metadata or {}),
                    now,
                    now,
                ),
            )
            return self.artifact(artifact_id)  # type: ignore[return-value]

        merged = dict(existing.metadata)
        if metadata:
            merged.update(metadata)

        self._connection.execute(
            """
            UPDATE artifacts
               SET title = COALESCE(?, title),
                   artifact_type = COALESCE(?, artifact_type),
                   status = COALESCE(?, status),
                   content_hash = COALESCE(?, content_hash),
                   metadata = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            (title, artifact_type, status, content_hash_value, json.dumps(merged), now, existing.id),
        )
        return self.artifact(existing.id)  # type: ignore[return-value]

    def artifact(self, artifact_id: str) -> Optional[Artifact]:
        row = self._connection.execute("SELECT * FROM artifacts WHERE id = ?", (artifact_id,)).fetchone()
        return artifact_from_row(row) if row else None

    def artifact_by_path(self, project_id: str, source_path: str) -> Optional[Artifact]:
        row = self._connection.execute(
            "SELECT * FROM artifacts WHERE project_id = ? AND source_path = ?",
            (project_id, source_path),
        ).fetchone()
        return artifact_from_row(row) if row else None

    def artifacts(self, project_id: str) -> List[Artifact]:
        rows = self._connection.execute(
            "SELECT * FROM artifacts WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
        return [artifact_from_row(row) for row in rows]

    def set_status(self, artifact_id: str, status: str, metadata: Optional[Dict[str, Any]] = None) -> Artifact:
        artifact = self.artifact(artifact_id)
        if not artifact:
            raise ValueError(f"No such artifact: {artifact_id}")

        merged = dict(artifact.metadata)
        if metadata:
            merged.update(metadata)

        self._connection.execute(
            "UPDATE artifacts SET status = ?, metadata = ?, updated_at = ? WHERE id = ?",
            (status, json.dumps(merged), _now(), artifact_id),
        )
        return self.artifact(artifact_id)  # type: ignore[return-value]

    def set_tags(self, artifact_id: str, tags: List[str]) -> Artifact:
        # Order and duplicates are the caller's; storing them as given keeps the
        # UI's own ordering rather than imposing one it did not ask for.
        deduplicated: List[str] = []
        for tag in tags:
            cleaned = str(tag).strip()
            if cleaned and cleaned not in deduplicated:
                deduplicated.append(cleaned)

        self._connection.execute(
            "UPDATE artifacts SET tags = ?, updated_at = ? WHERE id = ?",
            (json.dumps(deduplicated), _now(), artifact_id),
        )
        artifact = self.artifact(artifact_id)
        if not artifact:
            raise ValueError(f"No such artifact: {artifact_id}")
        return artifact

    # -- versions -------------------------------------------------------------

    def record_version(
        self,
        artifact_id: str,
        *,
        pdf_path: str,
        structured_json: Optional[Dict[str, Any]] = None,
        generated_by: str = "speckit",
        diagram_count: int = 0,
        warnings: Optional[List[str]] = None,
    ) -> Version:
        row = self._connection.execute(
            "SELECT COALESCE(MAX(version_no), 0) AS highest FROM artifact_versions WHERE artifact_id = ?",
            (artifact_id,),
        ).fetchone()

        version_id = _identifier("ver")
        self._connection.execute(
            """
            INSERT INTO artifact_versions (id, artifact_id, version_no, pdf_path, structured_json,
                                           generated_by, diagram_count, warnings, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id,
                artifact_id,
                row["highest"] + 1,
                pdf_path,
                json.dumps(structured_json or {}),
                generated_by,
                diagram_count,
                json.dumps(warnings or []),
                _now(),
            ),
        )
        return self.version(version_id)  # type: ignore[return-value]

    def version(self, version_id: str) -> Optional[Version]:
        row = self._connection.execute(
            "SELECT * FROM artifact_versions WHERE id = ?", (version_id,)
        ).fetchone()
        return version_from_row(row) if row else None

    def versions(self, artifact_id: str) -> List[Version]:
        rows = self._connection.execute(
            "SELECT * FROM artifact_versions WHERE artifact_id = ? ORDER BY version_no DESC",
            (artifact_id,),
        ).fetchall()
        return [version_from_row(row) for row in rows]

    def latest_version(self, artifact_id: str) -> Optional[Version]:
        rows = self.versions(artifact_id)
        return rows[0] if rows else None

    def unchanged_since_last_build(self, artifact_id: str, hash_value: str) -> Optional[Version]:
        """The previous build of identical content, if its PDF is still there.

        A recorded version whose file has been deleted is not a reason to skip
        the work - the user asked for a PDF and there isn't one.
        """
        artifact = self.artifact(artifact_id)
        if not artifact or artifact.content_hash != hash_value:
            return None

        latest = self.latest_version(artifact_id)
        if latest and Path(latest.pdf_path).exists():
            return latest
        return None

    # -- project files --------------------------------------------------------

    def sync_files(self, project_id: str, files: List[Dict[str, Any]]) -> int:
        """Replace the project's file inventory with what the extension reports.

        The backend has no filesystem visibility of its own - it never did - so
        this list is the only way it knows a markdown file exists before that
        file has ever been converted. Files no longer reported are removed:
        they have been deleted or renamed, and a stale row is a row the Context
        Files page would offer to convert into nothing.
        """
        now = _now()
        seen: List[str] = []

        for entry in files:
            source_path = str(entry.get("source_path") or entry.get("sourcePath") or "").strip()
            if not source_path:
                continue
            seen.append(source_path)
            self._connection.execute(
                """
                INSERT INTO project_files (project_id, source_path, size_bytes, modified_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (project_id, source_path) DO UPDATE SET
                    size_bytes = excluded.size_bytes,
                    modified_at = excluded.modified_at,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    project_id,
                    source_path,
                    int(entry.get("size_bytes") or entry.get("sizeBytes") or 0),
                    entry.get("modified_at") or entry.get("modifiedAt"),
                    now,
                ),
            )

        if seen:
            placeholders = ",".join("?" for _ in seen)
            self._connection.execute(
                f"DELETE FROM project_files WHERE project_id = ? AND source_path NOT IN ({placeholders})",
                (project_id, *seen),
            )
        else:
            self._connection.execute("DELETE FROM project_files WHERE project_id = ?", (project_id,))

        return len(seen)

    def files(self, project_id: str) -> List[ProjectFile]:
        rows = self._connection.execute(
            """
            SELECT f.*,
                   a.id AS artifact_id,
                   a.status AS artifact_status,
                   EXISTS (
                       SELECT 1 FROM project_exceptions e
                        WHERE e.project_id = f.project_id AND e.source_path = f.source_path
                   ) AS is_excluded
              FROM project_files f
              LEFT JOIN artifacts a
                     ON a.project_id = f.project_id AND a.source_path = f.source_path
             WHERE f.project_id = ?
             ORDER BY f.source_path
            """,
            (project_id,),
        ).fetchall()

        return [
            ProjectFile(
                id=row["id"],
                project_id=row["project_id"],
                source_path=row["source_path"],
                size_bytes=row["size_bytes"],
                modified_at=row["modified_at"],
                transform_requested=bool(row["transform_requested"]),
                requested_at=row["requested_at"],
                last_seen_at=row["last_seen_at"],
                is_excluded=bool(row["is_excluded"]),
                artifact_id=row["artifact_id"],
                artifact_status=row["artifact_status"],
            )
            for row in rows
        ]

    def request_transform(self, project_id: str, source_path: str) -> None:
        self._connection.execute(
            "UPDATE project_files SET transform_requested = 1, requested_at = ? WHERE project_id = ? AND source_path = ?",
            (_now(), project_id, source_path),
        )

    def take_transform_requests(self, project_id: str) -> List[str]:
        """Hand over pending requests and clear them in the same breath.

        The flag is cleared when the work is picked up rather than when it
        finishes: a run that dies halfway must not leave a request the client
        re-collects forever.
        """
        rows = self._connection.execute(
            "SELECT source_path FROM project_files WHERE project_id = ? AND transform_requested = 1",
            (project_id,),
        ).fetchall()

        paths = [row["source_path"] for row in rows]
        if paths:
            self._connection.execute(
                "UPDATE project_files SET transform_requested = 0, requested_at = NULL WHERE project_id = ? AND transform_requested = 1",
                (project_id,),
            )
        return paths

    # -- kanban ---------------------------------------------------------------

    def sync_tasks(self, project_id: str, artifact_id: str, source_path: str, tasks: List[Dict[str, Any]]) -> int:
        """Re-sync a tasks file into the board.

        Everything except board_status is owned by the source file and is
        overwritten here. board_status is owned by the board - a card dragged to
        In Progress must survive the next render of the file it came from.
        """
        now = _now()
        seen: List[str] = []

        for task in tasks:
            task_key = str(task.get("task_key") or task.get("key") or "").strip()
            if not task_key:
                continue
            seen.append(task_key)

            existing = self._connection.execute(
                "SELECT board_status FROM kanban_tasks WHERE project_id = ? AND task_key = ?",
                (project_id, task_key),
            ).fetchone()

            checkbox_done = bool(task.get("checkbox_done") or task.get("done"))
            # A file that now says the task is done moves the card, unless
            # somebody has already moved it themselves.
            board_status = existing["board_status"] if existing else ("done" if checkbox_done else "todo")
            if checkbox_done and board_status == "todo":
                board_status = "done"

            self._connection.execute(
                """
                INSERT INTO kanban_tasks (project_id, artifact_id, source_path, task_key, phase, phase_order,
                                          parallel, story, description, checkbox_done, board_status,
                                          created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (project_id, task_key) DO UPDATE SET
                    artifact_id = excluded.artifact_id,
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
                    project_id,
                    artifact_id,
                    source_path,
                    task_key,
                    str(task.get("phase") or ""),
                    int(task.get("phase_order") or 0),
                    1 if task.get("parallel") else 0,
                    task.get("story"),
                    str(task.get("description") or ""),
                    1 if checkbox_done else 0,
                    board_status,
                    now,
                    now,
                ),
            )

        if seen:
            placeholders = ",".join("?" for _ in seen)
            self._connection.execute(
                f"DELETE FROM kanban_tasks WHERE project_id = ? AND source_path = ? AND task_key NOT IN ({placeholders})",
                (project_id, source_path, *seen),
            )
        else:
            self._connection.execute(
                "DELETE FROM kanban_tasks WHERE project_id = ? AND source_path = ?",
                (project_id, source_path),
            )

        return len(seen)

    def tasks(self, project_id: str) -> List[KanbanTask]:
        rows = self._connection.execute(
            "SELECT * FROM kanban_tasks WHERE project_id = ? ORDER BY phase_order, task_key",
            (project_id,),
        ).fetchall()
        return [kanban_task_from_row(row) for row in rows]

    def set_board_status(self, task_id: int, board_status: str) -> KanbanTask:
        if board_status not in ("todo", "in_progress", "done"):
            raise ValueError(f"Unknown board status: {board_status!r}")

        self._connection.execute(
            "UPDATE kanban_tasks SET board_status = ?, updated_at = ? WHERE id = ?",
            (board_status, _now(), task_id),
        )
        row = self._connection.execute("SELECT * FROM kanban_tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise ValueError(f"No such task: {task_id}")
        return kanban_task_from_row(row)

    # -- exceptions -----------------------------------------------------------

    def add_exception(self, project_id: str, source_path: str) -> ProcessingException:
        self._connection.execute(
            """
            INSERT INTO project_exceptions (project_id, source_path, created_at) VALUES (?, ?, ?)
            ON CONFLICT (project_id, source_path) DO NOTHING
            """,
            (project_id, source_path, _now()),
        )
        row = self._connection.execute(
            "SELECT * FROM project_exceptions WHERE project_id = ? AND source_path = ?",
            (project_id, source_path),
        ).fetchone()
        return exception_from_row(row)

    def remove_exception(self, exception_id: int) -> None:
        self._connection.execute("DELETE FROM project_exceptions WHERE id = ?", (exception_id,))

    def exceptions(self, project_id: str) -> List[ProcessingException]:
        rows = self._connection.execute(
            "SELECT * FROM project_exceptions WHERE project_id = ? ORDER BY source_path",
            (project_id,),
        ).fetchall()
        return [exception_from_row(row) for row in rows]

    def is_excepted(self, project_id: str, source_path: str) -> bool:
        """Exact file, or any folder prefix of it.

        An exception on `.specify/templates` has to cover every file under it,
        or excluding a directory would mean listing its contents by hand.
        """
        row = self._connection.execute(
            """
            SELECT 1 FROM project_exceptions
             WHERE project_id = ?
               AND (source_path = ? OR ? LIKE source_path || '/%')
             LIMIT 1
            """,
            (project_id, source_path, source_path),
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


def classify(source_path: str) -> str:
    """Categorise a document by its filename, as the pipeline always has.

    Speckit projects name their files by role - spec.md, plan.md, tasks.md -
    and the dashboard colours and filters by that category.
    """
    name = Path(source_path).name.lower()
    if name.startswith("spec"):
        return "spec"
    if name.startswith("plan"):
        return "plan"
    if name.startswith("task"):
        return "task"
    if "constitution" in name:
        return "constitution"
    return "other"
