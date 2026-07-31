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


class SectionSchema(BaseModel):
    heading: str
    content: str
    type: str = Field(..., pattern="^(task|user_story|design_decision|normal)$")


class AgentTransformRequest(BaseModel):
    """Request from IDE extension with AI transformation result."""
    source_path: str
    artifact_type: str
    title: str
    abstract: str
    sections: List[SectionSchema]


class AgentTransformResponse(BaseModel):
    """Response confirming receipt of AI transformation."""
    status: str
    message: str
    result: dict[str, Any]



class TransformationModeRequest(BaseModel):
    """Request to change transformation mode."""
    mode: str = Field(..., pattern="^(ai|agentic|ai-powered|rule-based|classic|heuristic)$")


class TransformationModeResponse(BaseModel):
    """Response with transformation mode information."""
    status: str
    mode: str
    mode_display: str
    description: str
    ai_enabled: bool
    message: str


class ConfigStatusResponse(BaseModel):
    """Overall configuration status response."""
    transformation_mode: dict[str, Any]
    backend_version: str
    features: dict[str, bool]


class ProcessRequest(BaseModel):
    """
    Request for the agentic pipeline's /api/process endpoint.

    Carries the AI-produced EnrichedJSON alongside the original source
    markdown (needed for evidence-grounding validation) and a client-tracked
    retry_count, since the validate-correct-resubmit loop is driven by the
    caller across separate HTTP requests rather than a synchronous callback.
    """
    project_id: str
    source_path: str
    source_markdown: str
    enriched_json: dict[str, Any]
    artifact_type: Optional[str] = None
    commit_hash: Optional[str] = None
    retry_count: int = 0
