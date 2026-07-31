"""
AgenticPipelineService

Orchestrates a single /api/process request end to end:
  1. Unchanged-content skip (Requirement 1.2) via SHA-256 of the raw markdown.
  2. Evidence-grounding validation, run once per call (Requirement 7-9). The
     retry loop itself (Requirement 10) is driven by the *caller* across
     separate HTTP requests: on failure with retries remaining, this service
     returns a structured error instead of degrading immediately; the caller
     (the VS Code extension) corrects and resubmits with an incremented
     retry_count. Once retries are exhausted, this service proceeds with only
     the validated portions (graceful degradation).
  3. Diagram rendering (mmdc -> Kroki, cached) for whatever diagrams survive
     validation.
  4. HTML generation + PDF rendering (WeasyPrint, falling back to a raw .html
     file per Requirement 12.5).
  5. Persistence via the existing artifact repository, with dropped
     diagrams/glossary entries and validation warnings recorded in the
     artifact's metadata for dashboard visibility (Requirement 10.4).
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.ingestion import IngestionService
from app.services.diagram_rendering_service import DiagramRenderingService
from app.services.html_generator import HTMLGeneratorService
from app.services.pdf_generator import PDFGeneratorService
from app.services.artifact_cache import ArtifactCacheService
from app.validators.retry_loop_orchestrator import RetryLoopOrchestrator, ValidatedArtifact


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AgenticPipelineService:
    def __init__(self, repo: Any, output_dir: str, max_retries: int = 2) -> None:
        self.repo = repo
        self.output_dir = output_dir
        self.max_retries = max_retries

        os.makedirs(output_dir, exist_ok=True)

        self.ingestion_service = IngestionService(repo)
        self.orchestrator = RetryLoopOrchestrator(max_retries=max_retries)
        self.diagram_renderer = DiagramRenderingService(
            cache_dir=os.path.join(output_dir, "diagram_cache")
        )
        self.html_generator = HTMLGeneratorService()
        self.pdf_generator = PDFGeneratorService(output_dir=output_dir)
        self.artifact_cache = ArtifactCacheService(
            cache_dir=os.path.join(output_dir, "artifact_cache")
        )

    def process(
        self,
        project_id: str,
        source_path: str,
        source_markdown: str,
        enriched_json: Dict[str, Any],
        artifact_type: Optional[str] = None,
        commit_hash: Optional[str] = None,
        retry_count: int = 0,
    ) -> Dict[str, Any]:
        import time

        content_hash = hashlib.sha256(source_markdown.encode("utf-8")).hexdigest()
        artifact_type = artifact_type or self.ingestion_service.classify(source_path, source_markdown)
        existing = self.repo.get_artifact_by_path(project_id, source_path)

        skip_result = self._check_skip(existing, content_hash)
        if skip_result is not None:
            return skip_result

        validation_start = time.perf_counter()
        validation_results = self.orchestrator.run_validators(enriched_json, source_markdown)
        validation_ms = int((time.perf_counter() - validation_start) * 1000)

        if self.orchestrator.is_fully_valid(validation_results):
            validated = ValidatedArtifact(
                enriched_json=enriched_json,
                dropped_items={},
                validation_warnings=self.orchestrator.collect_warnings(validation_results),
            )
        elif retry_count < self.max_retries:
            structured_error = self.orchestrator.build_structured_error(
                validation_results, retry_count=retry_count + 1
            )
            return {
                "status": "retry_needed",
                "structured_error": structured_error.to_dict(),
                "retry_count": retry_count,
                "stageTimings": {"stage2_validation_ms": validation_ms},
            }
        else:
            validated = self.orchestrator.proceed_with_validated(enriched_json, source_markdown)

        render_start = time.perf_counter()
        rendered_diagrams = self._render_diagrams(validated.enriched_json.get("diagrams", []))

        artifact_id = existing["id"] if existing else self._next_artifact_id(project_id)
        version_no = len(self.repo.list_versions(artifact_id)) + 1 if existing else 1

        html = self.html_generator.generate_html(
            validated.enriched_json,
            rendered_diagrams,
            artifact_type=artifact_type,
            source_path=source_path,
            commit_hash=commit_hash,
        )

        pdf_path = self._render_output(html, artifact_id, version_no)
        render_ms = int((time.perf_counter() - render_start) * 1000)

        artifact_payload = {
            "id": artifact_id,
            "project_id": project_id,
            "source_path": source_path,
            "source_tool": self.ingestion_service.source_tool(source_path),
            "artifact_type": artifact_type,
            "status": "rendered",
            "content_hash": content_hash,
            "metadata": {
                "pipeline": "agentic",
                "dropped_items": validated.dropped_items,
                "validation_warnings": validated.validation_warnings,
            },
        }
        self.repo.upsert_artifact(artifact_payload)

        version = {
            "id": f"version-{artifact_id}-{version_no}",
            "artifact_id": artifact_id,
            "version_no": version_no,
            "pdf_path": pdf_path,
            "structured_json": validated.enriched_json,
            "generated_by": "agentic-pipeline",
            "generated_at": _utcnow_iso(),
        }
        self.repo.add_doc_version(artifact_id, version)

        try:
            self.artifact_cache.store_artifact(
                content_hash, pdf_path, artifact_id, metadata={"source_path": source_path}
            )
        except Exception:
            pass  # Cache is a best-effort optimization, never fatal.

        return {
            "status": "ok",
            "skipped": False,
            "partial": bool(validated.dropped_items),
            "artifact": artifact_payload,
            "artifact_id": artifact_id,
            "pdf_location": pdf_path,
            "version": version,
            "dropped_items": validated.dropped_items,
            "validation_warnings": validated.validation_warnings,
            "stageTimings": {
                "stage2_validation_ms": validation_ms,
                "stage3_rendering_ms": render_ms,
            },
        }

    def get_status(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        """Return artifact + latest version + dropped-item/validation status
        for the dashboard (Requirement 10.4 / task 20.2)."""
        artifact = self.repo.get_artifact_by_id(artifact_id)
        if artifact is None:
            return None

        versions = self.repo.list_versions(artifact_id)
        latest_version = versions[-1] if versions else None
        metadata = artifact.get("metadata") or {}
        cache_hit = self.artifact_cache.check_cache(artifact.get("content_hash", "")) is not None

        return {
            "artifact": artifact,
            "latest_version": latest_version,
            "version_count": len(versions),
            "dropped_items": metadata.get("dropped_items", {}),
            "validation_warnings": metadata.get("validation_warnings", []),
            "cache_hit": cache_hit,
        }

    def _check_skip(self, existing: Optional[Dict[str, Any]], content_hash: str) -> Optional[Dict[str, Any]]:
        if not existing or existing.get("content_hash") != content_hash:
            return None
        versions = self.repo.list_versions(existing["id"])
        if not versions:
            return None
        latest = versions[-1]
        return {
            "status": "ok",
            "skipped": True,
            "artifact": existing,
            "artifact_id": existing["id"],
            "pdf_location": latest["pdf_path"],
            "version": latest,
        }

    def _render_diagrams(self, diagrams: List[Dict[str, Any]]) -> Dict[str, str]:
        rendered: Dict[str, str] = {}
        for idx, diagram in enumerate(diagrams):
            mermaid_code = diagram.get("mermaidCode", "")
            if not mermaid_code:
                continue
            result = self.diagram_renderer.render_diagram(mermaid_code, f"diagram-{idx}")
            if result.success and result.image_path:
                rendered[f"diagram-{idx}"] = result.image_path
        return rendered

    def _render_output(self, html: str, artifact_id: str, version_no: int) -> str:
        pdf_path = str(Path(self.output_dir) / f"{artifact_id}-v{version_no}.pdf")
        pdf_ok = False
        try:
            pdf_ok = self.pdf_generator.generate_pdf(html, pdf_path)
        except Exception:
            pdf_ok = False

        if pdf_ok:
            return pdf_path

        # Requirement 12.5: if WeasyPrint fails, fall back to raw HTML rather
        # than producing nothing.
        html_path = str(Path(self.output_dir) / f"{artifact_id}-v{version_no}.html")
        with open(html_path, "w", encoding="utf-8") as handle:
            handle.write(html)
        return html_path

    def _next_artifact_id(self, project_id: str) -> str:
        """
        Generate a new artifact id.

        Must be globally unique: `artifacts.id` is a table-wide primary key,
        not scoped per project. Counting list_artifacts(project_id) (as the
        legacy IngestionService does) means every project's *first* artifact
        computes to "artifact-1", colliding with every other project's first
        artifact - upsert_artifact() then silently overwrites whichever
        project got there first, and add_doc_version() raises an uncaught
        UNIQUE-constraint IntegrityError on the second one's insert (since
        version ids are derived from the same colliding artifact_id), which
        fails that request with a 500 *after* the PDF file was already
        written to disk under the stale/wrong artifact_id - leaving a
        correct-looking file on disk for the wrong document.
        """
        return f"artifact-{self.repo.count_all_artifacts() + 1}"
