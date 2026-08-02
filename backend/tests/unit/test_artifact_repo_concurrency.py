"""
Concurrency tests for ArtifactRepository (SQLite).

Regression coverage for a real race: saving two brand-new markdown files in
the same brand-new project at close to the same instant could cause
create_project() to create duplicate project rows with the same name, and/or
the artifact id generator to hand out the same "artifact-N" to two different
documents - upsert_artifact() uses ON CONFLICT(id) DO UPDATE, so the second
one would silently overwrite the first's project_id/source_path/metadata,
then add_doc_version() would crash on the resulting duplicate version id.

These tests fire real concurrent threads against a real (temp file) SQLite
database - the bug was specifically about interleaving between the "read
the current count" and "write the new row" steps of two overlapping
connections, which a single-threaded/mocked test can't exercise at all.
"""

import os
import sqlite3
import tempfile
import threading

import pytest

from app.repositories.artifact_repo import ArtifactRepository


@pytest.fixture
def repo():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    try:
        yield ArtifactRepository(db_path=path)
    finally:
        # sqlite3.Connection's context manager only commits/rolls back on
        # exit, it does NOT close the connection - the file handle can
        # linger until GC runs, which races with cleanup on Windows. Retry
        # briefly rather than flaking the whole suite over a temp file.
        for _ in range(10):
            try:
                os.remove(path)
                break
            except PermissionError:
                import gc
                import time

                gc.collect()
                time.sleep(0.05)


def run_concurrently(fns):
    """Run each zero-arg callable in `fns` in its own thread, starting them
    as close together as possible (via a barrier, so threads actually
    overlap rather than merely being "started"), and return each thread's
    result (or raised exception) in the same order as `fns`."""
    n = len(fns)
    results = [None] * n
    errors = [None] * n
    barrier = threading.Barrier(n)

    def worker(i):
        barrier.wait()
        try:
            results[i] = fns[i]()
        except Exception as exc:  # noqa: BLE001 - capturing for assertions
            errors[i] = exc

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    return results, errors


class TestConcurrentCreateProject:
    def test_same_name_from_many_threads_yields_one_project(self, repo):
        results, errors = run_concurrently([lambda: repo.create_project("same-workspace")] * 8)

        assert all(e is None for e in errors), errors
        ids = {r["id"] for r in results}
        assert len(ids) == 1, f"expected exactly one project id, got {ids}"

        all_projects = repo.list_projects()
        matching = [p for p in all_projects if p["name"] == "same-workspace"]
        assert len(matching) == 1, f"expected exactly one row in the DB, found {matching}"

    def test_different_names_from_many_threads_yield_distinct_projects(self, repo):
        names = [f"workspace-{i}" for i in range(8)]
        results, errors = run_concurrently([(lambda n=n: repo.create_project(n)) for n in names])

        assert all(e is None for e in errors), errors
        ids = [r["id"] for r in results]
        assert len(set(ids)) == len(ids), f"expected distinct ids for distinct names, got {ids}"

    def test_sequential_calls_still_work_normally(self, repo):
        """Baseline sanity check: the race-safety changes must not break the
        ordinary, non-concurrent case."""
        p1 = repo.create_project("alpha")
        p2 = repo.create_project("beta")
        p3 = repo.create_project("alpha")  # already exists - get, not create

        assert p1["id"] != p2["id"]
        assert p1["id"] == p3["id"]
        assert len(repo.list_projects()) == 2


class TestConcurrentArtifactIdGeneration:
    def test_next_artifact_id_never_collides_under_concurrency(self, repo):
        results, errors = run_concurrently([lambda: repo.next_artifact_id()] * 10)

        assert all(e is None for e in errors), errors
        assert len(set(results)) == len(results), f"duplicate artifact ids generated: {results}"

    def test_next_artifact_id_continues_after_existing_rows(self):
        """Seeding must account for ids already in the table at the point
        the repository is constructed, not just start fresh at 1 and
        collide with pre-existing data - e.g. a database from before this
        sequence-based generator existed. Seeding is a one-time, at-startup
        operation (matching how a real DB sequence's setval() works: it
        doesn't retroactively resync itself against rows inserted through
        some other path afterward), so the pre-existing row has to be
        present *before* ArtifactRepository() runs its schema/seed step."""
        fd, path = tempfile.mkstemp(suffix=".sqlite3")
        os.close(fd)
        try:
            conn = sqlite3.connect(path)
            conn.execute(
                "CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, repo_url TEXT)"
            )
            conn.execute(
                """
                CREATE TABLE artifacts (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_path TEXT NOT NULL,
                    source_tool TEXT NOT NULL, artifact_type TEXT NOT NULL, status TEXT NOT NULL,
                    content_hash TEXT NOT NULL, metadata TEXT
                )
                """
            )
            conn.execute("INSERT INTO projects VALUES ('proj-1', 'proj', NULL)")
            conn.execute(
                "INSERT INTO artifacts VALUES ('artifact-5', 'proj-1', 'a.md', 'speckit', 'other', 'rendered', 'x', '{}')"
            )
            conn.commit()
            conn.close()

            repo = ArtifactRepository(db_path=path)
            next_id = repo.next_artifact_id()

            assert next_id == "artifact-6"
        finally:
            for _ in range(10):
                try:
                    os.remove(path)
                    break
                except PermissionError:
                    import gc
                    import time

                    gc.collect()
                    time.sleep(0.05)
