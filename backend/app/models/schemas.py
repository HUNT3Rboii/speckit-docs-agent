from __future__ import annotations

from typing import Any, List, Optional
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    repo_url: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    repo_url: Optional[str] = None


class ArtifactIngestStructuredRequest(BaseModel):
    project_id: str
    source_path: str
    structured_json: dict[str, Any]
    commit_hash: Optional[str] = None


class ArtifactIngestRawRequest(BaseModel):
    project_id: str
    source_path: str
    raw_content: str
    commit_hash: Optional[str] = None


class ArtifactResponse(BaseModel):
    id: str
    project_id: str
    source_path: str
    source_tool: str
    artifact_type: str
    status: str
    content_hash: str


class DocVersionResponse(BaseModel):
    id: str
    artifact_id: str
    version_no: int
    pdf_path: str
    structured_json: dict[str, Any]
    generated_by: str
    generated_at: str
