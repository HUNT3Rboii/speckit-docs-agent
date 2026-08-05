from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import get_api_key, get_output_dir, get_project_name, get_repository
from app.models.schemas import ArtifactIngestRawRequest, ArtifactIngestStructuredRequest, ArtifactTagsUpdate, ExceptionCreate, KanbanTaskProgressReport, KanbanTaskStatusUpdate, ProjectCreate, ProjectResponse
from app.services.agent_transform import AgentTransformService
from app.services.ingestion import IngestionService
from app.services.path_matching import path_matches_exception
from app.services.persistence import PersistenceService
from app.services.rendering import RenderingService
from app.services.validation import ValidationError, ValidationService

router = APIRouter()

# Repository is initialized lazily via dependency injection
def get_services():
    repo = get_repository()
    ingestion_service = IngestionService(repo)
    rendering_service = RenderingService(get_output_dir())
    persistence_service = PersistenceService(repo, rendering_service)
    validation_service = ValidationService()
    transform_service = AgentTransformService()
    return repo, ingestion_service, rendering_service, persistence_service, validation_service, transform_service


def require_api_key(authorization: str | None = Header(default=None)) -> None:
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


@router.post("/api/projects", response_model=ProjectResponse)
def create_project(payload: ProjectCreate, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    project = repo.create_project(payload.name, payload.repo_url)
    return project


@router.post("/api/artifacts/ingest-structured")
def ingest_structured(payload: ArtifactIngestStructuredRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, ingestion_service, rendering_service, persistence_service, validation_service, transform_service = get_services()
    
    # Import enhancement service
    from app.services.document_enhancement import DocumentEnhancementService
    enhancement_service = DocumentEnhancementService()
    
    # Resolve project name to ID, create if doesn't exist
    project_id = payload.project_id
    all_projects = repo.list_projects()
    project_match = next((p for p in all_projects if p["name"] == payload.project_id), None)
    if project_match:
        project_id = project_match["id"]
    else:
        # Auto-create project if it doesn't exist
        new_project = repo.create_project(payload.project_id, repo_url=None)
        project_id = new_project["id"]
    
    structured_payload = payload.structured_json
    if not structured_payload.get("sections"):
        transformed = transform_service.transform(payload.source_path, payload.structured_json.get("raw_content", ""), payload.structured_json.get("artifact_type", "other"))
        structured_payload = {
            "title": transformed["title"],
            "abstract": transformed["abstract"],
            "artifact_type": transformed["artifact_type"],
            "source_path": transformed["source_path"],
            "sections": transformed["sections"],
        }

    try:
        validation_service.validate(payload.source_path, structured_payload, payload.structured_json.get("raw_content", ""))
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "details": exc.details}) from exc

    result = ingestion_service.ingest_structured(project_id, payload.source_path, structured_payload, payload.commit_hash)
    if result.get("skipped"):
        return {"status": "ok", "artifact": result["artifact"], "skipped": True}

    # ENHANCEMENT: Apply intelligent document enhancement
    artifact_type = structured_payload.get("artifact_type", "other")
    enhanced_payload = enhancement_service.enhance_document(structured_payload, artifact_type)
    
    persisted = persistence_service.persist(project_id, result["artifact"], enhanced_payload, payload.commit_hash)
    return {
        "status": "ok",
        "artifact": persisted["artifact"],
        "artifact_id": persisted["artifact"]["id"],
        "pdf_location": persisted["version"]["pdf_path"],
        "version": persisted["version"],
        "enhancements": enhanced_payload.get("enhancements", {})
    }


@router.post("/api/artifacts/ingest-raw")
def ingest_raw(payload: ArtifactIngestRawRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, ingestion_service, rendering_service, persistence_service, validation_service, transform_service = get_services()
    
    # Import enhancement service
    from app.services.document_enhancement import DocumentEnhancementService
    enhancement_service = DocumentEnhancementService()
    
    # Resolve project name to ID
    project_id = payload.project_id
    all_projects = repo.list_projects()
    project_match = next((p for p in all_projects if p["name"] == payload.project_id), None)
    if project_match:
        project_id = project_match["id"]
    
    transformed = transform_service.transform(payload.source_path, payload.raw_content, ingestion_service.classify(payload.source_path, payload.raw_content))
    structured_payload = {
        "title": transformed["title"],
        "abstract": transformed["abstract"],
        "artifact_type": transformed["artifact_type"],
        "source_path": transformed["source_path"],
        "sections": transformed["sections"],
    }

    try:
        validation_service.validate(payload.source_path, structured_payload, payload.raw_content)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "details": exc.details}) from exc

    result = ingestion_service.ingest_raw(project_id, payload.source_path, payload.raw_content, payload.commit_hash)
    if result.get("skipped"):
        return {"status": "ok", "artifact": result["artifact"], "skipped": True, "structured": structured_payload}

    # ENHANCEMENT: Apply intelligent document enhancement
    artifact_type = structured_payload.get("artifact_type", "other")
    enhanced_payload = enhancement_service.enhance_document(structured_payload, artifact_type)
    
    persisted = persistence_service.persist(project_id, result["artifact"], enhanced_payload, payload.commit_hash)
    return {
        "status": "ok",
        "artifact": persisted["artifact"],
        "artifact_id": persisted["artifact"]["id"],
        "pdf_location": persisted["version"]["pdf_path"],
        "version": persisted["version"],
        "stale": result.get("stale", False),
        "structured": structured_payload,
        "enhancements": enhanced_payload.get("enhancements", {})
    }


@router.get("/api/projects")
def list_projects(_=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    return {"projects": repo.list_projects()}


@router.get("/api/projects/{project_id}/artifacts")
def list_artifacts(project_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    artifacts = repo.list_artifacts(project_id)
    visible = [a for a in artifacts if not (a.get("metadata") or {}).get("hidden")]
    return {"artifacts": visible}


@router.get("/api/artifacts/{artifact_id}/versions")
def list_versions(artifact_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    return {"versions": repo.list_versions(artifact_id)}


@router.put("/api/artifacts/{artifact_id}/tags")
def set_artifact_tags(artifact_id: str, payload: ArtifactTagsUpdate, _=Depends(require_api_key)) -> Dict[str, Any]:
    """Replace an artifact's full tag list, for organizing PDFs beyond the
    fixed artifact_type categories. Stored in its own DB column that
    upsert_artifact() never touches, so re-processing the source file
    (which happens on every save) can't ever wipe out tags the user added."""
    repo, _, _, _, _, _ = get_services()
    tags = repo.set_artifact_tags(artifact_id, payload.tags)
    if tags is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"artifact_id": artifact_id, "tags": tags}


@router.get("/api/projects/{project_id}/exceptions")
def list_exceptions(project_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    """Source paths (exact files or folder prefixes, e.g.
    ".specify/templates") excluded from processing for this project."""
    repo, _, _, _, _, _ = get_services()
    return {"exceptions": repo.list_exceptions(project_id)}


@router.post("/api/projects/{project_id}/exceptions")
def add_exception(project_id: str, payload: ExceptionCreate, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    created_at = datetime.now(timezone.utc).isoformat()
    exception = repo.add_exception(project_id, payload.source_path, created_at)

    # Excluding a path hides any artifact(s) that already exist under it
    # from the dashboard immediately - hidden, not deleted, so removing the
    # exception later can bring them straight back (same PDF, no
    # reprocessing needed) rather than losing them for good.
    hidden_artifact_ids = []
    for artifact in repo.list_artifacts(project_id):
        metadata = dict(artifact.get("metadata") or {})
        if metadata.get("hidden"):
            continue
        if path_matches_exception(artifact["source_path"], payload.source_path):
            metadata["hidden"] = True
            repo.upsert_artifact({**artifact, "metadata": metadata})
            hidden_artifact_ids.append(artifact["id"])

    return {"exception": exception, "hidden_artifact_ids": hidden_artifact_ids}


@router.delete("/api/projects/{project_id}/exceptions/{exception_id}")
def remove_exception(project_id: str, exception_id: int, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    repo.remove_exception(project_id, exception_id)

    # Un-hide any artifact that was hidden by this exception and isn't
    # covered by any *other* remaining exception - e.g. two overlapping
    # exceptions (".specify" and ".specify/templates") both hiding the same
    # file must not un-hide it just because one of the two was removed.
    remaining_exceptions = repo.list_exceptions(project_id)
    unhidden_artifact_ids = []
    for artifact in repo.list_artifacts(project_id):
        metadata = dict(artifact.get("metadata") or {})
        if not metadata.get("hidden"):
            continue
        still_excluded = any(
            path_matches_exception(artifact["source_path"], exc["source_path"])
            for exc in remaining_exceptions
        )
        if not still_excluded:
            metadata["hidden"] = False
            repo.upsert_artifact({**artifact, "metadata": metadata})
            unhidden_artifact_ids.append(artifact["id"])

    return {"status": "ok", "unhidden_artifact_ids": unhidden_artifact_ids}


@router.get("/api/projects/{project_id}/kanban-tasks")
def list_kanban_tasks(project_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    """All Kanban tasks for a project, across every tasks.md-classified
    artifact - see AgenticPipelineService._sync_kanban_tasks for how these
    get (re)populated. The Board tab groups these into swimlanes by
    source_path client-side."""
    repo, _, _, _, _, _ = get_services()
    return {"tasks": repo.list_kanban_tasks(project_id)}


@router.patch("/api/kanban-tasks/{task_id}")
def update_kanban_task_status(
    task_id: int, payload: KanbanTaskStatusUpdate, _=Depends(require_api_key)
) -> Dict[str, Any]:
    """Move a card between columns and, optionally, between phase lanes.
    phase/phase_order are a manual override - like board_status, they
    survive until the source tasks.md is reprocessed, at which point the
    file's own phase for that task wins again (the board reflects the
    file, not an independently-editable record) unless the task's own
    checkbox/phase-heading genuinely changed in the file."""
    repo, _, _, _, _, _ = get_services()
    now = datetime.now(timezone.utc).isoformat()
    task = repo.update_kanban_task_status(
        task_id, payload.board_status, now, phase=payload.phase, phase_order=payload.phase_order
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task": task}


@router.post("/api/projects/{project_id}/kanban-tasks/report-progress")
def report_kanban_task_progress(
    project_id: str, payload: KanbanTaskProgressReport, _=Depends(require_api_key)
) -> Dict[str, Any]:
    """
    Best-effort live progress signal for a single task, relayed by the VS
    Code extension's local progress-file watcher (see
    progressFileWatcher.ts) from signals an external agent - e.g. GitHub
    Copilot running /speckit.implement - drops while it works through a
    tasks.md. Looked up by (project_id, source_path, task_key) since the
    reporting agent only ever knows a task's natural key, never our
    internal numeric id.

    project_id here is actually the workspace/repo root folder *name* (see
    transformPipeline.ts's detectProvenance/projectRoot), same as every
    other endpoint the extension calls (/api/process,
    /api/processing-status) - it must go through the same
    _resolve_or_create_project name->id resolution those use, or this would
    look up kanban_tasks under the literal folder-name string instead of
    the real "proj-N" id those rows are actually stored under, 404ing on
    every single call.

    A task the board doesn't know about yet (e.g. the file hasn't been
    through the pipeline a first time) 404s rather than being silently
    created - a progress report isn't itself enough information to
    fabricate a whole task row (phase, description, etc.).
    """
    from app.api.process_routes import _resolve_or_create_project

    repo, _, _, _, _, _ = get_services()
    resolved_project_id = _resolve_or_create_project(repo, project_id)
    existing = repo.get_kanban_task_by_key(resolved_project_id, payload.source_path, payload.task_key)
    if existing is None:
        raise HTTPException(status_code=404, detail="Task not found")
    now = datetime.now(timezone.utc).isoformat()
    task = repo.update_kanban_task_status(existing["id"], payload.board_status, now)
    return {"task": task}


@router.get("/api/doc-versions/{version_id}/pdf")
def download_pdf(
    version_id: str, 
    api_key: str = None,
    authorization: str | None = Header(default=None)
) -> FileResponse:
    """
    Download PDF file for a specific document version.
    Returns the PDF file from the filesystem.
    Accepts API key either as Bearer token in Authorization header or as query parameter.
    """
    # Validate API key from either header or query parameter
    expected = get_api_key()
    
    # Check Authorization header first
    if authorization and authorization == f"Bearer {expected}":
        pass  # Valid
    # Fall back to query parameter for iframe usage
    elif api_key and api_key == expected:
        pass  # Valid
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")
    
    repo, _, _, _, _, _ = get_services()
    
    # Get version info from database to retrieve pdf_path
    # Query database directly for the version
    with repo._connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT pdf_path FROM doc_versions WHERE id = %s",
                (version_id,)
            )
            row = cursor.fetchone()
    
    if row is None:
        raise HTTPException(status_code=404, detail="Version not found")
    
    pdf_path = row["pdf_path"]
    
    # Check if file exists
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found at path: {pdf_path}")
    
    # Return PDF file. content_disposition_type="inline" (FileResponse
    # defaults to "attachment" whenever filename= is passed) is required for
    # the frontend's <object data="..."> embed to render the PDF in place -
    # "attachment" tells the browser to hand the response to a download
    # instead of the PDF viewer, so the <object> renders nothing at all
    # (not even its own fallback content, since the browser's PDF plugin
    # never got the bytes to begin with). The explicit "Download PDF" button
    # in the UI is unaffected: its <a download> attribute forces a save
    # regardless of this header.
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path),
        content_disposition_type="inline"
    )
