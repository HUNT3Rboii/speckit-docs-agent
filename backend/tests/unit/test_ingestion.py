from app.services.ingestion import IngestionService
from app.repositories.artifact_repo import ArtifactRepository


def test_classify_known_artifact_names() -> None:
    repo = ArtifactRepository()
    service = IngestionService(repo)
    assert service.classify("specs/001-feature/spec.md", "") == "spec"
    assert service.classify("specs/001-feature/plan.md", "") == "plan"
    assert service.classify("specs/001-feature/tasks/001.md", "") == "task"
    assert service.classify("specs/001-feature/constitution.md", "") == "constitution"


def test_classify_unknown_artifact_names_falls_back_to_other() -> None:
    repo = ArtifactRepository()
    service = IngestionService(repo)
    assert service.classify("specs/001-feature/notes.md", "") == "other"
