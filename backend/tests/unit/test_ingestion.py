from app.services.ingestion import IngestionService
from app.repositories.artifact_repo import ArtifactRepository


def test_classify_known_artifact_names() -> None:
    repo = ArtifactRepository()
    service = IngestionService(repo)
    assert service.classify("specs/001-feature/spec.md", "") == "spec"
    assert service.classify("specs/001-feature/plan.md", "") == "plan"
    assert service.classify("specs/001-feature/tasks/001.md", "") == "task"
    assert service.classify("specs/001-feature/constitution.md", "") == "constitution"


def test_classify_speckit_flat_tasks_md_as_task() -> None:
    """Regression: Speckit's own /speckit.tasks command generates a flat
    specs/NNN-feature/tasks.md (no "/tasks/" directory segment) - this used
    to only match the "/tasks/" substring or Kiro's identically-named file,
    silently falling through to "other" for every real Speckit tasks.md."""
    repo = ArtifactRepository()
    service = IngestionService(repo)
    assert service.classify("specs/001-feature/tasks.md", "") == "task"
    assert service.classify(".kiro/specs/001-feature/tasks.md", "") == "task"


def test_classify_unknown_artifact_names_falls_back_to_other() -> None:
    repo = ArtifactRepository()
    service = IngestionService(repo)
    assert service.classify("specs/001-feature/notes.md", "") == "other"
