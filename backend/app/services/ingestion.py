from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.repositories.artifact_repo import ArtifactRepository


class IngestionService:
    def __init__(self, repo: ArtifactRepository) -> None:
        self.repo = repo

    def discover_markdown_files(self, root: str) -> List[Path]:
        if not os.path.exists(root):
            return []
        matches: List[Path] = []
        for path in Path(root).rglob("*.md"):
            if path.is_file():
                matches.append(path)
        return sorted(matches)

    def source_tool(self, source_path: str) -> str:
        if source_path.startswith("specs/"):
            return "speckit"
        if source_path.startswith(".kiro/specs/"):
            return "kiro"
        return "speckit"

    def classify(self, source_path: str, content: str, source_tool_value: Optional[str] = None) -> str:
        source_tool_value = source_tool_value or self.source_tool(source_path)
        filename = Path(source_path).name
        lower_path = source_path.lower()

        if filename == "spec.md" or filename == "requirements.md":
            return "spec"
        if filename == "plan.md" or filename == "design.md":
            return "plan"
        # Speckit's own tasks.md lives flat at specs/NNN-feature/tasks.md (no
        # "/tasks/" directory segment) - matching on the filename alone
        # covers that case as well as Kiro's identically-named file, so the
        # source_tool_value branch that used to gate this to Kiro only is no
        # longer needed.
        if "/tasks/" in lower_path or filename == "tasks.md":
            return "task"
        if filename == "constitution.md":
            return "constitution"
        if filename == "research.md":
            return "research"
        if filename == "data-model.md":
            return "data-model"
        if "/contracts/" in lower_path:
            return "contract"
        if filename == "quickstart.md":
            return "quickstart"
        return "other"

    def compute_content_hash(self, content: str) -> str:
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    def should_skip(self, project_id: str, source_path: str, content_hash: str) -> Tuple[bool, Optional[Dict[str, Any]]]:
        artifact = self.repo.get_artifact_by_path(project_id, source_path)
        if not artifact:
            return False, None

        latest_version = self.repo.list_versions(artifact["id"])
        if not latest_version:
            return artifact.get("content_hash") == content_hash, artifact

        if artifact.get("content_hash") == content_hash:
            return True, artifact
        return False, artifact

    def ingest_structured(self, project_id: str, source_path: str, structured_json: Dict[str, Any], commit_hash: Optional[str] = None) -> Dict[str, Any]:
        content = str(structured_json)
        artifact = self.repo.get_artifact_by_path(project_id, source_path)
        content_hash = self.compute_content_hash(content)
        skip, existing = self.should_skip(project_id, source_path, content_hash)
        if skip and existing:
            return {"artifact": existing, "skipped": True, "reason": "unchanged"}

        artifact_type = self.classify(source_path, content)
        artifact_id = existing["id"] if existing else f"artifact-{len(self.repo.list_artifacts(project_id)) + 1}"
        artifact_payload = {
            "id": artifact_id,
            "project_id": project_id,
            "source_path": source_path,
            "source_tool": self.source_tool(source_path),
            "artifact_type": artifact_type,
            "status": "pending",
            "content_hash": content_hash,
        }
        self.repo.upsert_artifact(artifact_payload)
        return {"artifact": artifact_payload, "skipped": False}

    def ingest_raw(self, project_id: str, source_path: str, raw_content: str, commit_hash: Optional[str] = None) -> Dict[str, Any]:
        artifact = self.repo.get_artifact_by_path(project_id, source_path)
        content_hash = self.compute_content_hash(raw_content)
        skip, existing = self.should_skip(project_id, source_path, content_hash)
        if skip and existing:
            return {"artifact": existing, "skipped": True, "reason": "unchanged"}

        artifact_type = self.classify(source_path, raw_content)
        artifact_id = existing["id"] if existing else f"artifact-{len(self.repo.list_artifacts(project_id)) + 1}"
        artifact_payload = {
            "id": artifact_id,
            "project_id": project_id,
            "source_path": source_path,
            "source_tool": self.source_tool(source_path),
            "artifact_type": artifact_type,
            "status": "stale",
            "content_hash": content_hash,
        }
        self.repo.upsert_artifact(artifact_payload)
        return {"artifact": artifact_payload, "skipped": False, "stale": True}
