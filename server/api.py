"""The RPC surface.

One method per endpoint the HTTP backend used to expose, with the same names
for the same things. The dashboard is being ported rather than rewritten, so
its calls change shape - `postMessage` instead of `axios` - but not meaning.

Two endpoints have no equivalent and are gone rather than stubbed:
`/api/config/status` reported whether the server could be reached, and the
bearer-token check guarded a port that no longer exists. Neither has anything
to answer now that the backend is a child process of the editor.
"""

from __future__ import annotations

import base64
from pathlib import Path
from typing import Any, Callable, Dict, List

from db import Store, classify, content_hash
from rpc import Server
from tasks import parse_tasks_markdown
from validation import EnrichmentValidator

# Kept in step with the host's expectations; a mismatch means one side was
# updated without the other.
PROTOCOL_VERSION = 3


def register(
    server: Server,
    store: Store,
    *,
    build_pdf: Callable[[Dict[str, Any]], Dict[str, Any]],
    log: Callable[[str], None],
) -> Server:
    validator = EnrichmentValidator()

    @server.method("ping")
    def _ping(_params: Dict[str, Any]) -> Dict[str, Any]:
        return {"ok": True, "protocol": PROTOCOL_VERSION}

    # -- projects -------------------------------------------------------------

    @server.method("listProjects")
    def _list_projects(_params: Dict[str, Any]) -> Dict[str, Any]:
        return {"projects": [project.to_dict() for project in store.projects()]}

    @server.method("createProject")
    def _create_project(params: Dict[str, Any]) -> Dict[str, Any]:
        project_id = _required(params, "id")
        name = str(params.get("name") or project_id)
        return store.upsert_project(project_id, name, params.get("repo_url")).to_dict()

    @server.method("setAutomationMode")
    def _set_automation_mode(params: Dict[str, Any]) -> Dict[str, Any]:
        return store.set_automation_mode(_required(params, "projectId"), _required(params, "mode")).to_dict()

    # -- artifacts ------------------------------------------------------------

    @server.method("listArtifacts")
    def _list_artifacts(params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "artifacts": [artifact.to_dict() for artifact in store.artifacts(_required(params, "projectId"))]
        }

    @server.method("artifactStatus")
    def _artifact_status(params: Dict[str, Any]) -> Dict[str, Any]:
        artifact_id = _required(params, "artifactId")
        artifact = store.artifact(artifact_id)
        if not artifact:
            raise ValueError(f"No such artifact: {artifact_id}")

        versions = store.versions(artifact_id)
        latest = versions[0] if versions else None

        return {
            "artifact": artifact.to_dict(),
            "latest_version": latest.to_dict() if latest else None,
            "version_count": len(versions),
            "dropped_items": artifact.metadata.get("dropped_items", {}),
            "validation_warnings": artifact.metadata.get("validation_warnings", []),
            "cache_hit": bool(artifact.metadata.get("cache_hit", False)),
        }

    @server.method("setTags")
    def _set_tags(params: Dict[str, Any]) -> Dict[str, Any]:
        tags = params.get("tags")
        if not isinstance(tags, list):
            raise ValueError("setTags requires a list of tags")
        return store.set_tags(_required(params, "artifactId"), [str(tag) for tag in tags]).to_dict()

    @server.method("listVersions")
    def _list_versions(params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "versions": [version.to_dict() for version in store.versions(_required(params, "artifactId"))]
        }

    @server.method("versionPdf")
    def _version_pdf(params: Dict[str, Any]) -> Dict[str, Any]:
        version_id = _required(params, "versionId")
        version = store.version(version_id)
        if not version:
            raise ValueError(f"No such version: {version_id}")

        # The path, not the bytes: the host opens the file, and pushing a
        # multi-megabyte PDF through a JSON line would be absurd.
        return {"pdfPath": version.pdf_path, "exists": Path(version.pdf_path).exists()}

    # -- conversion -----------------------------------------------------------

    @server.method("convert")
    def _convert(params: Dict[str, Any]) -> Dict[str, Any]:
        markdown = params.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError("convert requires non-empty markdown")

        project_id = str(params.get("projectId") or params.get("workspace") or "")
        source_path = str(params.get("sourcePath") or "document.md")
        store.upsert_project(project_id, str(params.get("projectName") or project_id or "Workspace"))

        artifact_type = str(params.get("artifactType") or classify(source_path))
        hash_value = content_hash(markdown)
        artifact = store.upsert_artifact(
            project_id,
            source_path,
            title=_title(markdown, Path(source_path).stem),
            artifact_type=artifact_type,
            status="processing",
        )

        if not params.get("force"):
            unchanged = store.unchanged_since_last_build(artifact.id, hash_value)
            if unchanged:
                log(f"unchanged since {unchanged.generated_at}, reusing {unchanged.pdf_path}")
                store.set_status(artifact.id, "complete", {"cache_hit": True})
                return {
                    "artifactId": artifact.id,
                    "pdfPath": unchanged.pdf_path,
                    "warnings": unchanged.warnings,
                    "dropped": [],
                    "reused": True,
                }

        enrichment = validator.validate(markdown, params.get("enrichment") or {})
        for item in enrichment.dropped:
            log(f"dropped {item.kind} {item.label}: {item.reason}")

        try:
            built = build_pdf(
                {
                    "markdown": markdown,
                    "sourcePath": source_path,
                    "outputPath": params.get("outputPath"),
                    "diagrams": params.get("diagrams") or [],
                    "summary": enrichment.summary,
                    "glossary": enrichment.glossary,
                    "sectionSummaries": enrichment.section_summaries,
                }
            )
        except Exception as exc:
            store.set_status(artifact.id, "failed", {"error": str(exc)})
            raise

        dropped = [item.to_dict() for item in enrichment.dropped]
        version = store.record_version(
            artifact.id,
            pdf_path=built["pdfPath"],
            structured_json={"summary": enrichment.summary, "glossary": enrichment.glossary},
            diagram_count=int(built.get("diagramCount") or 0),
            warnings=built.get("warnings") or [],
        )
        store.upsert_artifact(project_id, source_path, content_hash_value=hash_value)
        store.set_status(
            artifact.id,
            "complete",
            {
                "cache_hit": False,
                "dropped_items": {"count": len(dropped), "items": dropped},
                "validation_warnings": built.get("warnings") or [],
            },
        )

        # A tasks file is also a board. Re-syncing on every successful render is
        # what keeps the two from drifting.
        if artifact_type == "task":
            count = store.sync_tasks(project_id, artifact.id, source_path, parse_tasks_markdown(markdown))
            log(f"synced {count} task(s) from {source_path}")

        return {
            "artifactId": artifact.id,
            "versionId": version.id,
            "pdfPath": built["pdfPath"],
            "typstSource": built.get("typstSource"),
            "warnings": built.get("warnings") or [],
            "dropped": dropped,
            "glossaryCount": len(enrichment.glossary),
            "reused": False,
        }

    @server.method("validateEnrichment")
    def _validate_enrichment(params: Dict[str, Any]) -> Dict[str, Any]:
        markdown = params.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError("validateEnrichment requires the source markdown")
        return validator.validate(markdown, params.get("enrichment") or {}).to_dict()

    @server.method("readVersionPdf")
    def _read_version_pdf(params: Dict[str, Any]) -> Dict[str, Any]:
        """The PDF's bytes, base64-encoded, for the panel's download button.

        Only the download path needs these - viewing goes through a webview URI
        rather than pushing megabytes across the message channel.
        """
        version_id = _required(params, "versionId")
        version = store.version(version_id)
        if not version:
            raise ValueError(f"No such version: {version_id}")

        pdf = Path(version.pdf_path)
        if not pdf.exists():
            raise ValueError(f"The PDF for this version is no longer on disk: {pdf}")
        return {"base64": base64.b64encode(pdf.read_bytes()).decode("ascii"), "name": pdf.name}

    @server.method("cancelArtifact")
    def _cancel_artifact(params: Dict[str, Any]) -> Dict[str, Any]:
        """Best-effort, exactly as before.

        The work runs in the editor, not here, so this records the request and
        the extension notices it the next time it reports progress. Nothing in
        this process can interrupt a model call.
        """
        artifact_id = _required(params, "artifactId")
        store.set_status(artifact_id, "cancelling", {"cancel_requested": True})
        return {"cancelling": True}

    @server.method("cancelStatus")
    def _cancel_status(params: Dict[str, Any]) -> Dict[str, Any]:
        artifact = store.artifact(_required(params, "artifactId"))
        if not artifact:
            raise ValueError("No such artifact")
        return {"cancel_requested": bool(artifact.metadata.get("cancel_requested", False))}

    @server.method("retryArtifact")
    def _retry_artifact(params: Dict[str, Any]) -> Dict[str, Any]:
        """Queue a rebuild from scratch.

        Like a transform request: the extension re-reads the file and re-runs
        the pipeline, because it is the side that can read the workspace and
        reach a model.
        """
        artifact_id = _required(params, "artifactId")
        artifact = store.artifact(artifact_id)
        if not artifact:
            raise ValueError(f"No such artifact: {artifact_id}")

        store.set_status(artifact_id, "pending", {"cancel_requested": False})
        store.request_transform(artifact.project_id, artifact.source_path)
        return {"queued": True, "sourcePath": artifact.source_path}

    # -- project files --------------------------------------------------------

    @server.method("syncFiles")
    def _sync_files(params: Dict[str, Any]) -> Dict[str, Any]:
        project_id = _required(params, "projectId")
        store.upsert_project(project_id, str(params.get("projectName") or project_id))
        files = params.get("files")
        if not isinstance(files, list):
            raise ValueError("syncFiles requires a list of files")
        return {"count": store.sync_files(project_id, files)}

    @server.method("listFiles")
    def _list_files(params: Dict[str, Any]) -> Dict[str, Any]:
        return {"files": [entry.to_dict() for entry in store.files(_required(params, "projectId"))]}

    @server.method("requestTransform")
    def _request_transform(params: Dict[str, Any]) -> Dict[str, Any]:
        project_id = _required(params, "projectId")
        source_path = _required(params, "sourcePath")
        store.request_transform(project_id, source_path)

        # The updated row, not an acknowledgement: the file list re-renders from
        # what comes back, and "queued" is a state the user should see.
        for entry in store.files(project_id):
            if entry.source_path == source_path:
                return entry.to_dict()
        raise ValueError(f"No such file in this project: {source_path}")

    @server.method("takeTransformRequests")
    def _take_transform_requests(params: Dict[str, Any]) -> Dict[str, Any]:
        return {"paths": store.take_transform_requests(_required(params, "projectId"))}

    # -- board ----------------------------------------------------------------

    @server.method("listTasks")
    def _list_tasks(params: Dict[str, Any]) -> Dict[str, Any]:
        return {"tasks": [task.to_dict() for task in store.tasks(_required(params, "projectId"))]}

    @server.method("setTaskStatus")
    def _set_task_status(params: Dict[str, Any]) -> Dict[str, Any]:
        task_id = params.get("taskId")
        if not isinstance(task_id, int):
            raise ValueError("setTaskStatus requires a numeric taskId")
        return store.set_board_status(task_id, _required(params, "boardStatus")).to_dict()

    # -- exceptions -----------------------------------------------------------

    @server.method("listExceptions")
    def _list_exceptions(params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "exceptions": [item.to_dict() for item in store.exceptions(_required(params, "projectId"))]
        }

    @server.method("addException")
    def _add_exception(params: Dict[str, Any]) -> Dict[str, Any]:
        return store.add_exception(_required(params, "projectId"), _required(params, "sourcePath")).to_dict()

    @server.method("removeException")
    def _remove_exception(params: Dict[str, Any]) -> Dict[str, Any]:
        exception_id = params.get("exceptionId")
        if not isinstance(exception_id, int):
            raise ValueError("removeException requires a numeric exceptionId")
        store.remove_exception(exception_id)
        return {"removed": True}

    @server.method("isExcepted")
    def _is_excepted(params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "excluded": store.is_excepted(_required(params, "projectId"), _required(params, "sourcePath"))
        }

    # -- settings -------------------------------------------------------------

    @server.method("getSetting")
    def _get_setting(params: Dict[str, Any]) -> Dict[str, Any]:
        return {"value": store.get_setting(_required(params, "key"), params.get("default"))}

    @server.method("setSetting")
    def _set_setting(params: Dict[str, Any]) -> Dict[str, Any]:
        store.set_setting(_required(params, "key"), str(params.get("value") or ""))
        return {"ok": True}

    return server


def _required(params: Dict[str, Any], key: str) -> str:
    value = params.get(key)
    if value is None or str(value).strip() == "":
        raise ValueError(f"{key} is required")
    return str(value)


def _title(markdown: str, fallback: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


__all__ = ["PROTOCOL_VERSION", "register"]
