"""
Integration tests for the Kanban board's task sync: processing a
tasks.md-classified artifact populates individual task rows (see
tasks_parser.py + AgenticPipelineService._sync_kanban_tasks), reprocessing
re-syncs them from the file's current content while preserving each task's
board_status (todo/in_progress/done) unless its own checkbox newly flips to
done, and the list/update-status endpoints expose this to the frontend.
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


TASKS_MARKDOWN_V1 = """# Tasks: Example Feature

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create project structure
- [ ] T002 [P] Configure linting

## Phase 3: User Story 1 - Login (Priority: P1)

- [ ] T010 [P] [US1] Contract test for login
- [x] T011 [US1] Create User model
"""


def make_tasks_enriched_json(extra_sections=None):
    sections = [
        {"heading": "Phase 1: Setup (Shared Infrastructure)", "content": "Setup tasks.", "type": "normal", "level": 1},
        {"heading": "Phase 3: User Story 1 - Login (Priority: P1)", "content": "Login tasks.", "type": "normal", "level": 1},
    ]
    if extra_sections:
        sections.extend(extra_sections)
    return {
        "title": "Tasks: Example Feature",
        "abstract": "Task list.",
        "sections": sections,
        "diagrams": [],
        "glossary": [],
        "summaries": {"executiveSummary": "Tasks for the example feature."},
    }


def _process_tasks(client, source_markdown=TASKS_MARKDOWN_V1, enriched_json=None, **overrides):
    return _process(
        client,
        source_path="specs/demo/tasks.md",
        source_markdown=source_markdown,
        enriched_json=enriched_json or make_tasks_enriched_json(),
        **overrides,
    )


def _project_id(client, name="demo-project"):
    response = client.post("/api/projects", json={"name": name}, headers=AUTH_HEADERS)
    return response.json()["id"]


class TestKanbanTaskSync:
    def test_processing_a_tasks_md_creates_kanban_tasks_matching_the_file(self, client):
        project_id = _project_id(client)
        response = _process_tasks(client)
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        by_key = {t["task_key"]: t for t in tasks}

        assert set(by_key) == {"T001", "T002", "T010", "T011"}
        assert by_key["T002"]["parallel"] is True
        assert by_key["T010"]["story"] == "US1"
        assert by_key["T001"]["description"] == "Create project structure"
        assert by_key["T001"]["phase"] == "Phase 1: Setup (Shared Infrastructure)"
        # T011's checkbox is already [x] in the file - a brand new task
        # that's already done should land straight in the "done" column.
        assert by_key["T011"]["checkbox_done"] is True
        assert by_key["T011"]["board_status"] == "done"
        # Everything else starts in "todo".
        assert by_key["T001"]["board_status"] == "todo"

    def test_non_task_artifact_does_not_create_kanban_tasks(self, client):
        project_id = _project_id(client)
        response = _process(client)  # default payload classifies as "spec"
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert tasks == []

    def test_reprocessing_preserves_manually_set_board_status_and_adds_new_tasks(self, client):
        project_id = _project_id(client)
        _process_tasks(client)

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        t001_id = next(t for t in tasks if t["task_key"] == "T001")["id"]

        # Simulate the user dragging T001's card to "In Progress".
        move_response = client.patch(
            f"/api/kanban-tasks/{t001_id}", json={"board_status": "in_progress"}, headers=AUTH_HEADERS
        )
        assert move_response.json()["task"]["board_status"] == "in_progress"

        # Resubmit with an added phase/task - T001's own line is untouched.
        v2_markdown = TASKS_MARKDOWN_V1 + "\n## Phase 6: Polish\n\n- [ ] T020 Documentation updates\n"
        v2_enriched = make_tasks_enriched_json(
            extra_sections=[{"heading": "Phase 6: Polish", "content": "Polish tasks.", "type": "normal", "level": 1}]
        )
        response = _process_tasks(client, source_markdown=v2_markdown, enriched_json=v2_enriched, retry_count=0)
        assert response.json()["skipped"] is False

        tasks_after = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        by_key = {t["task_key"]: t for t in tasks_after}

        assert by_key["T001"]["board_status"] == "in_progress"  # preserved, not reset to "todo"
        assert "T020" in by_key  # new task appeared
        assert by_key["T020"]["board_status"] == "todo"

    def test_checkbox_flipping_to_done_auto_promotes_board_status(self, client):
        project_id = _project_id(client)
        _process_tasks(client)

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert next(t for t in tasks if t["task_key"] == "T001")["board_status"] == "todo"

        v2_markdown = TASKS_MARKDOWN_V1.replace("- [ ] T001 Create project structure", "- [x] T001 Create project structure")
        response = _process_tasks(client, source_markdown=v2_markdown, retry_count=0)
        assert response.json()["skipped"] is False

        tasks_after = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        t001_after = next(t for t in tasks_after if t["task_key"] == "T001")
        assert t001_after["checkbox_done"] is True
        assert t001_after["board_status"] == "done"

    def test_task_removed_from_file_is_deleted_from_the_board(self, client):
        project_id = _project_id(client)
        _process_tasks(client)

        v2_markdown = """# Tasks: Example Feature

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Create project structure

## Phase 3: User Story 1 - Login (Priority: P1)

- [ ] T010 [P] [US1] Contract test for login
- [x] T011 [US1] Create User model
"""
        response = _process_tasks(client, source_markdown=v2_markdown, retry_count=0)
        assert response.json()["skipped"] is False

        tasks_after = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert {t["task_key"] for t in tasks_after} == {"T001", "T010", "T011"}


class TestKanbanTaskFriendlyDescriptions:
    """
    The AI can optionally include a top-level taskDescriptions array in
    enriched_json (see EnrichmentPromptBuilder's task-descriptions
    guidance) mapping task_key -> a user-friendly rewrite of the raw
    checklist text. When present, it takes priority over the raw
    regex-parsed description; when absent (older clients, non-AI providers,
    the rule-based fallback), behavior is unchanged from before this field
    existed.
    """

    def test_friendly_description_overrides_the_raw_checklist_text(self, client):
        project_id = _project_id(client)
        enriched = make_tasks_enriched_json()
        enriched["taskDescriptions"] = [
            {"taskKey": "T001", "description": "Set up the initial project scaffolding."},
        ]
        response = _process_tasks(client, enriched_json=enriched)
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        by_key = {t["task_key"]: t for t in tasks}

        assert by_key["T001"]["description"] == "Set up the initial project scaffolding."
        # T002 has no matching taskDescriptions entry - falls back to the
        # raw regex-parsed text exactly as before this field existed.
        assert by_key["T002"]["description"] == "Configure linting"

    def test_missing_taskdescriptions_field_falls_back_to_raw_text(self, client):
        project_id = _project_id(client)
        response = _process_tasks(client)  # make_tasks_enriched_json() has no taskDescriptions
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        by_key = {t["task_key"]: t for t in tasks}
        assert by_key["T001"]["description"] == "Create project structure"

    def test_malformed_taskdescriptions_entries_are_skipped_without_erroring(self, client):
        project_id = _project_id(client)
        enriched = make_tasks_enriched_json()
        enriched["taskDescriptions"] = [
            {"taskKey": "T001"},  # missing description
            {"description": "orphaned, no taskKey"},  # missing taskKey
            "not even a dict",
            {"taskKey": "T002", "description": "Turn on the linter."},
        ]
        response = _process_tasks(client, enriched_json=enriched)
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        by_key = {t["task_key"]: t for t in tasks}

        # The one well-formed entry still applies...
        assert by_key["T002"]["description"] == "Turn on the linter."
        # ...while the malformed ones are ignored, falling back to raw text.
        assert by_key["T001"]["description"] == "Create project structure"

    def test_friendly_description_updates_on_resync(self, client):
        # source_markdown must actually change between calls - identical
        # content hashes short-circuit as an already-rendered skip (see
        # AgenticPipelineService._check_skip), which would never re-run
        # _sync_kanban_tasks with the new enriched_json at all.
        project_id = _project_id(client)
        enriched_v1 = make_tasks_enriched_json()
        enriched_v1["taskDescriptions"] = [{"taskKey": "T001", "description": "First friendly description."}]
        _process_tasks(client, enriched_json=enriched_v1)

        v2_markdown = TASKS_MARKDOWN_V1 + "\n## Phase 6: Polish\n\n- [ ] T020 Documentation updates\n"
        enriched_v2 = make_tasks_enriched_json(
            extra_sections=[{"heading": "Phase 6: Polish", "content": "Polish tasks.", "type": "normal", "level": 1}]
        )
        enriched_v2["taskDescriptions"] = [{"taskKey": "T001", "description": "Updated friendly description."}]
        response = _process_tasks(client, source_markdown=v2_markdown, enriched_json=enriched_v2, retry_count=0)
        assert response.json()["skipped"] is False

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert next(t for t in tasks if t["task_key"] == "T001")["description"] == "Updated friendly description."


class TestKanbanTaskEndpoints:
    def test_kanban_tasks_are_scoped_per_project(self, client):
        project_a = _project_id(client, "project-a")
        project_b = _project_id(client, "project-b")

        _process_tasks(client, project_id="project-a")

        assert len(client.get(f"/api/projects/{project_a}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]) == 4
        assert client.get(f"/api/projects/{project_b}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"] == []

    def test_update_kanban_task_status_persists_the_move(self, client):
        project_id = _project_id(client)
        _process_tasks(client)
        task_id = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"][0]["id"]

        response = client.patch(
            f"/api/kanban-tasks/{task_id}", json={"board_status": "done"}, headers=AUTH_HEADERS
        )
        assert response.status_code == 200
        assert response.json()["task"]["board_status"] == "done"

        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert next(t for t in tasks if t["id"] == task_id)["board_status"] == "done"

    def test_update_kanban_task_status_can_also_move_a_task_to_a_different_phase(self, client):
        project_id = _project_id(client)
        _process_tasks(client)
        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        t001 = next(t for t in tasks if t["task_key"] == "T001")
        assert t001["phase"] == "Phase 1: Setup (Shared Infrastructure)"

        response = client.patch(
            f"/api/kanban-tasks/{t001['id']}",
            json={"board_status": "in_progress", "phase": "Phase 3: User Story 1 - Login (Priority: P1)", "phase_order": 1},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        moved = response.json()["task"]
        assert moved["board_status"] == "in_progress"
        assert moved["phase"] == "Phase 3: User Story 1 - Login (Priority: P1)"
        assert moved["phase_order"] == 1

        tasks_after = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert next(t for t in tasks_after if t["id"] == t001["id"])["phase"] == "Phase 3: User Story 1 - Login (Priority: P1)"

    def test_update_kanban_task_status_without_phase_leaves_phase_untouched(self, client):
        project_id = _project_id(client)
        _process_tasks(client)
        tasks = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        t001 = next(t for t in tasks if t["task_key"] == "T001")
        original_phase = t001["phase"]

        client.patch(f"/api/kanban-tasks/{t001['id']}", json={"board_status": "done"}, headers=AUTH_HEADERS)

        tasks_after = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"]
        assert next(t for t in tasks_after if t["id"] == t001["id"])["phase"] == original_phase

    def test_update_kanban_task_status_rejects_an_invalid_status_value(self, client):
        project_id = _project_id(client)
        _process_tasks(client)
        task_id = client.get(f"/api/projects/{project_id}/kanban-tasks", headers=AUTH_HEADERS).json()["tasks"][0]["id"]

        response = client.patch(
            f"/api/kanban-tasks/{task_id}", json={"board_status": "not-a-real-status"}, headers=AUTH_HEADERS
        )
        assert response.status_code == 422

    def test_update_kanban_task_status_404s_for_unknown_task(self, client):
        response = client.patch(
            "/api/kanban-tasks/999999", json={"board_status": "done"}, headers=AUTH_HEADERS
        )
        assert response.status_code == 404

    def test_kanban_tasks_endpoints_require_api_key(self, client):
        project_id = _project_id(client)
        assert client.get(f"/api/projects/{project_id}/kanban-tasks").status_code == 401
        assert client.patch("/api/kanban-tasks/1", json={"board_status": "done"}).status_code == 401
