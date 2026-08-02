"""
Integration tests for live processing-status visibility: an artifact must
appear (with status="processing" and a current_step) as soon as /api/process
starts, be reachable via /api/projects/{id}/artifacts and /api/status/{id}
while the pipeline runs, and land on status="rendered" (current_step=None)
once done - or "retry_needed" / "failed" on the corresponding non-happy
paths, rather than being left stuck on "processing" forever.
"""

import importlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.services.diagram_rendering_service import DiagramRenderingService, RenderResult
from app.services.html_generator import HTMLGeneratorService

from test_process_endpoint import SOURCE_MARKDOWN, make_enriched_json, AUTH_HEADERS, _process  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "doc_agent.sqlite3"
    output_dir = tmp_path / "pdfs"
    monkeypatch.setenv("DOC_AGENT_DB_PATH", str(db_path))
    monkeypatch.setenv("DOC_OUTPUT_DIR", str(output_dir))
    monkeypatch.setenv("SPECKIT_EXT_API_KEY", "dev-key")

    def fake_render_diagram(self, mermaid_code, diagram_id):
        return RenderResult(success=True, image_path=str(output_dir / f"{diagram_id}.png"), rendering_method="stub")

    monkeypatch.setattr(DiagramRenderingService, "render_diagram", fake_render_diagram)

    import app.api.process_routes as process_routes
    import app.main as main_module

    importlib.reload(process_routes)
    importlib.reload(main_module)

    return TestClient(main_module.app)


def _artifacts(client, project_id):
    return client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]


class TestProcessingStatus:
    def test_successful_pipeline_lands_on_rendered_with_no_current_step(self, client):
        response = _process(client)
        assert response.status_code == 200
        body = response.json()
        artifact_id = body["artifact_id"]
        project_id = body["artifact"]["project_id"]

        artifacts = _artifacts(client, project_id)
        artifact = next(a for a in artifacts if a["id"] == artifact_id)
        assert artifact["status"] == "rendered"
        assert artifact["metadata"]["current_step"] is None

    def test_retry_needed_leaves_artifact_visible_and_not_stuck_processing(self, client):
        response = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
            retry_count=0,
        )
        assert response.status_code == 200
        assert response.json()["status"] == "retry_needed"

        project_response = client.post(
            "/api/projects", json={"name": "demo-project"}, headers=AUTH_HEADERS
        )
        # demo-project was auto-created by _process(); look it up instead of
        # re-creating (creation is idempotent by name either way).
        project_id = project_response.json()["id"]

        artifacts = _artifacts(client, project_id)
        assert len(artifacts) == 1
        artifact = artifacts[0]
        assert artifact["status"] == "retry_needed"
        assert artifact["metadata"]["current_step"] == "awaiting_retry"
        # The structured validation error is persisted too, not just
        # returned in this one HTTP response - otherwise there'd be no way
        # to see *why* it's stuck once the calling agent's session ends
        # without ever resubmitting a correction.
        assert "ungrounded_diagrams" in artifact["metadata"]["structured_error"]["errors"]

    def test_pipeline_exception_marks_artifact_failed_instead_of_stuck_processing(self, client, monkeypatch):
        def boom(self, *args, **kwargs):
            raise RuntimeError("boom")

        monkeypatch.setattr(HTMLGeneratorService, "generate_html", boom)

        # TestClient re-raises unhandled exceptions by default (useful for
        # debugging) rather than returning the 500 a real deployment would -
        # what matters here is that the pipeline's own except-block ran and
        # persisted status="failed" before the exception propagated.
        with pytest.raises(RuntimeError, match="boom"):
            _process(client)

        project_response = client.post(
            "/api/projects", json={"name": "demo-project"}, headers=AUTH_HEADERS
        )
        project_id = project_response.json()["id"]

        artifacts = _artifacts(client, project_id)
        assert len(artifacts) == 1
        artifact = artifacts[0]
        assert artifact["status"] == "failed"
        assert artifact["metadata"]["current_step"] is None
        assert "boom" in artifact["metadata"]["error"]

    def test_status_endpoint_reflects_current_step_via_repo_directly(self, client):
        """The /api/status/{id} endpoint is what a client would poll mid-
        pipeline; here we can only assert on the final settled state via the
        synchronous TestClient, but confirm it surfaces current_step at all
        (None once rendered) so the contract the frontend polls against is
        exercised end-to-end."""
        response = _process(client)
        artifact_id = response.json()["artifact_id"]

        status_response = client.get(f"/api/status/{artifact_id}", headers=AUTH_HEADERS)
        assert status_response.status_code == 200
        body = status_response.json()
        assert body["artifact"]["status"] == "rendered"
        assert body["artifact"]["metadata"]["current_step"] is None


class TestReportStepEndpoint:
    """The extension's own steps (reading the file, calling the AI
    provider) happen before it has enough to call /api/process, so it pings
    /api/processing-status along the way - without this, those steps
    (often the slowest part, especially with a real LLM call) are invisible
    on the dashboard until they're already finished."""

    def test_report_step_creates_a_processing_artifact_before_process_is_ever_called(self, client):
        response = client.post(
            "/api/processing-status",
            json={
                "project_id": "demo-project",
                "source_path": "specs/demo/spec.md",
                "step": "transforming_with_ai",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        artifact = response.json()["artifact"]
        assert artifact["status"] == "processing"
        assert artifact["metadata"]["current_step"] == "transforming_with_ai"

        project_id = artifact["project_id"]
        artifacts = _artifacts(client, project_id)
        assert len(artifacts) == 1
        assert artifacts[0]["id"] == artifact["id"]

    def test_report_step_carries_attempt_number_for_dashboard_visibility(self, client):
        """A client-side correction loop can take several fresh-AI-call
        cycles; without attempt/max_attempts on the artifact, that looks
        indistinguishable from a hang on the dashboard."""
        response = client.post(
            "/api/processing-status",
            json={
                "project_id": "demo-project",
                "source_path": "specs/demo/spec.md",
                "step": "correcting",
                "attempt": 2,
                "max_attempts": 5,
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        metadata = response.json()["artifact"]["metadata"]
        assert metadata["attempt"] == 2
        assert metadata["max_attempts"] == 5

    def test_report_step_then_process_share_the_same_artifact_row(self, client):
        """process() resolves the artifact id by (project_id, source_path) -
        confirm a step reported first and the eventual process() call for
        the same document land on the same artifact rather than each
        minting their own id."""
        step_response = client.post(
            "/api/processing-status",
            json={
                "project_id": "demo-project",
                "source_path": "specs/demo/spec.md",
                "step": "transforming_with_ai",
            },
            headers=AUTH_HEADERS,
        )
        reported_artifact_id = step_response.json()["artifact"]["id"]

        process_response = _process(client)
        assert process_response.json()["artifact_id"] == reported_artifact_id

    def test_report_step_requires_api_key(self, client):
        response = client.post(
            "/api/processing-status",
            json={"project_id": "demo-project", "source_path": "specs/demo/spec.md", "step": "transforming_with_ai"},
        )
        assert response.status_code == 401
