"""
Tests for artifact tagging (ArtifactRepository.set_artifact_tags), covering
the one property the design specifically depends on: tags live in their own
column that upsert_artifact() never references, so re-processing a source
file (which happens on every save, via the extension) can never silently
wipe out tags a user added through the frontend.
"""

import os
import tempfile

import pytest

from app.repositories.artifact_repo import ArtifactRepository


@pytest.fixture
def repo():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    try:
        yield ArtifactRepository(db_path=path)
    finally:
        for _ in range(10):
            try:
                os.remove(path)
                break
            except OSError:
                import time

                time.sleep(0.05)


def _make_artifact(repo, artifact_id="artifact-1"):
    return repo.upsert_artifact(
        {
            "id": artifact_id,
            "project_id": "proj-1",
            "source_path": "docs/spec.md",
            "source_tool": "speckit",
            "artifact_type": "spec",
            "status": "completed",
            "content_hash": "abc123",
        }
    )


def test_new_artifact_has_no_tags(repo):
    _make_artifact(repo)
    artifact = repo.get_artifact_by_id("artifact-1")
    assert artifact["tags"] == []


def test_set_artifact_tags_returns_the_normalized_list(repo):
    _make_artifact(repo)
    result = repo.set_artifact_tags("artifact-1", ["release", "important"])
    assert result == ["important", "release"]


def test_set_artifact_tags_dedupes_and_strips_whitespace(repo):
    _make_artifact(repo)
    result = repo.set_artifact_tags("artifact-1", ["release", " release ", "release", "", "  "])
    assert result == ["release"]


def test_set_artifact_tags_on_unknown_artifact_returns_none(repo):
    assert repo.set_artifact_tags("artifact-does-not-exist", ["x"]) is None


def test_tags_are_visible_via_get_artifact_by_id(repo):
    _make_artifact(repo)
    repo.set_artifact_tags("artifact-1", ["release"])
    artifact = repo.get_artifact_by_id("artifact-1")
    assert artifact["tags"] == ["release"]


def test_tags_are_visible_via_list_artifacts(repo):
    _make_artifact(repo)
    repo.set_artifact_tags("artifact-1", ["release"])
    artifacts = repo.list_artifacts("proj-1")
    assert artifacts[0]["tags"] == ["release"]


def test_reprocessing_the_source_file_does_not_wipe_tags(repo):
    """The critical guarantee: upsert_artifact() (called every time the
    extension re-processes a saved file) must never touch the tags column,
    even though it rewrites every other field on every call."""
    _make_artifact(repo)
    repo.set_artifact_tags("artifact-1", ["release", "important"])

    # Simulate the file being saved and re-processed again - same id,
    # different content_hash/status, no "tags" key in the payload at all
    # (the ingestion pipeline never sets it).
    repo.upsert_artifact(
        {
            "id": "artifact-1",
            "project_id": "proj-1",
            "source_path": "docs/spec.md",
            "source_tool": "speckit",
            "artifact_type": "spec",
            "status": "completed",
            "content_hash": "def456",
        }
    )

    artifact = repo.get_artifact_by_id("artifact-1")
    assert artifact["content_hash"] == "def456"
    assert artifact["tags"] == ["important", "release"]
