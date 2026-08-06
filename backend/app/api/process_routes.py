from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.deps import get_api_key, get_output_dir, get_repository
from app.models.schemas import ProcessRequest, ReportStepRequest
from app.services.agentic_pipeline_service import AgenticPipelineService

router = APIRouter()


def require_api_key(authorization: str | None = Header(default=None)) -> None:
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


def get_pipeline_service() -> AgenticPipelineService:
    repo = get_repository()
    return AgenticPipelineService(repo, get_output_dir())


def _resolve_or_create_project(repo: Any, project_name: str) -> str:
    """Callers send a project *name* (the workspace/repo root folder), not
    an id - resolve it to the existing project's id, auto-creating the
    project on first use."""
    all_projects = repo.list_projects()
    project_match = next((p for p in all_projects if p["name"] == project_name), None)
    if project_match:
        return project_match["id"]
    new_project = repo.create_project(project_name, repo_url=None)
    return new_project["id"]


def _resolve_project_id_readonly(repo: Any, project_name: str) -> str | None:
    """Like _resolve_or_create_project, but for read-only polling - a
    workspace folder that's never actually been processed yet shouldn't
    spawn an empty project row just from being polled for pending retries."""
    match = next((p for p in repo.list_projects() if p["name"] == project_name), None)
    return match["id"] if match else None


@router.post("/api/processing-status")
def report_processing_step(payload: ReportStepRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
    """
    Record a client-side pipeline step (reading the file, calling the AI
    provider, etc.) that happens before the caller has enough to call
    /api/process - see AgenticPipelineService.report_step for why this
    exists. Best-effort from the caller's perspective: failing to report a
    step should never block the actual pipeline.
    """
    service = get_pipeline_service()
    project_id = _resolve_or_create_project(service.repo, payload.project_id)
    if service.is_path_excluded(project_id, payload.source_path):
        return {"status": "excluded"}
    artifact = service.report_step(
        project_id=project_id,
        source_path=payload.source_path,
        step=payload.step,
        source_markdown=payload.source_markdown or "",
        attempt=payload.attempt,
        max_attempts=payload.max_attempts,
    )
    return {"status": "ok", "artifact": artifact}


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
    project_id = _resolve_or_create_project(service.repo, payload.project_id)
    if service.is_path_excluded(project_id, payload.source_path):
        # Reuses the existing "skipped" contract the extension already
        # handles gracefully (a quiet "File skipped" notification, no
        # error) rather than requiring an extension update to recognize a
        # new status value - the exclusion list is meant to take effect
        # immediately for every caller with zero client-side changes.
        return {"status": "ok", "skipped": True, "excluded": True}

    return service.process(
        project_id=project_id,
        source_path=payload.source_path,
        source_markdown=payload.source_markdown,
        enriched_json=payload.enriched_json,
        artifact_type=payload.artifact_type,
        commit_hash=payload.commit_hash,
        retry_count=payload.retry_count,
        project_root=payload.project_root,
        authoring_framework=payload.authoring_framework,
        model_used=payload.model_used,
        force_reprocess=payload.force_reprocess,
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


@router.get("/api/artifacts/{artifact_id}/cancel-status")
def get_cancel_status(artifact_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    """Read-only check of whether cancellation has been requested for an
    artifact, polled by the VS Code extension while its own AI call is
    still running (see TransformPipeline's per-file cancel-poll). Unlike
    reportStep, this never mutates anything - it exists specifically so a
    cancel requested mid-AI-call can be noticed without waiting for the
    call to finish and reach the next reportStep checkpoint, and without
    resetting the very flag it's checking."""
    service = get_pipeline_service()
    artifact = service.repo.get_artifact_by_id(artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"cancel_requested": bool((artifact.get("metadata") or {}).get("cancel_requested"))}


@router.get("/api/projects/{project_id}/retry-requests")
def get_retry_requests(project_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    """Pending manual-retry requests for a project, polled by the VS Code
    extension (see TransformPipeline's retry-poll loop and
    AgenticPipelineService.list_retry_requests). project_id here is the
    workspace/repo root folder name, same convention as /api/process and
    /api/processing-status - not yet resolved to an internal project id.
    A project that's never been processed (no matching name) simply has no
    pending retries, rather than being auto-created just from a poll."""
    service = get_pipeline_service()
    resolved_id = _resolve_project_id_readonly(service.repo, project_id)
    if resolved_id is None:
        return {"retry_requests": []}
    return {"retry_requests": service.list_retry_requests(resolved_id)}
