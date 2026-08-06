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
from app.services.path_matching import path_matches_exception
from app.services.tasks_parser import parse_tasks_markdown
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

    def is_path_excluded(self, project_id: str, source_path: str) -> bool:
        """True if source_path matches any entry in the project's exceptions
        list - see path_matching.path_matches_exception for the matching
        rule (exact file or folder-prefix)."""
        return any(
            path_matches_exception(source_path, exception["source_path"])
            for exception in self.repo.list_exceptions(project_id)
        )

    def report_step(
        self,
        project_id: str,
        source_path: str,
        step: str,
        source_markdown: str = "",
        attempt: Optional[int] = None,
        max_attempts: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Record a client-side pipeline step that happens *before* process()
        can be called - process() only starts once the caller (the VS Code
        extension) already has a full enriched_json, but building that
        involves its own slower steps first (reading the file, calling the
        AI provider, client-side JSON validation) that would otherwise be
        completely invisible on the dashboard until they're already done.
        Callers ping this as they go; process() takes over once it starts
        (both write to the same artifact row, keyed by project_id+source_path,
        so the dashboard sees one continuous sequence of steps).

        attempt/max_attempts (if the caller is in a client-side correction
        loop) let the dashboard show "attempt 2/5" - without this, a
        long-running retry loop (each attempt needing a fresh AI call) is
        visually identical to a hung one.
        """
        existing = self.repo.get_artifact_by_path(project_id, source_path)
        artifact_id = existing["id"] if existing else self._next_artifact_id(project_id)
        source_tool = self.ingestion_service.source_tool(source_path)
        artifact_type = (existing or {}).get("artifact_type") or self.ingestion_service.classify(
            source_path, source_markdown
        )
        metadata = dict((existing or {}).get("metadata") or {})
        metadata["pipeline"] = "agentic"
        metadata["attempt"] = attempt
        metadata["max_attempts"] = max_attempts

        # step="cancelled" is a special report from the extension: it
        # noticed (via this same reportStep channel) that a cancellation
        # was requested and gave up client-side. Without this, the artifact
        # row stays frozen at status="processing" forever - the frontend
        # would show a spinner that never resolves, even though nothing is
        # actually running anymore.
        if step == "cancelled":
            metadata["current_step"] = None
            metadata["cancel_requested"] = False
            metadata["manual_retry_requested"] = False
            status_value = "cancelled"
        else:
            metadata["current_step"] = step
            # attempt is None/1 exactly when a brand-new run is starting
            # (not a mid-run correction retry) - whether that's a normal
            # file-save or this call is itself fulfilling a pending manual
            # retry request. Either way, any cancel/retry flag left over
            # from a PREVIOUS run of this same file is now stale and must
            # be cleared, or it would incorrectly affect this new run too
            # (an old cancel_requested=True would cancel a run the user
            # never asked to stop; an old manual_retry_requested=True would
            # keep re-triggering forever since nothing else ever clears it).
            if attempt in (None, 1):
                metadata["cancel_requested"] = False
                metadata["manual_retry_requested"] = False
            status_value = "processing"

        return self.repo.upsert_artifact(
            {
                "id": artifact_id,
                "project_id": project_id,
                "source_path": source_path,
                "source_tool": source_tool,
                "artifact_type": artifact_type,
                "status": status_value,
                "content_hash": (existing or {}).get("content_hash", ""),
                "metadata": metadata,
            }
        )

    def request_cancel(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        """Flag an artifact's in-flight run for cancellation. Best-effort:
        the backend has no way to forcibly interrupt the extension's
        client-side AI call - the extension notices this flag the next time
        it reports a step (see report_step) and cancels its own in-flight
        work. Returns the updated artifact, or None if it doesn't exist."""
        return self.repo.set_metadata_flag(artifact_id, "cancel_requested", True)

    def request_retry(self, artifact_id: str) -> Optional[Dict[str, Any]]:
        """Flag an artifact to be reprocessed from scratch - the extension
        polls list_retry_requests() and, on seeing this, re-reads the file
        from disk and re-runs the full pipeline (fresh AI call included) as
        if it had just been saved. Returns the updated artifact, or None if
        it doesn't exist."""
        return self.repo.set_metadata_flag(artifact_id, "manual_retry_requested", True)

    def list_retry_requests(self, project_id: str) -> List[Dict[str, str]]:
        """Pending manual-retry requests for a project, for the VS Code
        extension to poll. Filtered in Python rather than a JSON SQL query
        so the same logic works unchanged against both the SQLite and
        Postgres repositories."""
        return [
            {"artifact_id": artifact["id"], "source_path": artifact["source_path"]}
            for artifact in self.repo.list_artifacts(project_id)
            if (artifact.get("metadata") or {}).get("manual_retry_requested")
        ]

    def process(
        self,
        project_id: str,
        source_path: str,
        source_markdown: str,
        enriched_json: Dict[str, Any],
        artifact_type: Optional[str] = None,
        commit_hash: Optional[str] = None,
        retry_count: int = 0,
        project_root: Optional[str] = None,
        authoring_framework: Optional[str] = None,
        model_used: Optional[str] = None,
    ) -> Dict[str, Any]:
        import time

        content_hash = hashlib.sha256(source_markdown.encode("utf-8")).hexdigest()
        artifact_type = artifact_type or self.ingestion_service.classify(source_path, source_markdown)
        existing = self.repo.get_artifact_by_path(project_id, source_path)

        skip_result = self._check_skip(existing, content_hash)
        if skip_result is not None:
            return skip_result

        # Artifact id/source_tool are needed up front (not just at
        # persistence time) so a placeholder row can be written to the DB
        # *before* validation/rendering runs - this is what lets the
        # frontend show "processing... <step>" immediately instead of the
        # artifact only appearing once the whole pipeline finishes.
        artifact_id = existing["id"] if existing else self._next_artifact_id(project_id)
        source_tool = self.ingestion_service.source_tool(source_path)
        title = enriched_json.get("title")
        # set_status() rebuilds metadata from scratch on every call (unlike
        # report_step's copy-and-merge) - without carrying this forward
        # explicitly, the very first status update inside this method would
        # silently wipe out a cancel_requested flag set (via the /cancel
        # endpoint) while report_step's client-side steps were still
        # running, even though nothing has actually acted on it yet.
        cancel_requested = bool((existing or {}).get("metadata", {}).get("cancel_requested"))

        def set_status(status: str, current_step: Optional[str], **extra_metadata: Any) -> None:
            self.repo.upsert_artifact(
                {
                    "id": artifact_id,
                    "project_id": project_id,
                    "source_path": source_path,
                    "source_tool": source_tool,
                    "artifact_type": artifact_type,
                    "status": status,
                    "content_hash": content_hash,
                    "metadata": {
                        "pipeline": "agentic",
                        "title": title,
                        "current_step": current_step,
                        "project_root": project_root,
                        "authoring_framework": authoring_framework,
                        "model_used": model_used,
                        "cancel_requested": cancel_requested,
                        **extra_metadata,
                    },
                }
            )

        set_status("processing", "validating")

        try:
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
                # Not "failed": the caller (extension) is expected to
                # correct and resubmit. "retry_needed" lets the dashboard
                # distinguish "still working, awaiting a corrected
                # resubmission" from a genuine dead-end. The resubmission
                # only happens if the calling AI agent's session is still
                # active and acts on this response - if it doesn't (session
                # ended, user moved on), this status is what's left behind,
                # so the structured error is persisted here too rather than
                # only being returned in this one HTTP response, otherwise
                # there'd be no way to later see *why* it stalled.
                set_status("retry_needed", "awaiting_retry", structured_error=structured_error.to_dict())
                return {
                    "status": "retry_needed",
                    "structured_error": structured_error.to_dict(),
                    "retry_count": retry_count,
                    "stageTimings": {"stage2_validation_ms": validation_ms},
                }
            else:
                validated = self.orchestrator.proceed_with_validated(enriched_json, source_markdown)

            set_status("processing", "rendering_diagrams")
            render_start = time.perf_counter()
            rendered_diagrams = self._render_diagrams(validated.enriched_json.get("diagrams", []))

            version_no = len(self.repo.list_versions(artifact_id)) + 1 if existing else 1

            set_status("processing", "generating_pdf")
            html = self.html_generator.generate_html(
                validated.enriched_json,
                rendered_diagrams,
                artifact_type=artifact_type,
                source_path=source_path,
                commit_hash=commit_hash,
                project_root=project_root,
                authoring_framework=authoring_framework,
                model_used=model_used,
            )

            pdf_path = self._render_output(html, artifact_id, version_no)
            render_ms = int((time.perf_counter() - render_start) * 1000)
        except Exception as exc:
            set_status("failed", None, error=str(exc))
            raise

        artifact_payload = {
            "id": artifact_id,
            "project_id": project_id,
            "source_path": source_path,
            "source_tool": source_tool,
            "artifact_type": artifact_type,
            "status": "rendered",
            "content_hash": content_hash,
            "metadata": {
                "pipeline": "agentic",
                "title": title,
                "current_step": None,
                "dropped_items": validated.dropped_items,
                "validation_warnings": validated.validation_warnings,
                "project_root": project_root,
                "authoring_framework": authoring_framework,
                "model_used": model_used,
                # A pending cancel never got a chance to take effect - the
                # run just finished successfully instead. Clear it rather
                # than leaving it to confuse whatever the next run is.
                "cancel_requested": False,
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

        if artifact_type == "task":
            friendly_descriptions = self._extract_friendly_descriptions(validated.enriched_json)
            self._sync_kanban_tasks(
                project_id, artifact_id, source_path, source_markdown, friendly_descriptions
            )

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
        # Must be a genuinely completed prior render, not merely "some row
        # with a matching content_hash". Within one client-side retry loop
        # (attempt 1 fails validation, attempt 2 corrects and resubmits),
        # source_markdown - and therefore content_hash - is IDENTICAL
        # across every attempt; only enriched_json changes. set_status()
        # persists that same content_hash on the "retry_needed" write for
        # attempt 1, so attempt 2's content_hash would otherwise match it
        # and (if any older unrelated version happens to already exist)
        # incorrectly short-circuit as "already rendered, nothing to do" -
        # returning a fake success without ever actually validating this
        # attempt, and without updating status away from whatever transient
        # step it was last left at (permanently freezing the dashboard).
        if not existing or existing.get("status") != "rendered" or existing.get("content_hash") != content_hash:
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

        Delegates to repo.next_artifact_id() (a DB sequence / locked
        counter) rather than count_all_artifacts() + 1: counting-then-using
        is itself racy across two concurrent requests (both can read the
        same count before either commits its insert), which is exactly the
        same class of bug this method's global-counting already fixed for
        the *per-project* case - see repo.next_artifact_id()'s docstring.
        """
        return self.repo.next_artifact_id()

    def _extract_friendly_descriptions(self, enriched_json: Dict[str, Any]) -> Dict[str, str]:
        """
        Pull the AI's per-task, user-friendly descriptions (see
        EnrichmentPromptBuilder's task-descriptions guidance) out of the
        enriched JSON, keyed by task_key. Absent/malformed entries are
        skipped rather than raising - this is a best-effort enhancement over
        the raw regex-parsed text (tasks_parser.py's `description` field),
        never a requirement: older clients, non-AI providers, and the
        rule-based fallback (which has no way to generate this) simply don't
        include it, and _sync_kanban_tasks falls back to the raw text below.
        """
        raw_entries = enriched_json.get("taskDescriptions")
        if not isinstance(raw_entries, list):
            return {}

        friendly_descriptions: Dict[str, str] = {}
        for entry in raw_entries:
            if not isinstance(entry, dict):
                continue
            task_key = entry.get("taskKey")
            description = entry.get("description")
            if isinstance(task_key, str) and isinstance(description, str) and description.strip():
                friendly_descriptions[task_key] = description.strip()
        return friendly_descriptions

    def _sync_kanban_tasks(
        self,
        project_id: str,
        artifact_id: str,
        source_path: str,
        source_markdown: str,
        friendly_descriptions: Optional[Dict[str, str]] = None,
    ) -> None:
        """
        Re-derive the Kanban board's task rows from a tasks.md-classified
        artifact's current content, called after every successful render.

        A task's board_status (todo/in_progress/done - which column it's
        in) is the one thing NOT simply overwritten from the file: it's
        preserved across a resync so dragging a card on the board isn't
        wiped out by an unrelated edit elsewhere in the same file, UNLESS
        the task's own checkbox newly flips to done (- [ ] -> - [x]), which
        counts as the file itself declaring the task finished. A task_key
        no longer present in the file (removed or renumbered) is deleted -
        the board reflects the file, not a permanent history of it.

        friendly_descriptions (task_key -> AI-rewritten description) takes
        priority over the raw regex-parsed text when present for that key,
        same "always overwritten from the source on resync" treatment as
        every other field but board_status.
        """
        parsed_tasks = parse_tasks_markdown(source_markdown)
        friendly_descriptions = friendly_descriptions or {}
        existing_by_key = {
            task["task_key"]: task for task in self.repo.list_kanban_tasks_for_artifact(artifact_id)
        }
        now = _utcnow_iso()
        seen_keys = set()

        for task in parsed_tasks:
            seen_keys.add(task["task_key"])
            existing_task = existing_by_key.get(task["task_key"])
            if existing_task:
                board_status = existing_task["board_status"]
                if task["checkbox_done"] and not existing_task["checkbox_done"]:
                    board_status = "done"
            else:
                board_status = "done" if task["checkbox_done"] else "todo"

            description = friendly_descriptions.get(task["task_key"]) or task["description"]

            self.repo.upsert_kanban_task(
                {
                    "project_id": project_id,
                    "artifact_id": artifact_id,
                    "source_path": source_path,
                    "task_key": task["task_key"],
                    "phase": task["phase"],
                    "phase_order": task["phase_order"],
                    "parallel": task["parallel"],
                    "story": task["story"],
                    "description": description,
                    "checkbox_done": task["checkbox_done"],
                    "board_status": board_status,
                },
                now,
            )

        for task_key, existing_task in existing_by_key.items():
            if task_key not in seen_keys:
                self.repo.delete_kanban_task(existing_task["id"])
