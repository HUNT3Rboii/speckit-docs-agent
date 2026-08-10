"""
Integration tests for the project markdown inventory and the per-project
automatic/manual transformation setting.

The backend has no filesystem visibility into the caller's workspace, so
the inventory is pushed by the VS Code extension (POST .../files/sync) and
read back by the dashboard's Context Files page (GET .../files) - that tab's
whole purpose is listing files that have NOT been turned into a PDF and so
have no artifacts row to be listed from. Transform requests work the same
way as the per-artifact Retry button: the backend can only record the
intent, and the extension picks it up on its poll.
"""

import importlib

import pytest
from fastapi.testclient import TestClient

from app.services.diagram_rendering_service import DiagramRenderingService, RenderResult

from test_process_endpoint import AUTH_HEADERS, _process  # noqa: E402


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

    import app.api.routes as routes
    import app.api.process_routes as process_routes
    import app.main as main_module

    importlib.reload(routes)
    importlib.reload(process_routes)
    importlib.reload(main_module)

    return TestClient(main_module.app)


def _sync(client, paths, project_name="demo-project"):
    return client.post(
        f"/api/projects/{project_name}/files/sync",
        json={
            "files": [
                {"source_path": path, "size_bytes": 100, "modified_at": "2024-03-15T10:30:00Z"}
                for path in paths
            ]
        },
        headers=AUTH_HEADERS,
    )


def _files(client, project_id):
    return client.get(f"/api/projects/{project_id}/files", headers=AUTH_HEADERS).json()["files"]


class TestFileSync:
    def test_sync_creates_the_project_and_lists_what_was_pushed(self, client):
        """Unlike the read-only retry poll, a sync auto-creates the project:
        a workspace with markdown in it is worth listing even before
        anything in it has ever been processed."""
        response = _sync(client, ["docs/notes.md", "specs/demo/spec.md"])
        assert response.status_code == 200
        body = response.json()
        assert body["tracked_files"] == 2

        paths = {f["source_path"] for f in _files(client, body["project_id"])}
        assert paths == {"docs/notes.md", "specs/demo/spec.md"}

    def test_a_later_sync_replaces_the_inventory_rather_than_adding_to_it(self, client):
        project_id = _sync(client, ["docs/a.md", "docs/b.md"]).json()["project_id"]

        _sync(client, ["docs/a.md", "docs/c.md"])

        paths = {f["source_path"] for f in _files(client, project_id)}
        assert paths == {"docs/a.md", "docs/c.md"}

    def test_an_empty_sync_clears_the_inventory(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]
        _sync(client, [])
        assert _files(client, project_id) == []

    def test_inventories_are_scoped_per_project(self, client):
        project_a = _sync(client, ["docs/a.md"], project_name="project-a").json()["project_id"]
        project_b = _sync(client, ["docs/b.md"], project_name="project-b").json()["project_id"]

        assert {f["source_path"] for f in _files(client, project_a)} == {"docs/a.md"}
        assert {f["source_path"] for f in _files(client, project_b)} == {"docs/b.md"}

    def test_a_resync_keeps_a_pending_transform_request(self, client):
        """The extension resyncs on every file change, which for a file
        that was just queued happens well before it gets round to acting on
        the request - a resync wiping the flag would drop the request on the
        floor."""
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]
        client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "docs/a.md"},
            headers=AUTH_HEADERS,
        )

        _sync(client, ["docs/a.md", "docs/b.md"])

        queued = next(f for f in _files(client, project_id) if f["source_path"] == "docs/a.md")
        assert queued["transform_requested"] is True


class TestFileListingAnnotations:
    def test_a_file_that_has_been_processed_carries_its_artifact(self, client):
        processed = _process(client)  # default payload: specs/demo/spec.md
        artifact_id = processed.json()["artifact_id"]
        project_id = _sync(client, ["specs/demo/spec.md", "docs/untouched.md"]).json()["project_id"]

        files = {f["source_path"]: f for f in _files(client, project_id)}
        assert files["specs/demo/spec.md"]["artifact_id"] == artifact_id
        assert files["docs/untouched.md"]["artifact_id"] is None
        assert files["docs/untouched.md"]["artifact_status"] is None

    def test_excluded_files_are_flagged_rather_than_dropped(self, client):
        """The listing returns them so the caller can decide - the Context
        Files tab hides them, since the Exceptions tab is where they're
        managed."""
        project_id = _sync(client, ["docs/keep.md", ".github/workflows/notes.md"]).json()["project_id"]

        files = {f["source_path"]: f for f in _files(client, project_id)}
        # .github is one of the paths every new project is seeded with.
        assert files[".github/workflows/notes.md"]["is_excluded"] is True
        assert files["docs/keep.md"]["is_excluded"] is False


class TestTransformRequests:
    def test_requesting_a_transform_flags_the_file_for_the_extension(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]

        response = client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "docs/a.md"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        assert response.json()["file"]["transform_requested"] is True

        pending = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS).json()
        assert pending["transform_requests"] == [{"source_path": "docs/a.md"}]

    def test_requesting_a_transform_for_an_unknown_file_404s(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]

        response = client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "docs/never-existed.md"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 404

    def test_requesting_a_transform_for_an_excluded_file_is_rejected(self, client):
        """A stale tab (exclusion added from another window since it last
        loaded) would otherwise be able to fire off a request that
        /api/process silently drops anyway."""
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": "docs/a.md"},
            headers=AUTH_HEADERS,
        )

        response = client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "docs/a.md"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 409

    def test_processing_the_file_clears_the_request(self, client):
        """Cleared at the first sign of client-side work rather than on
        completion, so a run that dies halfway doesn't leave a request the
        extension re-picks-up on every poll forever."""
        project_id = _sync(client, ["specs/demo/spec.md"]).json()["project_id"]
        client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "specs/demo/spec.md"},
            headers=AUTH_HEADERS,
        )

        _process(client)

        pending = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS).json()
        assert pending["transform_requests"] == []

    def test_reporting_a_step_clears_the_request_too(self, client):
        project_id = _sync(client, ["specs/demo/spec.md"]).json()["project_id"]
        client.post(
            f"/api/projects/{project_id}/files/transform",
            json={"source_path": "specs/demo/spec.md"},
            headers=AUTH_HEADERS,
        )

        client.post(
            "/api/processing-status",
            json={
                "project_id": "demo-project",
                "source_path": "specs/demo/spec.md",
                "step": "transforming_with_ai",
            },
            headers=AUTH_HEADERS,
        )

        pending = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS).json()
        assert pending["transform_requests"] == []


class TestAutomationMode:
    def test_a_new_project_is_automatic(self, client):
        project = client.post("/api/projects", json={"name": "demo-project"}, headers=AUTH_HEADERS).json()
        assert project["automation_mode"] == "automatic"

    def test_switching_to_manual_persists_and_is_visible_to_the_extension(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]

        response = client.patch(
            f"/api/projects/{project_id}/automation-mode",
            json={"mode": "manual"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        assert response.json()["automation_mode"] == "manual"

        listed = client.get("/api/projects", headers=AUTH_HEADERS).json()["projects"]
        assert next(p for p in listed if p["id"] == project_id)["automation_mode"] == "manual"

        # The extension reads the mode off the poll it already runs, so a
        # change takes effect without any extension reload.
        pending = client.get("/api/projects/demo-project/retry-requests", headers=AUTH_HEADERS).json()
        assert pending["automation_mode"] == "manual"

    def test_switching_back_to_automatic(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]
        client.patch(
            f"/api/projects/{project_id}/automation-mode", json={"mode": "manual"}, headers=AUTH_HEADERS
        )

        response = client.patch(
            f"/api/projects/{project_id}/automation-mode",
            json={"mode": "automatic"},
            headers=AUTH_HEADERS,
        )
        assert response.json()["automation_mode"] == "automatic"

    def test_an_invalid_mode_is_rejected(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]
        response = client.patch(
            f"/api/projects/{project_id}/automation-mode",
            json={"mode": "sometimes"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 422

    def test_modes_are_scoped_per_project(self, client):
        project_a = _sync(client, ["docs/a.md"], project_name="project-a").json()["project_id"]
        project_b = _sync(client, ["docs/b.md"], project_name="project-b").json()["project_id"]

        client.patch(
            f"/api/projects/{project_a}/automation-mode", json={"mode": "manual"}, headers=AUTH_HEADERS
        )

        listed = {p["id"]: p for p in client.get("/api/projects", headers=AUTH_HEADERS).json()["projects"]}
        assert listed[project_a]["automation_mode"] == "manual"
        assert listed[project_b]["automation_mode"] == "automatic"

    def test_an_unknown_project_404s(self, client):
        response = client.patch(
            "/api/projects/proj-does-not-exist/automation-mode",
            json={"mode": "manual"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 404


class TestAuth:
    def test_the_new_endpoints_require_an_api_key(self, client):
        project_id = _sync(client, ["docs/a.md"]).json()["project_id"]

        assert client.get(f"/api/projects/{project_id}/files").status_code == 401
        assert (
            client.post(f"/api/projects/{project_id}/files/transform", json={"source_path": "docs/a.md"}).status_code
            == 401
        )
        assert (
            client.patch(f"/api/projects/{project_id}/automation-mode", json={"mode": "manual"}).status_code == 401
        )
        assert client.post("/api/projects/demo-project/files/sync", json={"files": []}).status_code == 401
