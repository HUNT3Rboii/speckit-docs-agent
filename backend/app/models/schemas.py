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


class ExceptionCreate(BaseModel):
    """A source_path (exact file) or folder prefix (e.g.
    ".specify/templates") to exclude from future processing."""
    source_path: str


class ArtifactTagsUpdate(BaseModel):
    """Replaces an artifact's full tag list (not a partial add/remove) -
    the frontend always sends the complete desired list, matching how
    CategoryFilter-style multi-select UIs typically work."""
    tags: List[str] = Field(default_factory=list)


class KanbanTaskStatusUpdate(BaseModel):
    """
    Body for moving a Kanban card between columns and/or lanes (phases).
    phase/phase_order are optional: dragging within a phase's own columns
    only ever sends board_status, while dragging a card into a different
    phase's board also sends the target phase's identity so the card
    actually relocates instead of the mutation only changing its status
    and the card snapping back to its original phase on the next refetch.
    """
    board_status: str = Field(..., pattern="^(todo|in_progress|done)$")
    phase: Optional[str] = None
    phase_order: Optional[int] = None


class KanbanTaskProgressReport(BaseModel):
    """
    Live progress signal for a task, identified by (project_id, source_path,
    task_key) rather than our internal numeric id - the reporting agent
    (GitHub Copilot, relayed via the VS Code extension's progress-file
    watcher) only ever knows a task by its natural key from tasks.md, never
    our DB id.
    """
    source_path: str
    task_key: str
    board_status: str = Field(..., pattern="^(todo|in_progress|done)$")


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
    tags: List[str] = Field(default_factory=list)


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


class ReportStepRequest(BaseModel):
    """
    Request for /api/processing-status, used by the VS Code extension to
    report a client-side pipeline step (reading the file, calling the AI
    provider, etc.) that happens before it has a full enriched_json to send
    to /api/process - without this, those (often slower) steps are invisible
    on the dashboard.
    """
    project_id: str
    source_path: str
    step: str
    source_markdown: Optional[str] = ""
    # Which client-side correction attempt this is (1-based) and the cap on
    # attempts, so the dashboard can show "attempt 2/5" instead of leaving
    # a long-running retry loop indistinguishable from a hang.
    attempt: Optional[int] = None
    max_attempts: Optional[int] = None


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
    # Provenance fields, detected client-side (the backend has no filesystem
    # visibility into the caller's workspace, especially when containerized).
    project_root: Optional[str] = None
    authoring_framework: Optional[str] = None
    model_used: Optional[str] = None
    # Set when this call is fulfilling a manual Retry request (the file's
    # content is unchanged - that's the whole point of retrying the exact
    # same document) - bypasses the unchanged-content skip that would
    # otherwise treat this as a no-op duplicate of the already-rendered
    # version.
    force_reprocess: bool = False
