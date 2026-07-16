from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.repositories.artifact_repo import ArtifactRepository
from app.services.rendering import RenderingService


class PersistenceService:
    def __init__(self, repo: ArtifactRepository, rendering_service: RenderingService) -> None:
        self.repo = repo
        self.rendering_service = rendering_service

    def persist(self, project_id: str, artifact_payload: Dict[str, Any], structured_json: Dict[str, Any], commit_hash: Optional[str] = None) -> Dict[str, Any]:
        artifact_id = artifact_payload["id"]
        render_result = self.rendering_service.render(artifact_id, structured_json, artifact_payload["artifact_type"], artifact_payload["source_path"], commit_hash)
        version = {
            "id": f"version-{artifact_id}-{len(self.repo.list_versions(artifact_id)) + 1}",
            "artifact_id": artifact_id,
            "version_no": len(self.repo.list_versions(artifact_id)) + 1,
            "pdf_path": render_result["pdf_path"],
            "structured_json": structured_json,
            "generated_by": "agent",
            "generated_at": datetime.utcnow().isoformat(),
        }
        self.repo.add_doc_version(artifact_id, version)
        artifact_payload["status"] = "rendered"
        self.repo.upsert_artifact(artifact_payload)
        return {"artifact": artifact_payload, "version": version}
