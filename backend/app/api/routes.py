from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.deps import get_api_key, get_output_dir, get_project_name
from app.models.schemas import ArtifactIngestRawRequest, ArtifactIngestStructuredRequest, ProjectCreate, ProjectResponse
from app.repositories.artifact_repo import ArtifactRepository
from app.services.agent_transform import AgentTransformService
from app.services.ingestion import IngestionService
from app.services.persistence import PersistenceService
from app.services.rendering import RenderingService
from app.services.validation import ValidationError, ValidationService

router = APIRouter()
repo = ArtifactRepository()
ingestion_service = IngestionService(repo)
rendering_service = RenderingService(get_output_dir())
persistence_service = PersistenceService(repo, rendering_service)
validation_service = ValidationService()
transform_service = AgentTransformService()


def require_api_key(authorization: str | None = Header(default=None)) -> None:
    expected = get_api_key()
    if not authorization or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


@router.post("/api/projects", response_model=ProjectResponse)
def create_project(payload: ProjectCreate, _=Depends(require_api_key)) -> Dict[str, Any]:
    project = repo.create_project(payload.name, payload.repo_url)
    return project


@router.post("/api/artifacts/ingest-structured")
def ingest_structured(payload: ArtifactIngestStructuredRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
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
        validation_service.validate(payload.source_path, structured_payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": str(exc), "details": exc.details}) from exc

    result = ingestion_service.ingest_structured(payload.project_id, payload.source_path, structured_payload, payload.commit_hash)
    if result.get("skipped"):
        return {"status": "ok", "artifact": result["artifact"], "skipped": True}

    persisted = persistence_service.persist(payload.project_id, result["artifact"], structured_payload, payload.commit_hash)
    return {"status": "ok", "artifact": persisted["artifact"], "version": persisted["version"]}


@router.post("/api/artifacts/ingest-raw")
def ingest_raw(payload: ArtifactIngestRawRequest, _=Depends(require_api_key)) -> Dict[str, Any]:
    transformed = transform_service.transform(payload.source_path, payload.raw_content, ingestion_service.classify(payload.source_path, payload.raw_content))
    structured_payload = {
        "title": transformed["title"],
        "abstract": transformed["abstract"],
        "artifact_type": transformed["artifact_type"],
        "source_path": transformed["source_path"],
        "sections": transformed["sections"],
    }
    result = ingestion_service.ingest_raw(payload.project_id, payload.source_path, payload.raw_content, payload.commit_hash)
    return {"status": "ok", "artifact": result["artifact"], "stale": result.get("stale", False), "structured": structured_payload}


@router.get("/api/projects")
def list_projects(_=Depends(require_api_key)) -> Dict[str, Any]:
    return {"projects": repo.list_projects()}


@router.get("/api/projects/{project_id}/artifacts")
def list_artifacts(project_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    return {"artifacts": repo.list_artifacts(project_id)}


@router.get("/api/artifacts/{artifact_id}/versions")
def list_versions(artifact_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    return {"versions": repo.list_versions(artifact_id)}


@router.get("/api/doc-versions/{version_id}/pdf")
def download_pdf(version_id: str, _=Depends(require_api_key)) -> Dict[str, Any]:
    return {"version_id": version_id}
