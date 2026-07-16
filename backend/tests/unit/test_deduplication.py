from app.repositories.artifact_repo import ArtifactRepository
from app.services.ingestion import IngestionService


def test_should_skip_when_content_hash_matches_existing_artifact() -> None:
    repo = ArtifactRepository()
    service = IngestionService(repo)
    project_id = repo.create_project("demo")["id"]

    repo.upsert_artifact(
        {
            "id": "artifact-1",
            "project_id": project_id,
            "source_path": "specs/001-feature/spec.md",
            "source_tool": "speckit",
            "artifact_type": "spec",
            "status": "rendered",
            "content_hash": service.compute_content_hash("same content"),
        }
    )

    skipped, artifact = service.should_skip(project_id, "specs/001-feature/spec.md", service.compute_content_hash("same content"))

    assert skipped is True
    assert artifact is not None
    assert artifact["id"] == "artifact-1"
