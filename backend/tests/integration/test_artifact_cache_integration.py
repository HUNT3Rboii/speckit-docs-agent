"""
Integration tests for ArtifactCacheService.

These tests verify the service works correctly in realistic scenarios
that mimic actual usage in the pipeline.
"""

import hashlib
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
def sample_markdown():
    """Sample markdown content for testing."""
    return """# Sample Document

This is a sample markdown document for testing the artifact cache.

## Section 1
Content for section 1.

## Section 2
Content for section 2.
"""


@pytest.fixture
def create_pdf(tmp_path):
    """Factory fixture to create PDF files with specific content."""
    def _create_pdf(content: str, filename: str = "test.pdf"):
        pdf_path = tmp_path / filename
        pdf_path.write_text(f"PDF Content: {content}")
        return str(pdf_path)
    return _create_pdf


def compute_content_hash(content: str) -> str:
    """Compute SHA-256 hash of content (mimics ContentHashService)."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


def test_end_to_end_cache_workflow(cache_service, sample_markdown, create_pdf):
    """
    Test complete workflow: compute hash, check cache, store artifact, check again.
    
    This simulates Requirement 1: Content Hash Deduplication.
    """
    # Step 1: Compute content hash
    content_hash = compute_content_hash(sample_markdown)
    
    # Step 2: Check cache (should be empty initially)
    cached_artifact = cache_service.check_cache(content_hash)
    assert cached_artifact is None, "Cache should be empty initially"
    
    # Step 3: Process document and create PDF
    pdf_path = create_pdf(sample_markdown, "document-v1.pdf")
    artifact_id = "artifact-123"
    
    # Step 4: Store artifact with hash
    cached_path = cache_service.store_artifact(
        content_hash=content_hash,
        pdf_path=pdf_path,
        artifact_id=artifact_id,
        metadata={
            "source_path": "/docs/sample.md",
            "artifact_type": "spec",
            "project_id": "proj-1"
        }
    )
    
    # Step 5: Check cache again (should find it now)
    cached_artifact = cache_service.check_cache(content_hash)
    assert cached_artifact == artifact_id, "Cache should return artifact ID"
    
    # Step 6: Retrieve artifact path
    retrieved_path = cache_service.get_artifact_path(artifact_id)
    assert retrieved_path == cached_path, "Should retrieve same cached path"


def test_unchanged_content_cache_hit(cache_service, sample_markdown, create_pdf):
    """
    Test that unchanged content results in cache hit (Requirement 1.2).
    
    When markdown content is provided and Content_Hash matches stored hash,
    system should skip processing and return existing artifact.
    """
    # First processing
    content_hash = compute_content_hash(sample_markdown)
    pdf_path_1 = create_pdf(sample_markdown, "first.pdf")
    artifact_id_1 = "artifact-1"
    
    cache_service.store_artifact(content_hash, pdf_path_1, artifact_id_1)
    
    # Second processing with SAME content
    content_hash_2 = compute_content_hash(sample_markdown)
    
    # Hashes should match
    assert content_hash == content_hash_2
    
    # Cache check should find existing artifact
    cached_artifact = cache_service.check_cache(content_hash_2)
    assert cached_artifact == artifact_id_1
    
    # Can retrieve the artifact without reprocessing
    retrieved_path = cache_service.get_artifact_path(cached_artifact)
    assert retrieved_path is not None


def test_changed_content_cache_miss(cache_service, sample_markdown, create_pdf):
    """
    Test that changed content results in cache miss (Requirement 1.5).
    
    When content changes by any amount, system should reprocess fully.
    """
    # First processing
    content_hash_1 = compute_content_hash(sample_markdown)
    pdf_path_1 = create_pdf(sample_markdown, "first.pdf")
    artifact_id_1 = "artifact-1"
    
    cache_service.store_artifact(content_hash_1, pdf_path_1, artifact_id_1)
    
    # Modify content (even slightly)
    modified_markdown = sample_markdown + "\n## New Section\nNew content added."
    content_hash_2 = compute_content_hash(modified_markdown)
    
    # Hashes should NOT match
    assert content_hash_1 != content_hash_2
    
    # Cache check should NOT find artifact
    cached_artifact = cache_service.check_cache(content_hash_2)
    assert cached_artifact is None
    
    # Would need to process and store new artifact
    pdf_path_2 = create_pdf(modified_markdown, "second.pdf")
    artifact_id_2 = "artifact-2"
    cache_service.store_artifact(content_hash_2, pdf_path_2, artifact_id_2)
    
    # Now both artifacts exist independently
    assert cache_service.check_cache(content_hash_1) == artifact_id_1
    assert cache_service.check_cache(content_hash_2) == artifact_id_2


def test_multiple_documents_cached_independently(cache_service, create_pdf):
    """
    Test that multiple different documents are cached independently.
    """
    documents = [
        ("# Document A\nContent A", "doc-a.pdf", "artifact-a"),
        ("# Document B\nContent B", "doc-b.pdf", "artifact-b"),
        ("# Document C\nContent C", "doc-c.pdf", "artifact-c"),
    ]
    
    stored_hashes = []
    
    # Store all documents
    for content, pdf_name, artifact_id in documents:
        content_hash = compute_content_hash(content)
        stored_hashes.append(content_hash)
        pdf_path = create_pdf(content, pdf_name)
        cache_service.store_artifact(content_hash, pdf_path, artifact_id)
    
    # Verify all are cached independently
    for i, (content, pdf_name, artifact_id) in enumerate(documents):
        content_hash = compute_content_hash(content)
        cached_artifact = cache_service.check_cache(content_hash)
        assert cached_artifact == artifact_id
        
        # Verify metadata is correct
        metadata = cache_service.get_metadata(content_hash)
        assert metadata["artifact_id"] == artifact_id
        assert metadata["content_hash"] == content_hash


def test_cache_metadata_preserves_pipeline_context(cache_service, sample_markdown, create_pdf):
    """
    Test that metadata storage preserves important pipeline context.
    """
    content_hash = compute_content_hash(sample_markdown)
    pdf_path = create_pdf(sample_markdown)
    artifact_id = "artifact-456"
    
    # Store with rich metadata
    metadata = {
        "source_path": "/specs/pipeline/design.md",
        "artifact_type": "design_doc",
        "project_id": "proj-pipeline",
        "commit_hash": "abc123def456",
        "generated_at": "2024-01-15T10:30:00Z",
        "generated_by": "agent",
    }
    
    cache_service.store_artifact(content_hash, pdf_path, artifact_id, metadata=metadata)
    
    # Retrieve and verify all metadata is preserved
    retrieved_metadata = cache_service.get_metadata(content_hash)
    
    assert retrieved_metadata["artifact_id"] == artifact_id
    assert retrieved_metadata["source_path"] == "/specs/pipeline/design.md"
    assert retrieved_metadata["artifact_type"] == "design_doc"
    assert retrieved_metadata["project_id"] == "proj-pipeline"
    assert retrieved_metadata["commit_hash"] == "abc123def456"
    assert retrieved_metadata["generated_at"] == "2024-01-15T10:30:00Z"
    assert retrieved_metadata["generated_by"] == "agent"


def test_cache_survives_multiple_lookups(cache_service, sample_markdown, create_pdf):
    """
    Test that cached artifacts can be looked up multiple times without issues.
    """
    content_hash = compute_content_hash(sample_markdown)
    pdf_path = create_pdf(sample_markdown)
    artifact_id = "artifact-persistent"
    
    cache_service.store_artifact(content_hash, pdf_path, artifact_id)
    
    # Perform multiple lookups
    for i in range(10):
        cached_artifact = cache_service.check_cache(content_hash)
        assert cached_artifact == artifact_id
        
        retrieved_path = cache_service.get_artifact_path(artifact_id)
        assert retrieved_path is not None
        assert Path(retrieved_path).exists()
