from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import get_api_key, get_output_dir, get_project_name, get_repository
from app.models.schemas import ArtifactIngestRawRequest, ArtifactIngestStructuredRequest, ProjectCreate, ProjectResponse
from app.services.agent_transform import AgentTransformService
from app.services.ingestion import IngestionService
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
    return {"artifacts": repo.list_artifacts(project_id)}


@router.get("/api/artifacts/{artifact_id}/versions")
def list_versions(artifact_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    repo, _, _, _, _, _ = get_services()
    return {"versions": repo.list_versions(artifact_id)}


@router.get("/api/doc-versions/{version_id}/pdf")
def download_pdf(version_id: str, _=Depends(require_api_key)) -> FileResponse:
    """
    Download PDF file for a specific document version.
    Returns the PDF file from the filesystem.
    """
    repo, _, _, _, _, _ = get_services()
    
    # Get version info from database to retrieve pdf_path
    # Query database directly for the version
    with repo._connect() as connection:
        row = connection.execute(
            "SELECT pdf_path FROM doc_versions WHERE id = ?",
            (version_id,)
        ).fetchone()
    
    if row is None:
        raise HTTPException(status_code=404, detail="Version not found")
    
    pdf_path = row["pdf_path"]
    
    # Check if file exists
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found at path: {pdf_path}")
    
    # Return PDF file
    return FileResponse(
        path=pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path)
    )
