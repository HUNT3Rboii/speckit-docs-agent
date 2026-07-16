from app.repositories.artifact_repo import ArtifactRepository
from app.services.persistence import PersistenceService
from app.services.rendering import RenderingService


def test_persistence_renders_and_records_version(tmp_path) -> None:
    repo = ArtifactRepository(db_path=str(tmp_path / "docs.sqlite3"))
    rendering_service = RenderingService(str(tmp_path / "pdfs"))
    persistence_service = PersistenceService(repo, rendering_service)

    project = repo.create_project("demo")
    artifact_payload = {
        "id": "artifact-1",
        "project_id": project["id"],
        "source_path": "specs/001-documentation-agent/spec.md",
        "source_tool": "speckit",
        "artifact_type": "spec",
        "status": "pending",
        "content_hash": "abc",
    }
    structured_json = {
        "title": "Demo",
        "abstract": "A sample document",
        "sections": [{"heading": "Overview", "content": "Hello from the pipeline", "type": "normal"}],
    }

    result = persistence_service.persist(project["id"], artifact_payload, structured_json, "abc123")

    assert result["artifact"]["status"] == "rendered"
    assert len(repo.list_versions("artifact-1")) == 1
    assert result["version"]["version_no"] == 1
