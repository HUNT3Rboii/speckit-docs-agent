"""Storage tests.

The database is per user and on disk, and the extension updates underneath it,
so the two things worth guarding are that migrations run against an old file and
that identical content is not rebuilt.
"""

import sqlite3

import pytest

from db import LATEST_VERSION, Store, content_hash
from db.schema import connect, migrate


@pytest.fixture
def store(tmp_path):
    instance = Store(tmp_path / "nested" / "speckit.sqlite3")
    yield instance
    instance.close()


class TestSchema:
    def test_migrations_run_on_a_fresh_database(self, store):
        assert store.schema_version == LATEST_VERSION

    def test_migrating_twice_is_a_no_op(self, tmp_path):
        # Every startup migrates. Reapplying a migration would fail on the
        # tables it already created.
        path = tmp_path / "speckit.sqlite3"
        first = Store(path)
        first.close()

        second = Store(path)
        assert second.schema_version == LATEST_VERSION
        second.close()

    def test_an_old_database_is_brought_forward(self, tmp_path):
        # Simulates the normal case: a file written by an earlier version of the
        # extension, opened by a newer one.
        path = tmp_path / "old.sqlite3"
        connection = connect(str(path))
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 0
        connection.close()

        store = Store(path)
        assert store.schema_version == LATEST_VERSION
        store.close()

    def test_wal_is_enabled(self, store, tmp_path):
        # Two VS Code windows means two backends on one file; without WAL the
        # second sees SQLITE_BUSY during ordinary use.
        mode = store._connection.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode.lower() == "wal"

    def test_a_second_connection_can_read_the_same_file(self, tmp_path):
        path = tmp_path / "shared.sqlite3"
        first = Store(path)
        first.upsert_document("/ws", "/ws/a.md", "A")

        second = Store(path)
        assert [document.source_path for document in second.list_documents("/ws")] == ["/ws/a.md"]

        first.close()
        second.close()


class TestDocuments:
    def test_upsert_is_idempotent_per_workspace_and_path(self, store):
        first = store.upsert_document("/ws", "/ws/spec.md", "Spec")
        second = store.upsert_document("/ws", "/ws/spec.md", "Spec, retitled")

        assert first.id == second.id
        assert second.title == "Spec, retitled"

    def test_the_same_path_in_two_workspaces_is_two_documents(self, store):
        left = store.upsert_document("/one", "/shared/spec.md", None)
        right = store.upsert_document("/two", "/shared/spec.md", None)
        assert left.id != right.id


class TestVersions:
    def test_versions_are_returned_newest_first(self, store):
        document = store.upsert_document("/ws", "/ws/spec.md", None)
        store.record_version(document.id, hash_value="a", pdf_path="/tmp/1.pdf", diagram_count=0, warnings=[])
        store.record_version(document.id, hash_value="b", pdf_path="/tmp/2.pdf", diagram_count=1, warnings=["w"])

        versions = store.versions(document.id)
        assert [version.pdf_path for version in versions] == ["/tmp/2.pdf", "/tmp/1.pdf"]
        assert versions[0].warnings == ["w"]

    def test_deleting_a_document_takes_its_versions(self, store):
        document = store.upsert_document("/ws", "/ws/spec.md", None)
        store.record_version(document.id, hash_value="a", pdf_path="/tmp/1.pdf", diagram_count=0, warnings=[])

        store._connection.execute("DELETE FROM documents WHERE id = ?", (document.id,))
        assert store.versions(document.id) == []


class TestRebuildSkipping:
    def test_identical_content_with_an_existing_pdf_is_reused(self, store, tmp_path):
        pdf = tmp_path / "out.pdf"
        pdf.write_bytes(b"%PDF-1.7")

        document = store.upsert_document("/ws", "/ws/spec.md", None)
        digest = content_hash("# Doc")
        store.record_version(document.id, hash_value=digest, pdf_path=str(pdf), diagram_count=0, warnings=[])

        assert store.unchanged_since_last_build(document.id, digest) is not None

    def test_changed_content_is_rebuilt(self, store, tmp_path):
        pdf = tmp_path / "out.pdf"
        pdf.write_bytes(b"%PDF-1.7")

        document = store.upsert_document("/ws", "/ws/spec.md", None)
        store.record_version(
            document.id, hash_value=content_hash("# Doc"), pdf_path=str(pdf), diagram_count=0, warnings=[]
        )

        assert store.unchanged_since_last_build(document.id, content_hash("# Doc, edited")) is None

    def test_a_missing_pdf_is_rebuilt_even_when_content_matches(self, store, tmp_path):
        # The user asked for a PDF and there isn't one; a database row is not a
        # substitute for the file.
        document = store.upsert_document("/ws", "/ws/spec.md", None)
        digest = content_hash("# Doc")
        store.record_version(
            document.id, hash_value=digest, pdf_path=str(tmp_path / "deleted.pdf"), diagram_count=0, warnings=[]
        )

        assert store.unchanged_since_last_build(document.id, digest) is None

    def test_content_hash_ignores_everything_but_content(self, store):
        assert content_hash("# Doc") == content_hash("# Doc")
        assert content_hash("# Doc") != content_hash("# Doc ")


class TestExceptions:
    def test_adding_twice_is_harmless(self, store):
        store.add_exception("/ws", "/ws/skip.md")
        store.add_exception("/ws", "/ws/skip.md")
        assert store.exceptions("/ws") == ["/ws/skip.md"]

    def test_removing_and_querying(self, store):
        store.add_exception("/ws", "/ws/skip.md")
        assert store.is_excepted("/ws", "/ws/skip.md")

        store.remove_exception("/ws", "/ws/skip.md")
        assert not store.is_excepted("/ws", "/ws/skip.md")

    def test_exceptions_are_scoped_to_a_workspace(self, store):
        store.add_exception("/one", "/shared/spec.md")
        assert store.exceptions("/two") == []


class TestSettings:
    def test_setting_round_trips_and_overwrites(self, store):
        store.set_setting("automation", "manual")
        assert store.get_setting("automation") == "manual"

        store.set_setting("automation", "auto")
        assert store.get_setting("automation") == "auto"

    def test_missing_setting_returns_the_default(self, store):
        assert store.get_setting("nothing", "fallback") == "fallback"


class TestForeignKeys:
    def test_a_version_needs_a_document(self, store):
        with pytest.raises(sqlite3.IntegrityError):
            store.record_version(9999, hash_value="a", pdf_path="/tmp/x.pdf", diagram_count=0, warnings=[])
