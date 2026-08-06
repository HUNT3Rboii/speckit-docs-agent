"""
Integration tests for the cancel/retry feature: a web frontend user can flag
an in-flight artifact for cancellation, or flag a completed/failed one for a
full reprocess - both are one-shot signal flags in artifact metadata that the
VS Code extension (the only thing that can actually run the AI pipeline)
notices and acts on the next time it talks to the backend.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from app.services.diagram_rendering_service import DiagramRenderingService, RenderResult

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
    import app.api.routes as routes
    import app.main as main_module

    importlib.reload(process_routes)
    importlib.reload(routes)
    importlib.reload(main_module)

    return TestClient(main_module.app)


def _report_step(client, **overrides):
    payload = {
        "project_id": "demo-project",
        "source_path": "specs/demo/spec.md",
        "step": "transforming_with_ai",
    }
    payload.update(overrides)
    return client.post("/api/processing-status", json=payload, headers=AUTH_HEADERS)


class TestCancelEndpoint:
    def test_cancel_sets_the_flag_on_the_artifact(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]

        response = client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)
        assert response.status_code == 200
        assert response.json()["artifact"]["metadata"]["cancel_requested"] is True

    def test_cancel_unknown_artifact_404s(self, client):
        response = client.post("/api/artifacts/does-not-exist/cancel", headers=AUTH_HEADERS)
        assert response.status_code == 404

    def test_cancel_requires_api_key(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        response = client.post(f"/api/artifacts/{artifact_id}/cancel")
        assert response.status_code == 401

    def test_cancel_does_not_disturb_unrelated_metadata(self, client):
        """set_metadata_flag must be a read-modify-write on the one key,
        not a wholesale metadata replacement - confirm sibling fields
        (current_step, attempt) survive a cancel request untouched."""
        artifact_id = _report_step(client, attempt=2, max_attempts=5).json()["artifact"]["id"]

        response = client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)
        metadata = response.json()["artifact"]["metadata"]
        assert metadata["current_step"] == "transforming_with_ai"
        assert metadata["attempt"] == 2
        assert metadata["max_attempts"] == 5


class TestCancelStatusEndpoint:
    """Read-only poll used while the extension's own AI call is still
    running - must never mutate state, unlike reportStep."""

    def test_reflects_a_pending_cancel(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        response = client.get(f"/api/artifacts/{artifact_id}/cancel-status", headers=AUTH_HEADERS)
        assert response.status_code == 200
        assert response.json() == {"cancel_requested": True}

    def test_false_when_nothing_requested(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        response = client.get(f"/api/artifacts/{artifact_id}/cancel-status", headers=AUTH_HEADERS)
        assert response.json() == {"cancel_requested": False}

    def test_never_mutates_the_flag_it_reads(self, client):
        """Unlike reportStep, polling this endpoint must not itself clear
        or otherwise change cancel_requested - repeated polls must keep
        seeing the same true value until something else acts on it."""
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        first = client.get(f"/api/artifacts/{artifact_id}/cancel-status", headers=AUTH_HEADERS)
        second = client.get(f"/api/artifacts/{artifact_id}/cancel-status", headers=AUTH_HEADERS)
        assert first.json() == {"cancel_requested": True}
        assert second.json() == {"cancel_requested": True}

    def test_unknown_artifact_404s(self, client):
        response = client.get("/api/artifacts/does-not-exist/cancel-status", headers=AUTH_HEADERS)
        assert response.status_code == 404

    def test_requires_api_key(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        response = client.get(f"/api/artifacts/{artifact_id}/cancel-status")
        assert response.status_code == 401


class TestRetryEndpoint:
    def test_retry_sets_the_flag_on_the_artifact(self, client):
        response = _process(client)
        artifact_id = response.json()["artifact_id"]

        retry_response = client.post(f"/api/artifacts/{artifact_id}/retry", headers=AUTH_HEADERS)
        assert retry_response.status_code == 200
        assert retry_response.json()["artifact"]["metadata"]["manual_retry_requested"] is True

    def test_retry_unknown_artifact_404s(self, client):
        response = client.post("/api/artifacts/does-not-exist/retry", headers=AUTH_HEADERS)
        assert response.status_code == 404

    def test_retry_requires_api_key(self, client):
        artifact_id = _process(client).json()["artifact_id"]
        response = client.post(f"/api/artifacts/{artifact_id}/retry")
        assert response.status_code == 401


class TestRetryRequestsPolling:
    def test_lists_pending_retry_for_the_owning_project(self, client):
        response = _process(client)
        artifact_id = response.json()["artifact_id"]
        client.post(f"/api/artifacts/{artifact_id}/retry", headers=AUTH_HEADERS)

        poll = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS)
        assert poll.status_code == 200
        requests = poll.json()["retry_requests"]
        assert requests == [{"artifact_id": artifact_id, "source_path": "specs/demo/spec.md"}]

    def test_empty_when_nothing_pending(self, client):
        _process(client)
        poll = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS)
        assert poll.json()["retry_requests"] == []

    def test_unknown_project_name_returns_empty_without_creating_a_project(self, client):
        """A workspace folder that's never been processed shouldn't spawn
        an empty project row just from being polled."""
        poll = client.get("/api/projects/never-seen-before/retry-requests", headers=AUTH_HEADERS)
        assert poll.status_code == 200
        assert poll.json()["retry_requests"] == []

        projects = client.post("/api/projects", json={"name": "__probe__"}, headers=AUTH_HEADERS).json()
        # Only __probe__ (created by this very call) should exist - confirm
        # the poll above didn't sneak in a "never-seen-before" project.
        all_projects = client.get("/api/projects", headers=AUTH_HEADERS).json()["projects"]
        assert not any(p["name"] == "never-seen-before" for p in all_projects)
        assert any(p["id"] == projects["id"] for p in all_projects)

    def test_requires_api_key(self, client):
        response = client.get("/api/projects/demo-project/retry-requests")
        assert response.status_code == 401


class TestCancelFlagLifecycle:
    """The cancel_requested flag is scoped to a single run: it must survive
    a mid-run status change, but never leak into the *next* run once a fresh
    attempt starts or the extension reports it acted on the cancellation."""

    def test_flag_survives_process_endpoints_own_status_rewrites(self, client):
        """process()'s set_status rebuilds metadata from scratch on every
        internal status transition - confirm a cancel requested before
        /api/process is called isn't silently wiped by that rebuild on a
        retry_needed outcome (the one process() branch that doesn't
        explicitly clear the flag on success)."""
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        response = _process(
            client,
            enriched_json=make_enriched_json(evidence="this text does not appear anywhere in the source"),
        )
        assert response.json()["status"] == "retry_needed"

        status = client.get(f"/api/status/{artifact_id}", headers=AUTH_HEADERS)
        assert status.json()["artifact"]["metadata"]["cancel_requested"] is True

    def test_successful_completion_clears_a_stale_cancel_flag(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        response = _process(client)
        assert response.json()["artifact"]["metadata"]["cancel_requested"] is False

    def test_a_fresh_attempt_1_report_clears_a_stale_cancel_flag_from_a_previous_run(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        # A brand-new run starting (attempt omitted/1, not a mid-run
        # correction retry) must not inherit the previous run's cancel flag.
        fresh = _report_step(client)
        assert fresh.json()["artifact"]["metadata"]["cancel_requested"] is False

    def test_mid_run_attempt_preserves_a_cancel_requested_between_this_run(self, client):
        _report_step(client)  # attempt 1 (implicit None)
        artifact_id = _report_step(client, attempt=1).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        mid_run = _report_step(client, attempt=2, max_attempts=5)
        assert mid_run.json()["artifact"]["metadata"]["cancel_requested"] is True

    def test_the_submitting_step_at_attempt_1_does_not_wipe_a_cancel_requested_during_the_ai_call(
        self, client
    ):
        """Regression test for a real "clicking Cancel does nothing" report.
        Root cause: report_step's stale-flag reset was keyed off attempt
        alone, but the "submitting" step (reported right after the AI call
        for the FIRST attempt finishes, before /api/process is called) is
        ALSO reported with attempt=1 - the same loop counter reused for the
        first correction-loop iteration, not a "brand new run" signal. That
        meant a cancel requested while attempt 1's AI call was still
        running got silently reset back to False the moment the run
        reached its very next checkpoint, before the extension's response
        check ever saw it as true - cancel_requested was live for a window
        no reportStep call ever actually observed.
        """
        artifact_id = _report_step(client, step="transforming_with_ai", attempt=1).json()["artifact"]["id"]
        # Simulate a cancel click landing while the AI call for attempt 1
        # is still in flight (i.e. after the initial "transforming_with_ai"
        # report, before "submitting").
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        submitting = _report_step(client, step="submitting", attempt=1, max_attempts=5)
        assert submitting.json()["artifact"]["metadata"]["cancel_requested"] is True

    def test_reporting_cancelled_clears_the_flag_and_sets_status(self, client):
        artifact_id = _report_step(client).json()["artifact"]["id"]
        client.post(f"/api/artifacts/{artifact_id}/cancel", headers=AUTH_HEADERS)

        cancelled = _report_step(client, step="cancelled")
        artifact = cancelled.json()["artifact"]
        assert artifact["status"] == "cancelled"
        assert artifact["metadata"]["cancel_requested"] is False
        assert artifact["metadata"]["current_step"] is None

    def test_a_manual_retry_flag_is_cleared_once_the_extension_starts_reprocessing(self, client):
        response = _process(client)
        artifact_id = response.json()["artifact_id"]
        client.post(f"/api/artifacts/{artifact_id}/retry", headers=AUTH_HEADERS)

        # The extension picks up the retry request and starts a fresh run -
        # its very first step report must clear the one-shot flag so it
        # doesn't keep re-appearing in every future poll.
        _report_step(client)

        poll = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS)
        assert poll.json()["retry_requests"] == []
