"""
ArtifactCacheService - Manages artifact storage and content hash lookups.

This service implements content hash-based deduplication for PDF artifacts.
It stores artifacts on the filesystem with JSON metadata for efficient lookups.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Optional


class ArtifactCacheService:
    """
    Service for caching and retrieving artifacts using content hashes.
    
    This service enables deduplication by storing artifacts with their content hash
    metadata. When the same content is processed again, it can be retrieved from
    cache without reprocessing.
    
    Storage structure:
        cache_dir/
            {content_hash}/
                artifact.pdf
                metadata.json
    """
    
    def __init__(self, cache_dir: Optional[str] = None) -> None:
        """
        Initialize the artifact cache service.
        
        Args:
            cache_dir: Directory to store cached artifacts. 
                      Defaults to 'artifact_cache' in current working directory.
        """
        self.cache_dir = Path(cache_dir or os.getenv("ARTIFACT_CACHE_DIR") or os.path.join(os.getcwd(), "artifact_cache"))
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def check_cache(self, content_hash: str) -> Optional[str]:
        """
        Check if an artifact with the given content hash exists in cache.
        
        This method implements Requirements 1.2 and 1.3: checking stored hash
        for cache hit detection.
        
        Args:
            content_hash: SHA-256 hash of the markdown content
            
        Returns:
            Artifact ID if found in cache, None otherwise
        """
        hash_dir = self.cache_dir / content_hash
        metadata_file = hash_dir / "metadata.json"
        
        if not metadata_file.exists():
            return None
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                return metadata.get("artifact_id")
        except (json.JSONDecodeError, IOError):
            # If metadata is corrupted, treat as cache miss
            return None
    
    def store_artifact(
        self, 
        content_hash: str, 
        pdf_path: str, 
        artifact_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Store an artifact in the cache with its content hash.
        
        This method implements Requirement 1.3: storing Content_Hash with each 
        artifact for future comparison.
        
        Args:
            content_hash: SHA-256 hash of the markdown content
            pdf_path: Path to the PDF file to cache
            artifact_id: Unique identifier for this artifact
            metadata: Optional additional metadata to store
            
        Returns:
            Path to the cached artifact
            
        Raises:
            FileNotFoundError: If pdf_path does not exist
            IOError: If file operations fail
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        # Create directory for this content hash
        hash_dir = self.cache_dir / content_hash
        hash_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy PDF to cache
        cached_pdf_path = hash_dir / "artifact.pdf"
        shutil.copy2(pdf_path, cached_pdf_path)
        
        # Store metadata
        metadata_obj = {
            "artifact_id": artifact_id,
            "content_hash": content_hash,
            "original_path": pdf_path,
            "cached_path": str(cached_pdf_path),
            **(metadata or {})
        }
        
        metadata_file = hash_dir / "metadata.json"
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata_obj, f, indent=2, ensure_ascii=False)
        
        return str(cached_pdf_path)
    
    def get_artifact_path(self, artifact_id: str) -> Optional[str]:
        """
        Retrieve the path to a cached artifact by its artifact ID.
        
        This method searches through cached artifacts to find one matching
        the given artifact_id.
        
        Args:
            artifact_id: The artifact ID to search for
            
        Returns:
            Path to the cached PDF if found, None otherwise
        """
        # Search through all cached hash directories
        for hash_dir in self.cache_dir.iterdir():
            if not hash_dir.is_dir():
                continue
            
            metadata_file = hash_dir / "metadata.json"
            if not metadata_file.exists():
                continue
            
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                    if metadata.get("artifact_id") == artifact_id:
                        cached_pdf = hash_dir / "artifact.pdf"
                        if cached_pdf.exists():
                            return str(cached_pdf)
            except (json.JSONDecodeError, IOError):
                # Skip corrupted metadata files
                continue
        
        return None
    
    def get_artifact_by_hash(self, content_hash: str) -> Optional[str]:
        """
        Retrieve the path to a cached artifact by its content hash.
        
        Args:
            content_hash: SHA-256 hash of the markdown content
            
        Returns:
            Path to the cached PDF if found, None otherwise
        """
        hash_dir = self.cache_dir / content_hash
        cached_pdf = hash_dir / "artifact.pdf"
        
        if cached_pdf.exists():
            return str(cached_pdf)
        
        return None
    
    def get_metadata(self, content_hash: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve metadata for a cached artifact by content hash.
        
        Args:
            content_hash: SHA-256 hash of the markdown content
            
        Returns:
            Metadata dictionary if found, None otherwise
        """
        hash_dir = self.cache_dir / content_hash
        metadata_file = hash_dir / "metadata.json"
        
        if not metadata_file.exists():
            return None
        
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return None
    
    def clear_cache(self) -> int:
        """
        Clear all cached artifacts.
        
        Returns:
            Number of artifacts removed
        """
        count = 0
        for hash_dir in self.cache_dir.iterdir():
            if hash_dir.is_dir():
                shutil.rmtree(hash_dir)
                count += 1
        return count
