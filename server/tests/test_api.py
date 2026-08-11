"""RPC surface tests.

Every method the dashboard calls, exercised through the real dispatcher rather
than by calling handlers directly - a method registered under the wrong name is
exactly the kind of break that only shows up when the UI goes silent.

The PDF builder is stubbed. Typst has its own tests; what matters here is what
the surface records and returns.
"""

import io
import json

import pytest

from api import register
from db import Store
from rpc import Server


class Harness:
    """Drives the server the way the host does: one JSON line in, one out."""

    def __init__(self, tmp_path):
        self.store = Store(tmp_path / "speckit.sqlite3")
        self.output = io.StringIO()
        self.built = []
        self.tmp_path = tmp_path

        def build_pdf(request):
            self.built.append(request)
            pdf = tmp_path / f"{request['sourcePath'].replace('/', '_')}.pdf"
            pdf.write_bytes(b"%PDF-1.7")
            return {"pdfPath": str(pdf), "typstSource": None, "warnings": [], "diagramCount": 0}

        self.server = register(
            Server(stdin=io.StringIO(), stdout=self.output),
            self.store,
            build_pdf=build_pdf,
            log=lambda message: None,
        )

    def call(self, method, **params):
        self.output.seek(0)
        self.output.truncate()
        self.server._handle_line(json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}))
        reply = json.loads(self.output.getvalue().strip())
        if "error" in reply:
            raise AssertionError(f"{method} failed: {reply['error']['message']}")
        return reply["result"]

    def expect_error(self, method, **params):
        self.output.seek(0)
        self.output.truncate()
        self.server._handle_line(json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}))
        reply = json.loads(self.output.getvalue().strip())
        assert "error" in reply, f"{method} unexpectedly succeeded"
        return reply["error"]["message"]


@pytest.fixture
def api(tmp_path):
    harness = Harness(tmp_path)
    harness.call("createProject", id="/ws", name="Workspace")
    yield harness
    harness.store.close()


class TestDispatch:
    def test_unknown_method_is_reported(self, api):
        assert "Unknown method" in api.expect_error("noSuchMethod")

    def test_missing_required_parameter_is_reported(self, api):
        assert "projectId is required" in api.expect_error("listArtifacts")

    def test_ping_carries_the_protocol_version(self, api):
        assert api.call("ping")["protocol"] >= 3


class TestProjects:
    def test_projects_round_trip(self, api):
        assert [project["id"] for project in api.call("listProjects")["projects"]] == ["/ws"]

    def test_automation_mode_switches(self, api):
        assert api.call("setAutomationMode", projectId="/ws", mode="manual")["automation_mode"] == "manual"

    def test_invalid_automation_mode_is_refused(self, api):
        assert "automation_mode" in api.expect_error("setAutomationMode", projectId="/ws", mode="sometimes")


class TestConversion:
    def test_convert_records_an_artifact_and_a_version(self, api):
        result = api.call("convert", markdown="# Spec\n\nBody.", sourcePath="/ws/specs/spec.md", projectId="/ws")

        assert result["reused"] is False
        artifacts = api.call("listArtifacts", projectId="/ws")["artifacts"]
        assert artifacts[0]["source_path"] == "/ws/specs/spec.md"
        assert artifacts[0]["artifact_type"] == "spec"
        assert artifacts[0]["status"] == "complete"
        assert artifacts[0]["title"] == "Spec"

        versions = api.call("listVersions", artifactId=result["artifactId"])["versions"]
        assert versions[0]["version_no"] == 1

    def test_reconverting_identical_content_reuses_the_pdf(self, api):
        first = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        second = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")

        assert second["reused"] is True
        assert second["pdfPath"] == first["pdfPath"]
        assert len(api.built) == 1

    def test_force_rebuilds_identical_content(self, api):
        api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        again = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws", force=True)

        assert again["reused"] is False
        assert len(api.built) == 2

    def test_unsupported_enrichment_is_dropped_and_reported(self, api):
        result = api.call(
            "convert",
            markdown="# Spec\n\nThe gateway forwards requests.",
            sourcePath="/ws/spec.md",
            projectId="/ws",
            enrichment={
                "glossary": [{"term": "Kubernetes", "definition": "orchestrator", "evidence": "not in here"}]
            },
        )
        assert result["glossaryCount"] == 0
        assert result["dropped"][0]["kind"] == "glossary"

    def test_a_failed_build_marks_the_artifact_failed(self, tmp_path):
        harness = Harness(tmp_path)
        harness.call("createProject", id="/ws", name="Workspace")

        def explode(_request):
            raise RuntimeError("typst compile failed")

        harness.server = register(Server(stdin=io.StringIO(), stdout=harness.output), harness.store,
                                  build_pdf=explode, log=lambda message: None)
        harness.expect_error("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")

        artifact = harness.call("listArtifacts", projectId="/ws")["artifacts"][0]
        assert artifact["status"] == "failed"
        assert "typst compile failed" in artifact["metadata"]["error"]
        harness.store.close()

    def test_status_snapshot_matches_the_old_response_shape(self, api):
        result = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        status = api.call("artifactStatus", artifactId=result["artifactId"])

        assert set(status) == {
            "artifact",
            "latest_version",
            "version_count",
            "dropped_items",
            "validation_warnings",
            "cache_hit",
        }
        assert status["version_count"] == 1


class TestTags:
    def test_tags_round_trip(self, api):
        result = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        tagged = api.call("setTags", artifactId=result["artifactId"], tags=["api", "draft"])
        assert tagged["tags"] == ["api", "draft"]

    def test_tags_must_be_a_list(self, api):
        result = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        assert "list" in api.expect_error("setTags", artifactId=result["artifactId"], tags="api")


class TestBoard:
    TASKS_MD = """# Tasks

## Phase 1: Setup

- [x] T001 Scaffold the project
- [ ] T002 [P] [US1] Wire the pipeline
"""

    def test_converting_a_tasks_file_populates_the_board(self, api):
        # The board and the file are the same information; the resync on every
        # render is what keeps them from drifting.
        api.call("convert", markdown=self.TASKS_MD, sourcePath="/ws/specs/tasks.md", projectId="/ws")

        tasks = api.call("listTasks", projectId="/ws")["tasks"]
        assert [task["task_key"] for task in tasks] == ["T001", "T002"]
        assert tasks[0]["board_status"] == "done"
        assert tasks[1]["parallel"] is True
        assert tasks[1]["story"] == "US1"

    def test_a_non_tasks_file_does_not_populate_the_board(self, api):
        api.call("convert", markdown=self.TASKS_MD, sourcePath="/ws/specs/spec.md", projectId="/ws")
        assert api.call("listTasks", projectId="/ws")["tasks"] == []

    def test_moving_a_card_survives_the_next_render(self, api):
        api.call("convert", markdown=self.TASKS_MD, sourcePath="/ws/specs/tasks.md", projectId="/ws")
        task = [t for t in api.call("listTasks", projectId="/ws")["tasks"] if t["task_key"] == "T002"][0]

        api.call("setTaskStatus", taskId=task["id"], boardStatus="in_progress")
        api.call("convert", markdown=self.TASKS_MD, sourcePath="/ws/specs/tasks.md", projectId="/ws", force=True)

        after = {t["task_key"]: t["board_status"] for t in api.call("listTasks", projectId="/ws")["tasks"]}
        assert after["T002"] == "in_progress"

    def test_unknown_board_status_is_refused(self, api):
        api.call("convert", markdown=self.TASKS_MD, sourcePath="/ws/specs/tasks.md", projectId="/ws")
        task = api.call("listTasks", projectId="/ws")["tasks"][0]
        assert "board status" in api.expect_error("setTaskStatus", taskId=task["id"], boardStatus="later")


class TestFilesAndExceptions:
    def test_files_sync_and_report_their_artifact(self, api):
        api.call("syncFiles", projectId="/ws", files=[{"source_path": "/ws/spec.md"}, {"source_path": "/ws/b.md"}])
        api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")

        files = {entry["source_path"]: entry for entry in api.call("listFiles", projectId="/ws")["files"]}
        assert files["/ws/spec.md"]["artifact_status"] == "complete"
        assert files["/ws/b.md"]["artifact_id"] is None

    def test_transform_requests_are_handed_over_once(self, api):
        api.call("syncFiles", projectId="/ws", files=[{"source_path": "/ws/spec.md"}])
        api.call("requestTransform", projectId="/ws", sourcePath="/ws/spec.md")

        assert api.call("takeTransformRequests", projectId="/ws")["paths"] == ["/ws/spec.md"]
        assert api.call("takeTransformRequests", projectId="/ws")["paths"] == []

    def test_exceptions_round_trip(self, api):
        created = api.call("addException", projectId="/ws", sourcePath="/ws/skip.md")
        assert api.call("isExcepted", projectId="/ws", sourcePath="/ws/skip.md")["excluded"] is True

        api.call("removeException", exceptionId=created["id"])
        assert api.call("listExceptions", projectId="/ws")["exceptions"] == []

    def test_a_folder_exception_covers_its_contents(self, api):
        api.call("addException", projectId="/ws", sourcePath=".specify/templates")
        assert api.call("isExcepted", projectId="/ws", sourcePath=".specify/templates/spec.md")["excluded"] is True


class TestVersionPdf:
    def test_version_pdf_returns_a_path_the_host_can_open(self, api):
        # Not the bytes: pushing a multi-megabyte PDF through a JSON line would
        # be absurd, and the host can read files.
        result = api.call("convert", markdown="# Spec", sourcePath="/ws/spec.md", projectId="/ws")
        version = api.call("listVersions", artifactId=result["artifactId"])["versions"][0]

        pdf = api.call("versionPdf", versionId=version["id"])
        assert pdf["exists"] is True
        assert pdf["pdfPath"].endswith(".pdf")

    def test_unknown_version_is_reported(self, api):
        assert "No such version" in api.expect_error("versionPdf", versionId="nope")


class TestSettings:
    def test_settings_round_trip(self, api):
        api.call("setSetting", key="theme", value="dark")
        assert api.call("getSetting", key="theme")["value"] == "dark"

    def test_missing_setting_falls_back(self, api):
        assert api.call("getSetting", key="absent", default="light")["value"] == "light"
