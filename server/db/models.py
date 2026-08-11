"""Row shapes, matching the contract the dashboard already speaks.

Field names are the ones the frontend's api.ts uses - `source_path`,
`artifact_type`, `board_status` - rather than being renamed on the way through.
The UI is being ported, not rewritten, and a rename here would mean touching
every component that reads a row.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

AutomationMode = str  # 'automatic' | 'manual'
BoardStatus = str  # 'todo' | 'in_progress' | 'done'


@dataclass
class Project:
    id: str
    name: str
    repo_url: Optional[str]
    automation_mode: AutomationMode

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "repo_url": self.repo_url,
            "automation_mode": self.automation_mode,
        }


@dataclass
class Artifact:
    id: str
    project_id: str
    source_path: str
    artifact_type: str
    status: str
    content_hash: str
    created_at: str
    title: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "source_path": self.source_path,
            "artifact_type": self.artifact_type,
            "status": self.status,
            "content_hash": self.content_hash,
            "created_at": self.created_at,
            "title": self.title,
            "tags": self.tags,
            "metadata": self.metadata,
        }


@dataclass
class Version:
    id: str
    artifact_id: str
    version_no: int
    pdf_path: str
    structured_json: Dict[str, Any]
    generated_by: str
    generated_at: str
    diagram_count: int = 0
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "artifact_id": self.artifact_id,
            "version_no": self.version_no,
            "pdf_path": self.pdf_path,
            "structured_json": self.structured_json,
            "generated_by": self.generated_by,
            "generated_at": self.generated_at,
            "diagram_count": self.diagram_count,
            "warnings": self.warnings,
        }


@dataclass
class ProjectFile:
    id: int
    project_id: str
    source_path: str
    size_bytes: int
    modified_at: Optional[str]
    transform_requested: bool
    requested_at: Optional[str]
    last_seen_at: str
    is_excluded: bool = False
    artifact_id: Optional[str] = None
    artifact_status: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "source_path": self.source_path,
            "size_bytes": self.size_bytes,
            "modified_at": self.modified_at,
            "transform_requested": self.transform_requested,
            "requested_at": self.requested_at,
            "last_seen_at": self.last_seen_at,
            "is_excluded": self.is_excluded,
            "artifact_id": self.artifact_id,
            "artifact_status": self.artifact_status,
        }


@dataclass
class KanbanTask:
    id: int
    project_id: str
    artifact_id: str
    source_path: str
    task_key: str
    phase: str
    phase_order: int
    parallel: bool
    story: Optional[str]
    description: str
    checkbox_done: bool
    board_status: BoardStatus
    created_at: str
    updated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "artifact_id": self.artifact_id,
            "source_path": self.source_path,
            "task_key": self.task_key,
            "phase": self.phase,
            "phase_order": self.phase_order,
            "parallel": self.parallel,
            "story": self.story,
            "description": self.description,
            "checkbox_done": self.checkbox_done,
            "board_status": self.board_status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class ProcessingException:
    id: int
    project_id: str
    source_path: str
    created_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "project_id": self.project_id,
            "source_path": self.source_path,
            "created_at": self.created_at,
        }


def project_from_row(row: sqlite3.Row) -> Project:
    return Project(
        id=row["id"],
        name=row["name"],
        repo_url=row["repo_url"],
        automation_mode=row["automation_mode"],
    )


def artifact_from_row(row: sqlite3.Row) -> Artifact:
    return Artifact(
        id=row["id"],
        project_id=row["project_id"],
        source_path=row["source_path"],
        artifact_type=row["artifact_type"],
        status=row["status"],
        content_hash=row["content_hash"],
        created_at=row["created_at"],
        title=row["title"],
        tags=json.loads(row["tags"]),
        metadata=json.loads(row["metadata"]),
    )


def version_from_row(row: sqlite3.Row) -> Version:
    return Version(
        id=row["id"],
        artifact_id=row["artifact_id"],
        version_no=row["version_no"],
        pdf_path=row["pdf_path"],
        structured_json=json.loads(row["structured_json"]),
        generated_by=row["generated_by"],
        generated_at=row["generated_at"],
        diagram_count=row["diagram_count"],
        warnings=json.loads(row["warnings"]),
    )


def kanban_task_from_row(row: sqlite3.Row) -> KanbanTask:
    return KanbanTask(
        id=row["id"],
        project_id=row["project_id"],
        artifact_id=row["artifact_id"],
        source_path=row["source_path"],
        task_key=row["task_key"],
        phase=row["phase"],
        phase_order=row["phase_order"],
        parallel=bool(row["parallel"]),
        story=row["story"],
        description=row["description"],
        checkbox_done=bool(row["checkbox_done"]),
        board_status=row["board_status"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def exception_from_row(row: sqlite3.Row) -> ProcessingException:
    return ProcessingException(
        id=row["id"],
        project_id=row["project_id"],
        source_path=row["source_path"],
        created_at=row["created_at"],
    )
