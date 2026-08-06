"""
Tests for ArtifactRepository.set_metadata_flag - the read-modify-write
primitive the cancel/retry feature uses to flip one metadata key (e.g.
cancel_requested) without requiring the caller to already know/resend the
artifact's other metadata.
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


def _make_artifact(repo, artifact_id="artifact-1", metadata=None):
    return repo.upsert_artifact(
        {
            "id": artifact_id,
            "project_id": "proj-1",
            "source_path": "docs/spec.md",
            "source_tool": "speckit",
            "artifact_type": "spec",
            "status": "processing",
            "content_hash": "abc123",
            "metadata": metadata or {},
        }
    )


def test_sets_the_key_and_returns_the_updated_artifact(repo):
    _make_artifact(repo)
    result = repo.set_metadata_flag("artifact-1", "cancel_requested", True)
    assert result["metadata"]["cancel_requested"] is True


def test_unknown_artifact_returns_none(repo):
    assert repo.set_metadata_flag("does-not-exist", "cancel_requested", True) is None


def test_leaves_sibling_metadata_keys_untouched(repo):
    _make_artifact(repo, metadata={"current_step": "validating", "attempt": 2})
    result = repo.set_metadata_flag("artifact-1", "cancel_requested", True)
    assert result["metadata"]["current_step"] == "validating"
    assert result["metadata"]["attempt"] == 2
    assert result["metadata"]["cancel_requested"] is True


def test_change_is_visible_via_get_artifact_by_id(repo):
    _make_artifact(repo)
    repo.set_metadata_flag("artifact-1", "cancel_requested", True)
    artifact = repo.get_artifact_by_id("artifact-1")
    assert artifact["metadata"]["cancel_requested"] is True


def test_can_overwrite_an_existing_key(repo):
    _make_artifact(repo, metadata={"cancel_requested": True})
    result = repo.set_metadata_flag("artifact-1", "cancel_requested", False)
    assert result["metadata"]["cancel_requested"] is False


def test_does_not_disturb_tags(repo):
    """metadata and tags are separate columns - confirm this method (which
    only ever touches metadata) never interferes with tags set beforehand."""
    _make_artifact(repo)
    repo.set_artifact_tags("artifact-1", ["release"])
    repo.set_metadata_flag("artifact-1", "cancel_requested", True)
    artifact = repo.get_artifact_by_id("artifact-1")
    assert artifact["tags"] == ["release"]
