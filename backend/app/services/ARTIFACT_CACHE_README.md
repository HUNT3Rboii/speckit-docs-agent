# ArtifactCacheService

The `ArtifactCacheService` provides content hash-based deduplication for PDF artifacts in the Agentic PDF Pipeline. This service implements **Requirement 1: Content Hash Deduplication** from the design specification.

## Purpose

When markdown content is processed multiple times without changes, the service allows the system to skip all processing (including AI calls) and return the cached artifact. This significantly improves performance and reduces API costs.

## Features

- **Content Hash Lookup**: Check if an artifact exists for a given content hash
- **Artifact Storage**: Store PDFs with metadata indexed by content hash
- **Artifact Retrieval**: Retrieve artifacts by ID or content hash
- **Metadata Preservation**: Store and retrieve rich metadata about artifacts
- **Robust Error Handling**: Gracefully handles corrupted metadata and missing files

## Storage Structure

```
artifact_cache/
├── {content_hash_1}/
│   ├── artifact.pdf
│   └── metadata.json
├── {content_hash_2}/
│   ├── artifact.pdf
│   └── metadata.json
└── ...
```

## Usage Example

### Basic Pipeline Integration

```python
from app.services.artifact_cache import ArtifactCacheService
import hashlib

# Initialize the service
cache_service = ArtifactCacheService()

# Compute content hash from markdown
markdown_content = "# My Document\nContent here..."
content_hash = hashlib.sha256(markdown_content.encode('utf-8')).hexdigest()

# Step 1: Check if artifact exists in cache
cached_artifact_id = cache_service.check_cache(content_hash)

if cached_artifact_id:
    # Cache hit - retrieve existing artifact
    pdf_path = cache_service.get_artifact_path(cached_artifact_id)
    print(f"Using cached artifact: {pdf_path}")
else:
    # Cache miss - process document
    # ... AI transformation, validation, rendering ...
    pdf_path = "/path/to/generated.pdf"
    artifact_id = "artifact-123"
    
    # Store in cache for future use
    cache_service.store_artifact(
        content_hash=content_hash,
        pdf_path=pdf_path,
        artifact_id=artifact_id,
        metadata={
            "source_path": "/docs/spec.md",
            "artifact_type": "spec",
            "project_id": "proj-1",
            "generated_at": "2024-01-15T10:30:00Z"
        }
    )
    print(f"Stored new artifact in cache: {artifact_id}")
```

### Complete Deduplication Workflow

```python
from app.services.artifact_cache import ArtifactCacheService
import hashlib

def process_document_with_cache(markdown_content: str, source_path: str, project_id: str):
    """
    Process a markdown document with content hash deduplication.
    
    This implements Requirement 1: Content Hash Deduplication.
    """
    cache_service = ArtifactCacheService()
    
    # Step 1: Compute content hash (Requirement 1.1)
    content_hash = hashlib.sha256(markdown_content.encode('utf-8')).hexdigest()
    
    # Step 2: Check cache (Requirement 1.2)
    cached_artifact_id = cache_service.check_cache(content_hash)
    
    if cached_artifact_id:
        # Requirement 1.2: Skip all processing and return existing artifact
        print(f"Cache hit for {source_path}")
        return {
            "artifact_id": cached_artifact_id,
            "pdf_path": cache_service.get_artifact_path(cached_artifact_id),
            "from_cache": True
        }
    
    # Cache miss - perform full processing
    print(f"Cache miss for {source_path} - processing...")
    
    # ... AI transformation ...
    enriched_json = call_ai_transformation(markdown_content)
    
    # ... Validation ...
    validated_json = validate_enriched_json(enriched_json, markdown_content)
    
    # ... Rendering ...
    pdf_path = render_pdf(validated_json)
    
    # Generate artifact ID
    artifact_id = f"artifact-{generate_id()}"
    
    # Step 3: Store with content hash (Requirement 1.3)
    cache_service.store_artifact(
        content_hash=content_hash,
        pdf_path=pdf_path,
        artifact_id=artifact_id,
        metadata={
            "source_path": source_path,
            "project_id": project_id,
            "artifact_type": "spec",
        }
    )
    
    return {
        "artifact_id": artifact_id,
        "pdf_path": pdf_path,
        "from_cache": False
    }
```

## API Reference

### `check_cache(content_hash: str) -> Optional[str]`

Check if an artifact exists for the given content hash.

**Parameters:**
- `content_hash`: SHA-256 hash of markdown content

**Returns:**
- Artifact ID if found, `None` otherwise

**Example:**
```python
artifact_id = cache_service.check_cache("abc123...")
if artifact_id:
    print(f"Found cached artifact: {artifact_id}")
```

### `store_artifact(content_hash: str, pdf_path: str, artifact_id: str, metadata: dict = None) -> str`

Store an artifact in the cache with its content hash.

**Parameters:**
- `content_hash`: SHA-256 hash of markdown content
- `pdf_path`: Path to the PDF file to cache
- `artifact_id`: Unique identifier for the artifact
- `metadata`: Optional additional metadata

**Returns:**
- Path to the cached artifact

**Raises:**
- `FileNotFoundError`: If pdf_path does not exist

**Example:**
```python
cached_path = cache_service.store_artifact(
    content_hash="abc123...",
    pdf_path="/tmp/generated.pdf",
    artifact_id="artifact-456",
    metadata={"source": "spec.md"}
)
```

### `get_artifact_path(artifact_id: str) -> Optional[str]`

Retrieve the path to a cached artifact by its ID.

**Parameters:**
- `artifact_id`: The artifact ID to search for

**Returns:**
- Path to the cached PDF if found, `None` otherwise

**Example:**
```python
pdf_path = cache_service.get_artifact_path("artifact-456")
if pdf_path:
    print(f"Artifact located at: {pdf_path}")
```

### `get_artifact_by_hash(content_hash: str) -> Optional[str]`

Retrieve the path to a cached artifact by its content hash.

**Parameters:**
- `content_hash`: SHA-256 hash of the markdown content

**Returns:**
- Path to the cached PDF if found, `None` otherwise

### `get_metadata(content_hash: str) -> Optional[dict]`

Retrieve metadata for a cached artifact.

**Parameters:**
- `content_hash`: SHA-256 hash of the markdown content

**Returns:**
- Metadata dictionary if found, `None` otherwise

**Example:**
```python
metadata = cache_service.get_metadata("abc123...")
if metadata:
    print(f"Artifact type: {metadata['artifact_type']}")
    print(f"Source path: {metadata['source_path']}")
```

### `clear_cache() -> int`

Clear all cached artifacts.

**Returns:**
- Number of artifacts removed

**Example:**
```python
count = cache_service.clear_cache()
print(f"Removed {count} cached artifacts")
```

## Configuration

The cache directory can be configured in two ways:

1. **Constructor parameter:**
   ```python
   cache_service = ArtifactCacheService(cache_dir="/custom/cache/path")
   ```

2. **Environment variable:**
   ```bash
   export ARTIFACT_CACHE_DIR=/custom/cache/path
   ```

Default: `artifact_cache/` in the current working directory

## Error Handling

The service handles errors gracefully:

- **Missing files**: Returns `None` instead of raising exceptions
- **Corrupted metadata**: Treats as cache miss and continues
- **Invalid JSON**: Skips corrupted entries during lookups
- **File system errors**: Propagates only on storage operations

## Requirements Mapping

This service implements the following requirements from the design specification:

- **Requirement 1.1**: Computes Content_Hash (SHA-256) before invoking Extension_AI
- **Requirement 1.2**: Checks if Content_Hash matches stored hash for cache hit
- **Requirement 1.3**: Stores Content_Hash with each artifact for future comparison
- **Requirement 1.4**: Reprocesses fully when content changes by any amount

## Testing

Comprehensive tests are available:

- **Unit tests**: `tests/unit/test_artifact_cache.py` (20 tests)
- **Integration tests**: `tests/integration/test_artifact_cache_integration.py` (6 tests)

Run tests:
```bash
pytest tests/unit/test_artifact_cache.py -v
pytest tests/integration/test_artifact_cache_integration.py -v
```

## Performance Considerations

- **Cache lookups**: O(1) for hash-based lookups, O(n) for ID-based lookups
- **Storage**: Minimal overhead, uses filesystem directly
- **Memory**: Low memory footprint, metadata loaded on-demand
- **Disk usage**: One copy per unique content hash

## Future Enhancements

Potential improvements for future iterations:

- LRU cache eviction policy for disk space management
- Database backend option for faster ID-based lookups
- Cache statistics and monitoring
- Compression for stored PDFs
- Distributed cache support
