from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.deps import get_api_key, get_output_dir, get_repository
from app.models.schemas import ProcessRequest
from app.services.agentic_pipeline_service import AgenticPipelineService

router = APIRouter()


def require_api_key(authorization: str | None = Header(default=None)) -> None:
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


def get_pipeline_service() -> AgenticPipelineService:
    repo = get_repository()
    return AgenticPipelineService(repo, get_output_dir())


@router.post("/api/process")
def process_document(payload: ProcessRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
    """
    Validate an AI-produced EnrichedJSON against its source markdown and, on
    success, render it to PDF. On validation failure with retries remaining,
    responds with a structured error for the caller to correct and resubmit
    (incrementing retry_count) rather than retrying server-side — see
    AgenticPipelineService for the full rationale.
    """
    service = get_pipeline_service()

    repo = service.repo
    project_id = payload.project_id
    all_projects = repo.list_projects()
    project_match = next((p for p in all_projects if p["name"] == payload.project_id), None)
    if project_match:
        project_id = project_match["id"]
    else:
        new_project = repo.create_project(payload.project_id, repo_url=None)
        project_id = new_project["id"]

    return service.process(
        project_id=project_id,
        source_path=payload.source_path,
        source_markdown=payload.source_markdown,
        enriched_json=payload.enriched_json,
        artifact_type=payload.artifact_type,
        commit_hash=payload.commit_hash,
        retry_count=payload.retry_count,
    )


@router.get("/api/status/{artifact_id}")
def get_artifact_status(artifact_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    """Return processing status for an artifact: latest version, stage
    timings snapshot, and any dropped diagrams/glossary entries (Requirement
    10.4 — dashboard visibility for graceful degradation)."""
    service = get_pipeline_service()
    result = service.get_status(artifact_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return result
