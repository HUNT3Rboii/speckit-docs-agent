"""
Integration tests for the agentic pipeline's /api/process and
/api/status/{artifact_id} endpoints: full request -> validation ->
render -> persistence round trip, the retry_needed / graceful-degradation
branches, and unchanged-content skipping.

Diagram rendering is stubbed (monkeypatched) so tests never depend on mmdc
being installed or on reaching the real Kroki API over the network.
"""

import importlib
from pathlib import Path

import PyPDF2
import pytest
from fastapi.testclient import TestClient

from app.services.diagram_rendering_service import DiagramRenderingService, RenderResult


SOURCE_MARKDOWN = """# Overview

The Auth Service validates user credentials against the database and issues JWT tokens upon successful login.

## Architecture

The system uses a PostgreSQL database to store user records.
"""


def make_enriched_json(evidence: str = "The Auth Service validates user credentials against the database and issues JWT tokens upon successful login."):
    return {
        "title": "Auth Doc",
        "abstract": "Describes authentication.",
        "sections": [
            {"heading": "Overview", "content": "Overview content.", "type": "normal", "level": 1},
            {"heading": "Architecture", "content": "Architecture content.", "type": "design_decision", "level": 2},
        ],
        "diagrams": [
            {
                "type": "architecture",
                "mermaidCode": "graph LR\n  A-->B",
                "sectionRef": "Architecture",
                "location": "after-section-2",
                "components": [{"name": "Auth Service", "evidence": evidence}],
            }
        ],
        "glossary": [
            {
                "term": "JWT",
                "definition": "JSON Web Token.",
                "evidence": "issues JWT tokens upon successful login",
            }
        ],
        "summaries": {"executiveSummary": "This document describes the authentication system."},
    }


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "doc_agent.sqlite3"
    output_dir = tmp_path / "pdfs"
    monkeypatch.setenv("DOC_AGENT_DB_PATH", str(db_path))
    monkeypatch.setenv("DOC_OUTPUT_DIR", str(output_dir))
    monkeypatch.setenv("SPECKIT_EXT_API_KEY", "dev-key")

    # Never attempt real mmdc/Kroki calls in tests: stub successful rendering.
    def fake_render_diagram(self, mermaid_code, diagram_id):
        return RenderResult(success=True, image_path=str(output_dir / f"{diagram_id}.png"), rendering_method="stub")

    monkeypatch.setattr(DiagramRenderingService, "render_diagram", fake_render_diagram)

    import app.api.process_routes as process_routes
    import app.main as main_module

    importlib.reload(process_routes)
    importlib.reload(main_module)

    return TestClient(main_module.app)


AUTH_HEADERS = {"Authorization": "Bearer dev-key"}


def _process(client, **overrides):
    payload = {
        "project_id": "demo-project",
        "source_path": "specs/demo/spec.md",
        "source_markdown": SOURCE_MARKDOWN,
        "enriched_json": make_enriched_json(),
        "retry_count": 0,
    }
    payload.update(overrides)
    return client.post("/api/process", json=payload, headers=AUTH_HEADERS)


class TestHappyPath:
    def test_valid_document_produces_pdf(self, client):
        response = _process(client)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["skipped"] is False
        assert body["partial"] is False
        assert Path(body["pdf_location"]).exists()

    def test_provenance_fields_flow_through_to_pdf_and_metadata(self, client):
        """project_root/authoring_framework/model_used are detected
        client-side (extension) and sent up as plain optional request
        fields - confirm they reach both the rendered PDF's cover page and
        the persisted artifact metadata."""
        response = _process(
            client,
            project_root="speckit-docs-agent",
            authoring_framework="speckit",
            model_used="GitHub Copilot Chat — Claude Sonnet 5",
        )
        assert response.status_code == 200
        body = response.json()
        assert body["artifact"]["metadata"]["project_root"] == "speckit-docs-agent"
        assert body["artifact"]["metadata"]["authoring_framework"] == "speckit"
        assert body["artifact"]["metadata"]["model_used"] == "GitHub Copilot Chat — Claude Sonnet 5"

        with open(body["pdf_location"], "rb") as f:
            reader = PyPDF2.PdfReader(f)
            cover_text = reader.pages[0].extract_text()
        assert "speckit-docs-agent" in cover_text

    def test_provenance_fields_are_optional(self, client):
        """Existing/older callers that don't send these fields must not break."""
        response = _process(client)
        assert response.status_code == 200
        assert response.json()["artifact"]["metadata"]["project_root"] is None

    def test_requires_api_key(self, client):
        response = client.post(
            "/api/process",
            json={
                "project_id": "demo-project",
                "source_path": "specs/demo/spec.md",
                "source_markdown": SOURCE_MARKDOWN,
                "enriched_json": make_enriched_json(),
            },
        )
        assert response.status_code == 401


class TestRetryProtocol:
    def test_ungrounded_diagram_returns_retry_needed(self, client):
        response = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=0,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "retry_needed"
        assert body["retry_count"] == 0
        assert "ungrounded_diagrams" in body["structured_error"]["errors"]
        assert any(
            "Auth Service" in msg
            for msg in body["structured_error"]["errors"]["ungrounded_diagrams"]
        )

    def test_exhausted_retries_degrades_gracefully(self, client):
        response = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=2,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["partial"] is True
        assert body["dropped_items"]["diagrams"] == ["architecture"]
        # The PDF is still produced despite the dropped diagram.
        assert Path(body["pdf_location"]).exists()

    def test_corrected_resubmission_after_retry_succeeds_fully(self, client):
        first = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=0,
        )
        assert first.json()["status"] == "retry_needed"

        second = _process(client, enriched_json=make_enriched_json(), retry_count=1)
        body = second.json()
        assert body["status"] == "ok"
        assert body["partial"] is False
        # Regression: source_markdown (and therefore content_hash) is
        # identical between attempt 1 and attempt 2 - only enriched_json
        # differs. The "retry_needed" write on attempt 1 persists that
        # content_hash, which the old buggy _check_skip() would then match
        # against on attempt 2 (since an unrelated older version can already
        # exist), incorrectly short-circuiting as "already rendered,
        # nothing to do" - returning status="ok" but skipped=True without
        # ever actually validating or re-rendering this corrected attempt.
        assert body["skipped"] is False


class TestContentHashSkip:
    def test_unchanged_content_is_skipped_on_resubmission(self, client):
        first = _process(client)
        assert first.json()["skipped"] is False

        second = _process(client)
        body = second.json()
        assert body["skipped"] is True
        assert body["artifact_id"] == first.json()["artifact_id"]

    def test_retry_loop_on_an_edited_document_does_not_falsely_skip_against_an_older_version(self, client):
        """Reproduces the real production bug: an artifact that already has
        an older successful version gets edited and resubmitted. Attempt 1
        (new content, bad evidence) fails validation - its "retry_needed"
        write persists the *new* content_hash. Attempt 2 resubmits the same
        (unedited-since-attempt-1) markdown with corrected evidence.
        source_markdown, and therefore content_hash, is identical between
        attempt 1 and attempt 2 - only enriched_json differs between retry
        attempts. The old buggy _check_skip() matched attempt 2's
        content_hash against attempt 1's leftover write and, since an
        older *unrelated* version already existed from before the edit,
        incorrectly declared "nothing to do" - silently returning the OLD
        pre-edit PDF instead of validating and rendering the edited one, and
        never updating the dashboard's status away from mid-retry."""
        # Edited but keeps the same headings (only body text differs) so
        # this test isolates the content_hash/skip bug rather than also
        # exercising heading-preservation validation.
        EDITED_MARKDOWN = SOURCE_MARKDOWN + "\nAdditional detail about the database schema.\n"

        first = _process(client)
        assert first.json()["skipped"] is False
        artifact_id = first.json()["artifact_id"]

        retry1 = _process(
            client,
            source_markdown=EDITED_MARKDOWN,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=0,
        )
        assert retry1.json()["status"] == "retry_needed"

        retry2 = _process(
            client,
            source_markdown=EDITED_MARKDOWN,
            enriched_json=make_enriched_json(),
            retry_count=1,
        )
        body = retry2.json()
        assert body["status"] == "ok"
        assert body["skipped"] is False
        assert body["artifact_id"] == artifact_id
        assert body["version"]["version_no"] == 2


class TestCrossProjectArtifactIds:
    def test_different_projects_first_artifacts_get_different_ids(self, client):
        """
        Regression test: artifact ids must be globally unique. They previously
        were generated by counting artifacts *within* the requesting project,
        but `artifacts.id` is a table-wide primary key - so every project's
        first document computed to "artifact-1", silently overwriting
        whichever project got there first (upsert_artifact succeeds, then
        add_doc_version raises an uncaught UNIQUE-constraint error on the
        second project's request - but only *after* its PDF was already
        written to disk under the wrong/colliding artifact_id).
        """
        first = _process(
            client,
            project_id="project-alpha",
            source_path="alpha/spec.md",
            source_markdown=SOURCE_MARKDOWN,
            enriched_json=make_enriched_json(),
        )
        second = _process(
            client,
            project_id="project-beta",
            source_path="beta/spec.md",
            source_markdown=SOURCE_MARKDOWN,
            enriched_json=make_enriched_json(),
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["status"] == "ok"
        assert second.json()["status"] == "ok"
        assert first.json()["artifact_id"] != second.json()["artifact_id"]


class TestStatusEndpoint:
    def test_status_reports_dropped_items(self, client):
        processed = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=2,
        )
        artifact_id = processed.json()["artifact_id"]

        response = client.get(f"/api/status/{artifact_id}", headers=AUTH_HEADERS)
        assert response.status_code == 200
        body = response.json()
        assert body["dropped_items"]["diagrams"] == ["architecture"]
        assert body["latest_version"]["version_no"] == 1

    def test_status_404_for_unknown_artifact(self, client):
        response = client.get("/api/status/does-not-exist", headers=AUTH_HEADERS)
        assert response.status_code == 404
