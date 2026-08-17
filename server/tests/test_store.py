"""Storage tests.

The database is per user and on disk, and the extension updates underneath it,
so migrations running against an old file matter as much as the queries do.
"""

import sqlite3

import pytest

from db import LATEST_VERSION, Store, classify, content_hash
from db.schema import connect


@pytest.fixture
def store(tmp_path):
    instance = Store(tmp_path / "nested" / "colophon.sqlite3")
    instance.upsert_project("/ws", "Workspace")
    yield instance
    instance.close()


class TestSchema:
    def test_migrations_run_on_a_fresh_database(self, store):
        assert store.schema_version == LATEST_VERSION

    def test_migrating_twice_is_a_no_op(self, tmp_path):
        path = tmp_path / "colophon.sqlite3"
        first = Store(path)
        first.close()

        second = Store(path)
        assert second.schema_version == LATEST_VERSION
        second.close()

    def test_wal_is_enabled(self, store):
        # Two VS Code windows means two backends on one file; without WAL the
        # second sees SQLITE_BUSY during ordinary use.
        assert store._connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"

    def test_a_second_connection_can_read_the_same_file(self, tmp_path):
        path = tmp_path / "shared.sqlite3"
        first = Store(path)
        first.upsert_project("/ws", "Workspace")

        second = Store(path)
        assert [project.id for project in second.projects()] == ["/ws"]

        first.close()
        second.close()


class TestMigrationFromV1:
    """A database written before the full model existed must carry across.

    This is the case the append-only rule exists for: someone converted
    documents with an earlier build, and updating the extension must not lose
    what they built.
    """

    def build_v1_database(self, path):
        connection = connect(str(path))
        from db.schema import MIGRATIONS

        connection.executescript(MIGRATIONS[0][1])
        connection.execute("PRAGMA user_version=1")
        connection.execute(
            "INSERT INTO documents (id, workspace, source_path, title, created_at, updated_at)"
            " VALUES (1, '/ws', '/ws/spec.md', 'Spec', '2026-01-01', '2026-01-02')"
        )
        connection.execute(
            "INSERT INTO versions (document_id, content_hash, pdf_path, diagram_count, warnings, created_at)"
            " VALUES (1, 'abc', '/tmp/spec.pdf', 2, '[\"w\"]', '2026-01-02')"
        )
        connection.execute(
            "INSERT INTO exceptions (workspace, source_path, created_at) VALUES ('/ws', '/ws/skip.md', '2026-01-01')"
        )
        connection.close()

    def test_documents_become_projects_and_artifacts(self, tmp_path):
        path = tmp_path / "old.sqlite3"
        self.build_v1_database(path)

        store = Store(path)
        assert store.schema_version == LATEST_VERSION
        assert [project.id for project in store.projects()] == ["/ws"]

        artifacts = store.artifacts("/ws")
        assert [artifact.source_path for artifact in artifacts] == ["/ws/spec.md"]
        assert artifacts[0].title == "Spec"
        store.close()

    def test_versions_and_exceptions_survive(self, tmp_path):
        path = tmp_path / "old.sqlite3"
        self.build_v1_database(path)

        store = Store(path)
        artifact = store.artifacts("/ws")[0]

        versions = store.versions(artifact.id)
        assert [version.pdf_path for version in versions] == ["/tmp/spec.pdf"]
        assert versions[0].version_no == 1
        assert versions[0].warnings == ["w"]

        assert [item.source_path for item in store.exceptions("/ws")] == ["/ws/skip.md"]
        store.close()


class TestProjects:
    def test_automation_mode_defaults_to_automatic(self, store):
        assert store.project("/ws").automation_mode == "automatic"

    def test_automation_mode_can_be_switched(self, store):
        assert store.set_automation_mode("/ws", "manual").automation_mode == "manual"

    def test_unknown_automation_mode_is_refused(self, store):
        with pytest.raises(ValueError):
            store.set_automation_mode("/ws", "sometimes")


class TestArtifacts:
    def test_classification_follows_the_filename(self):
        # Speckit projects name files by role, and the dashboard colours by it.
        assert classify("specs/001/spec.md") == "spec"
        assert classify("specs/001/plan.md") == "plan"
        assert classify("specs/001/tasks.md") == "task"
        assert classify(".specify/memory/constitution.md") == "constitution"
        assert classify("README.md") == "other"

    def test_upsert_is_idempotent_per_project_and_path(self, store):
        first = store.upsert_artifact("/ws", "/ws/spec.md", title="Spec")
        second = store.upsert_artifact("/ws", "/ws/spec.md", title="Spec, retitled")

        assert first.id == second.id
        assert second.title == "Spec, retitled"

    def test_metadata_merges_rather_than_replaces(self, store):
        # A status update must not wipe what an earlier step recorded.
        store.upsert_artifact("/ws", "/ws/spec.md", metadata={"attempt": 1})
        artifact = store.upsert_artifact("/ws", "/ws/spec.md", metadata={"cache_hit": True})

        assert artifact.metadata == {"attempt": 1, "cache_hit": True}

    def test_tags_round_trip_and_deduplicate(self, store):
        artifact = store.upsert_artifact("/ws", "/ws/spec.md")
        tagged = store.set_tags(artifact.id, ["api", "api", " draft ", ""])
        assert tagged.tags == ["api", "draft"]

    def test_the_same_path_in_two_projects_is_two_artifacts(self, store):
        store.upsert_project("/other", "Other")
        left = store.upsert_artifact("/ws", "/shared/spec.md")
        right = store.upsert_artifact("/other", "/shared/spec.md")
        assert left.id != right.id


class TestVersions:
    def test_version_numbers_increment_per_artifact(self, store):
        artifact = store.upsert_artifact("/ws", "/ws/spec.md")
        store.record_version(artifact.id, pdf_path="/tmp/1.pdf")
        second = store.record_version(artifact.id, pdf_path="/tmp/2.pdf")

        assert second.version_no == 2
        assert [version.version_no for version in store.versions(artifact.id)] == [2, 1]

    def test_deleting_an_artifact_takes_its_versions(self, store):
        artifact = store.upsert_artifact("/ws", "/ws/spec.md")
        store.record_version(artifact.id, pdf_path="/tmp/1.pdf")

        store._connection.execute("DELETE FROM artifacts WHERE id = ?", (artifact.id,))
        assert store.versions(artifact.id) == []

    def test_a_version_needs_an_artifact(self, store):
        with pytest.raises(sqlite3.IntegrityError):
            store.record_version("no-such-artifact", pdf_path="/tmp/x.pdf")


class TestRebuildSkipping:
    def test_identical_content_with_an_existing_pdf_is_reused(self, store, tmp_path):
        pdf = tmp_path / "out.pdf"
        pdf.write_bytes(b"%PDF-1.7")

        digest = content_hash("# Doc")
        artifact = store.upsert_artifact("/ws", "/ws/spec.md", content_hash_value=digest)
        store.record_version(artifact.id, pdf_path=str(pdf))

        assert store.unchanged_since_last_build(artifact.id, digest) is not None

    def test_changed_content_is_rebuilt(self, store, tmp_path):
        pdf = tmp_path / "out.pdf"
        pdf.write_bytes(b"%PDF-1.7")

        artifact = store.upsert_artifact("/ws", "/ws/spec.md", content_hash_value=content_hash("# Doc"))
        store.record_version(artifact.id, pdf_path=str(pdf))

        assert store.unchanged_since_last_build(artifact.id, content_hash("# Doc, edited")) is None

    def test_a_missing_pdf_is_rebuilt_even_when_content_matches(self, store, tmp_path):
        # The user asked for a PDF and there isn't one; a database row is not a
        # substitute for the file.
        digest = content_hash("# Doc")
        artifact = store.upsert_artifact("/ws", "/ws/spec.md", content_hash_value=digest)
        store.record_version(artifact.id, pdf_path=str(tmp_path / "deleted.pdf"))

        assert store.unchanged_since_last_build(artifact.id, digest) is None


class TestProjectFiles:
    def test_sync_replaces_the_inventory(self, store):
        store.sync_files("/ws", [{"source_path": "a.md"}, {"source_path": "b.md"}])
        store.sync_files("/ws", [{"source_path": "a.md"}])

        # b.md was deleted or renamed; a stale row would offer to convert
        # something that is not there.
        assert [entry.source_path for entry in store.files("/ws")] == ["a.md"]

    def test_syncing_an_empty_list_clears_the_inventory(self, store):
        store.sync_files("/ws", [{"source_path": "a.md"}])
        store.sync_files("/ws", [])
        assert store.files("/ws") == []

    def test_files_report_their_artifact_and_exclusion(self, store):
        store.sync_files("/ws", [{"source_path": "/ws/spec.md"}, {"source_path": "/ws/skip.md"}])
        artifact = store.upsert_artifact("/ws", "/ws/spec.md", status="complete")
        store.add_exception("/ws", "/ws/skip.md")

        by_path = {entry.source_path: entry for entry in store.files("/ws")}
        assert by_path["/ws/spec.md"].artifact_id == artifact.id
        assert by_path["/ws/spec.md"].artifact_status == "complete"
        assert by_path["/ws/skip.md"].is_excluded is True

    def test_transform_requests_are_cleared_when_collected(self, store):
        # Cleared on pickup, not on completion: a run that dies halfway must not
        # leave a request the client re-collects forever.
        store.sync_files("/ws", [{"source_path": "a.md"}])
        store.request_transform("/ws", "a.md")

        assert store.take_transform_requests("/ws") == ["a.md"]
        assert store.take_transform_requests("/ws") == []


class TestKanban:
    TASKS = [
        {"task_key": "T001", "phase": "Setup", "phase_order": 0, "description": "Scaffold", "checkbox_done": True},
        {"task_key": "T002", "phase": "Setup", "phase_order": 0, "description": "Wire", "checkbox_done": False},
    ]

    def sync(self, store):
        artifact = store.upsert_artifact("/ws", "/ws/tasks.md")
        store.sync_tasks("/ws", artifact.id, "/ws/tasks.md", self.TASKS)
        return artifact

    def test_tasks_sync_from_a_file(self, store):
        self.sync(store)
        tasks = store.tasks("/ws")
        assert [task.task_key for task in tasks] == ["T001", "T002"]
        assert tasks[0].board_status == "done"
        assert tasks[1].board_status == "todo"

    def test_board_status_survives_a_resync(self, store):
        # The file owns everything except where the card sits; dragging a card
        # must not be undone by the next save.
        artifact = self.sync(store)
        moved = [task for task in store.tasks("/ws") if task.task_key == "T002"][0]
        store.set_board_status(moved.id, "in_progress")

        store.sync_tasks("/ws", artifact.id, "/ws/tasks.md", self.TASKS)
        after = {task.task_key: task.board_status for task in store.tasks("/ws")}
        assert after["T002"] == "in_progress"

    def test_removed_tasks_disappear(self, store):
        artifact = self.sync(store)
        store.sync_tasks("/ws", artifact.id, "/ws/tasks.md", self.TASKS[:1])
        assert [task.task_key for task in store.tasks("/ws")] == ["T001"]

    def test_unknown_board_status_is_refused(self, store):
        self.sync(store)
        task = store.tasks("/ws")[0]
        with pytest.raises(ValueError):
            store.set_board_status(task.id, "later")


class TestExceptions:
    def test_adding_twice_is_harmless(self, store):
        store.add_exception("/ws", "/ws/skip.md")
        store.add_exception("/ws", "/ws/skip.md")
        assert [item.source_path for item in store.exceptions("/ws")] == ["/ws/skip.md"]

    def test_a_folder_exception_covers_everything_under_it(self, store):
        # Otherwise excluding a directory would mean listing its contents by hand.
        store.add_exception("/ws", ".specify/templates")
        assert store.is_excepted("/ws", ".specify/templates/spec-template.md")
        assert not store.is_excepted("/ws", ".specify/memory/constitution.md")

    def test_removing_by_id(self, store):
        created = store.add_exception("/ws", "/ws/skip.md")
        store.remove_exception(created.id)
        assert store.exceptions("/ws") == []

    def test_exceptions_are_scoped_to_a_project(self, store):
        store.upsert_project("/other", "Other")
        store.add_exception("/other", "/shared/spec.md")
        assert store.exceptions("/ws") == []


class TestSettings:
    def test_setting_round_trips_and_overwrites(self, store):
        store.set_setting("mode", "manual")
        assert store.get_setting("mode") == "manual"

        store.set_setting("mode", "auto")
        assert store.get_setting("mode") == "auto"

    def test_missing_setting_returns_the_default(self, store):
        assert store.get_setting("nothing", "fallback") == "fallback"
