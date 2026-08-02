"""
Integration tests for the server-side processing-exceptions list: a
project-scoped set of source paths (exact files or folder prefixes) that
should never be turned into a PDF, managed entirely through the backend so
it takes effect immediately for every caller with no VS Code extension
changes, repackage, or reload required - the client-side (extension
excludePatterns) equivalent proved unreliable in practice.
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

    import app.api.routes as routes
    import app.api.process_routes as process_routes
    import app.main as main_module

    importlib.reload(routes)
    importlib.reload(process_routes)
    importlib.reload(main_module)

    return TestClient(main_module.app)


def _project_id(client, name="demo-project"):
    response = client.post("/api/projects", json={"name": name}, headers=AUTH_HEADERS)
    return response.json()["id"]


class TestExceptionsCrud:
    def test_add_list_and_remove_an_exception(self, client):
        project_id = _project_id(client)

        add_response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )
        assert add_response.status_code == 200
        exception = add_response.json()["exception"]
        assert exception["source_path"] == ".specify/templates"
        assert exception["project_id"] == project_id

        list_response = client.get(f"/api/projects/{project_id}/exceptions", headers=AUTH_HEADERS)
        exceptions = list_response.json()["exceptions"]
        assert len(exceptions) == 1
        assert exceptions[0]["id"] == exception["id"]

        delete_response = client.delete(
            f"/api/projects/{project_id}/exceptions/{exception['id']}", headers=AUTH_HEADERS
        )
        assert delete_response.status_code == 200

        list_after_delete = client.get(f"/api/projects/{project_id}/exceptions", headers=AUTH_HEADERS)
        assert list_after_delete.json()["exceptions"] == []

    def test_adding_the_same_path_twice_does_not_duplicate(self, client):
        project_id = _project_id(client)
        client.post(f"/api/projects/{project_id}/exceptions", json={"source_path": "docs/onepager.md"}, headers=AUTH_HEADERS)
        client.post(f"/api/projects/{project_id}/exceptions", json={"source_path": "docs/onepager.md"}, headers=AUTH_HEADERS)

        exceptions = client.get(f"/api/projects/{project_id}/exceptions", headers=AUTH_HEADERS).json()["exceptions"]
        assert len(exceptions) == 1

    def test_exceptions_are_scoped_per_project(self, client):
        project_a = _project_id(client, "project-a")
        project_b = _project_id(client, "project-b")

        client.post(f"/api/projects/{project_a}/exceptions", json={"source_path": "docs/x.md"}, headers=AUTH_HEADERS)

        assert len(client.get(f"/api/projects/{project_a}/exceptions", headers=AUTH_HEADERS).json()["exceptions"]) == 1
        assert client.get(f"/api/projects/{project_b}/exceptions", headers=AUTH_HEADERS).json()["exceptions"] == []


class TestExclusionEnforcement:
    def test_excluded_folder_prefix_blocks_process_without_creating_an_artifact(self, client):
        project_id = _project_id(client)
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )

        response = _process(
            client,
            project_id="demo-project",
            source_path=".specify/templates/spec-template.md",
        )
        body = response.json()
        assert body["status"] == "ok"
        assert body["skipped"] is True
        assert body["excluded"] is True

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert artifacts == []

    def test_excluded_exact_file_blocks_process(self, client):
        project_id = _project_id(client)
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": "docs/onepager.md"},
            headers=AUTH_HEADERS,
        )

        response = _process(client, project_id="demo-project", source_path="docs/onepager.md")
        assert response.json()["excluded"] is True

    def test_folder_prefix_does_not_match_a_similarly_named_sibling_folder(self, client):
        """Regression: ".specify/templates" must not accidentally exclude
        ".specify/templates-old/..." via a naive (non-boundary-checked)
        startswith check."""
        project_id = _project_id(client)
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )

        response = _process(
            client,
            project_id="demo-project",
            source_path=".specify/templates-old/spec-template.md",
        )
        body = response.json()
        assert body.get("excluded") is not True
        assert body["status"] == "ok"

    def test_unrelated_file_in_the_same_project_is_not_excluded(self, client):
        project_id = _project_id(client)
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )

        response = _process(client)  # default payload: specs/demo/spec.md
        body = response.json()
        assert body.get("excluded") is not True
        assert body["status"] == "ok"

    def test_excluded_path_blocks_report_step_too(self, client):
        project_id = _project_id(client)
        client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )

        response = client.post(
            "/api/processing-status",
            json={
                "project_id": "demo-project",
                "source_path": ".specify/templates/plan-template.md",
                "step": "transforming_with_ai",
            },
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        assert response.json() == {"status": "excluded"}

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert artifacts == []


class TestRetroactiveHiding:
    """Excluding a path hides any artifact that already exists under it, so
    it disappears from the dashboard immediately - hidden, not deleted, so
    removing the exception later brings it straight back (same PDF, no
    reprocessing) instead of losing it for good."""

    def test_adding_an_exact_match_exception_hides_the_existing_artifact(self, client):
        project_id = _project_id(client)
        processed = _process(client)
        assert processed.json()["skipped"] is False
        artifact_id = processed.json()["artifact_id"]

        response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": "specs/demo/spec.md"},
            headers=AUTH_HEADERS,
        )
        assert response.json()["hidden_artifact_ids"] == [artifact_id]

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert artifacts == []

    def test_adding_a_folder_prefix_exception_hides_matching_artifacts_only(self, client):
        project_id = _project_id(client)
        under_folder = _process(client, source_path=".specify/templates/spec-template.md")
        sibling_folder = _process(client, source_path=".specify/templates-old/spec-template.md")
        unrelated = _process(client, source_path="specs/demo/spec.md")
        assert under_folder.json()["skipped"] is False
        assert sibling_folder.json()["skipped"] is False
        assert unrelated.json()["skipped"] is False

        response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )
        assert response.json()["hidden_artifact_ids"] == [under_folder.json()["artifact_id"]]

        remaining_paths = {
            a["source_path"]
            for a in client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        }
        assert remaining_paths == {".specify/templates-old/spec-template.md", "specs/demo/spec.md"}

    def test_adding_an_exception_that_matches_nothing_hides_nothing(self, client):
        project_id = _project_id(client)
        processed = _process(client)
        assert processed.json()["skipped"] is False

        response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": "docs/unrelated.md"},
            headers=AUTH_HEADERS,
        )
        assert response.json()["hidden_artifact_ids"] == []

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert len(artifacts) == 1


class TestUnhideOnExceptionRemoval:
    """Removing an exception must bring back any PDF that was hidden solely
    because of it."""

    def test_removing_the_exception_unhides_the_artifact(self, client):
        project_id = _project_id(client)
        processed = _process(client)
        artifact_id = processed.json()["artifact_id"]

        add_response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": "specs/demo/spec.md"},
            headers=AUTH_HEADERS,
        )
        exception_id = add_response.json()["exception"]["id"]
        assert client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"] == []

        remove_response = client.delete(
            f"/api/projects/{project_id}/exceptions/{exception_id}", headers=AUTH_HEADERS
        )
        assert remove_response.json()["unhidden_artifact_ids"] == [artifact_id]

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert [a["id"] for a in artifacts] == [artifact_id]

    def test_removing_a_folder_prefix_exception_unhides_everything_under_it(self, client):
        project_id = _project_id(client)
        first = _process(client, source_path=".specify/templates/spec-template.md")
        second = _process(client, source_path=".specify/templates/plan-template.md")

        add_response = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        )
        exception_id = add_response.json()["exception"]["id"]
        assert add_response.json()["hidden_artifact_ids"] == [
            first.json()["artifact_id"],
            second.json()["artifact_id"],
        ]

        remove_response = client.delete(
            f"/api/projects/{project_id}/exceptions/{exception_id}", headers=AUTH_HEADERS
        )
        assert set(remove_response.json()["unhidden_artifact_ids"]) == {
            first.json()["artifact_id"],
            second.json()["artifact_id"],
        }

        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert len(artifacts) == 2

    def test_overlapping_exceptions_keep_artifact_hidden_until_the_last_one_is_removed(self, client):
        """A file can be covered by two exceptions at once (e.g. a broad
        ".specify" folder exception and a more specific
        ".specify/templates" one) - removing just one must not unhide it
        while the other still applies."""
        project_id = _project_id(client)
        processed = _process(client, source_path=".specify/templates/spec-template.md")
        artifact_id = processed.json()["artifact_id"]

        broad = client.post(
            f"/api/projects/{project_id}/exceptions", json={"source_path": ".specify"}, headers=AUTH_HEADERS
        ).json()["exception"]
        narrow = client.post(
            f"/api/projects/{project_id}/exceptions",
            json={"source_path": ".specify/templates"},
            headers=AUTH_HEADERS,
        ).json()["exception"]

        remove_narrow = client.delete(
            f"/api/projects/{project_id}/exceptions/{narrow['id']}", headers=AUTH_HEADERS
        )
        assert remove_narrow.json()["unhidden_artifact_ids"] == []
        assert client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"] == []

        remove_broad = client.delete(
            f"/api/projects/{project_id}/exceptions/{broad['id']}", headers=AUTH_HEADERS
        )
        assert remove_broad.json()["unhidden_artifact_ids"] == [artifact_id]
        artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=AUTH_HEADERS).json()["artifacts"]
        assert [a["id"] for a in artifacts] == [artifact_id]
