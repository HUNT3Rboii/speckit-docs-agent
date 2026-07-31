"""
Unit tests for ArtifactCacheService.

Tests the core caching functionality including:
- Cache lookup by content hash
- Artifact storage with metadata
- Artifact retrieval by ID and hash
- Edge cases (missing files, corrupted metadata, etc.)
"""

import json
import os
from pathlib import Path

import pytest

from app.services.artifact_cache import ArtifactCacheService


@pytest.fixture
def cache_service(tmp_path):
    """Create an ArtifactCacheService with a temporary cache directory."""
    cache_dir = tmp_path / "artifact_cache"
    return ArtifactCacheService(cache_dir=str(cache_dir))


@pytest.fixture
def sample_pdf(tmp_path):
    """Create a sample PDF file for testing."""
    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_text("Mock PDF content")
    return str(pdf_path)


def test_check_cache_returns_none_when_hash_not_found(cache_service):
    """Test that check_cache returns None when content hash doesn't exist."""
    result = cache_service.check_cache("nonexistent_hash")
    assert result is None


def test_store_artifact_creates_cache_directory(cache_service, sample_pdf):
    """Test that storing an artifact creates the appropriate directory structure."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    cached_path = cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Verify directory structure was created
    hash_dir = cache_service.cache_dir / content_hash
    assert hash_dir.exists()
    assert (hash_dir / "artifact.pdf").exists()
    assert (hash_dir / "metadata.json").exists()


def test_store_artifact_copies_pdf_content(cache_service, sample_pdf):
    """Test that the PDF content is correctly copied to cache."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    cached_path = cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Verify content was copied
    with open(cached_path, 'r') as f:
        content = f.read()
    assert content == "Mock PDF content"


def test_store_artifact_saves_metadata(cache_service, sample_pdf):
    """Test that metadata is correctly saved with artifact."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    extra_metadata = {"source_path": "/docs/spec.md", "artifact_type": "spec"}
    
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id, metadata=extra_metadata)
    
    # Verify metadata was saved
    metadata_file = cache_service.cache_dir / content_hash / "metadata.json"
    with open(metadata_file, 'r') as f:
        metadata = json.load(f)
    
    assert metadata["artifact_id"] == artifact_id
    assert metadata["content_hash"] == content_hash
    assert metadata["source_path"] == "/docs/spec.md"
    assert metadata["artifact_type"] == "spec"


def test_store_artifact_raises_error_for_missing_pdf(cache_service):
    """Test that storing raises FileNotFoundError if PDF doesn't exist."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    nonexistent_path = "/path/that/does/not/exist.pdf"
    
    with pytest.raises(FileNotFoundError):
        cache_service.store_artifact(content_hash, nonexistent_path, artifact_id)


def test_check_cache_returns_artifact_id_after_storage(cache_service, sample_pdf):
    """Test that check_cache finds artifacts after they are stored."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    result = cache_service.check_cache(content_hash)
    assert result == artifact_id


def test_get_artifact_path_returns_none_when_not_found(cache_service):
    """Test that get_artifact_path returns None for non-existent artifacts."""
    result = cache_service.get_artifact_path("nonexistent-artifact")
    assert result is None


def test_get_artifact_path_returns_path_when_found(cache_service, sample_pdf):
    """Test that get_artifact_path retrieves correct path for stored artifacts."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    cached_path = cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    result = cache_service.get_artifact_path(artifact_id)
    assert result == cached_path


def test_get_artifact_by_hash_returns_none_when_not_found(cache_service):
    """Test that get_artifact_by_hash returns None for non-existent hashes."""
    result = cache_service.get_artifact_by_hash("nonexistent_hash")
    assert result is None


def test_get_artifact_by_hash_returns_path_when_found(cache_service, sample_pdf):
    """Test that get_artifact_by_hash retrieves correct path."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    cached_path = cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    result = cache_service.get_artifact_by_hash(content_hash)
    assert result == cached_path


def test_get_metadata_returns_none_when_not_found(cache_service):
    """Test that get_metadata returns None for non-existent hashes."""
    result = cache_service.get_metadata("nonexistent_hash")
    assert result is None


def test_get_metadata_returns_metadata_when_found(cache_service, sample_pdf):
    """Test that get_metadata retrieves stored metadata."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    extra_metadata = {"custom_field": "custom_value"}
    
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id, metadata=extra_metadata)
    
    result = cache_service.get_metadata(content_hash)
    assert result is not None
    assert result["artifact_id"] == artifact_id
    assert result["custom_field"] == "custom_value"


def test_check_cache_handles_corrupted_metadata(cache_service, sample_pdf):
    """Test that check_cache handles corrupted metadata gracefully."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    # Store artifact first
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Corrupt metadata file
    metadata_file = cache_service.cache_dir / content_hash / "metadata.json"
    metadata_file.write_text("{ invalid json")
    
    # Should return None instead of crashing
    result = cache_service.check_cache(content_hash)
    assert result is None


def test_get_artifact_path_handles_corrupted_metadata(cache_service, sample_pdf):
    """Test that get_artifact_path handles corrupted metadata gracefully."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    # Store artifact first
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Corrupt metadata file
    metadata_file = cache_service.cache_dir / content_hash / "metadata.json"
    metadata_file.write_text("{ invalid json")
    
    # Should return None instead of crashing
    result = cache_service.get_artifact_path(artifact_id)
    assert result is None


def test_get_metadata_handles_corrupted_metadata(cache_service, sample_pdf):
    """Test that get_metadata handles corrupted metadata gracefully."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    # Store artifact first
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Corrupt metadata file
    metadata_file = cache_service.cache_dir / content_hash / "metadata.json"
    metadata_file.write_text("{ invalid json")
    
    # Should return None instead of crashing
    result = cache_service.get_metadata(content_hash)
    assert result is None


def test_store_artifact_overwrites_existing_cache(cache_service, sample_pdf, tmp_path):
    """Test that storing an artifact with same hash overwrites previous version."""
    content_hash = "abc123def456"
    artifact_id_1 = "artifact-1"
    artifact_id_2 = "artifact-2"
    
    # Store first artifact
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id_1)
    
    # Create a different PDF
    new_pdf = tmp_path / "new_test.pdf"
    new_pdf.write_text("Different PDF content")
    
    # Store second artifact with same hash
    cache_service.store_artifact(content_hash, str(new_pdf), artifact_id_2)
    
    # Should find the newer artifact
    result = cache_service.check_cache(content_hash)
    assert result == artifact_id_2
    
    # Content should be updated
    cached_path = cache_service.get_artifact_by_hash(content_hash)
    with open(cached_path, 'r') as f:
        content = f.read()
    assert content == "Different PDF content"


def test_clear_cache_removes_all_artifacts(cache_service, sample_pdf, tmp_path):
    """Test that clear_cache removes all cached artifacts."""
    # Store multiple artifacts
    for i in range(3):
        content_hash = f"hash{i}"
        artifact_id = f"artifact-{i}"
        cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Clear cache
    count = cache_service.clear_cache()
    
    assert count == 3
    
    # Verify all artifacts are gone
    for i in range(3):
        result = cache_service.check_cache(f"hash{i}")
        assert result is None


def test_multiple_artifacts_with_different_hashes(cache_service, sample_pdf, tmp_path):
    """Test storing and retrieving multiple artifacts with different hashes."""
    artifacts = [
        ("hash1", "artifact-1"),
        ("hash2", "artifact-2"),
        ("hash3", "artifact-3"),
    ]
    
    # Store all artifacts
    for content_hash, artifact_id in artifacts:
        cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Verify all can be retrieved by hash
    for content_hash, artifact_id in artifacts:
        result = cache_service.check_cache(content_hash)
        assert result == artifact_id
    
    # Verify all can be retrieved by artifact_id
    for content_hash, artifact_id in artifacts:
        result = cache_service.get_artifact_path(artifact_id)
        assert result is not None
        assert content_hash in result


def test_cache_directory_environment_variable(tmp_path, monkeypatch, sample_pdf):
    """Test that cache directory can be set via environment variable."""
    custom_cache_dir = tmp_path / "custom_cache"
    monkeypatch.setenv("ARTIFACT_CACHE_DIR", str(custom_cache_dir))
    
    # Create service without explicit cache_dir
    service = ArtifactCacheService()
    
    # Store artifact
    service.store_artifact("hash1", sample_pdf, "artifact-1")
    
    # Verify it used the custom directory
    assert custom_cache_dir.exists()
    assert (custom_cache_dir / "hash1" / "artifact.pdf").exists()


def test_get_artifact_path_skips_missing_pdf(cache_service, sample_pdf):
    """Test that get_artifact_path returns None if metadata exists but PDF is missing."""
    content_hash = "abc123def456"
    artifact_id = "artifact-1"
    
    # Store artifact
    cache_service.store_artifact(content_hash, sample_pdf, artifact_id)
    
    # Delete the PDF but keep metadata
    pdf_path = cache_service.cache_dir / content_hash / "artifact.pdf"
    pdf_path.unlink()
    
    # Should return None since PDF is missing
    result = cache_service.get_artifact_path(artifact_id)
    assert result is None
