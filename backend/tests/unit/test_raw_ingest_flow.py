import importlib
from pathlib import Path

from fastapi.testclient import TestClient


def test_raw_ingest_triggers_render_and_version_record(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "doc_agent.sqlite3"
    output_dir = tmp_path / "pdfs"
    monkeypatch.setenv("DOC_AGENT_DB_PATH", str(db_path))
    monkeypatch.setenv("DOC_OUTPUT_DIR", str(output_dir))
    monkeypatch.setenv("SPECKIT_EXT_API_KEY", "dev-key")

    import app.api.routes as routes
    import app.main as main_module

    importlib.reload(routes)
    importlib.reload(main_module)

    client = TestClient(main_module.app)
    response = client.post(
        "/api/artifacts/ingest-raw",
        json={
            "project_id": "demo",
            "source_path": "specs/001-demo/spec.md",
            "raw_content": "# Demo\n\n## Overview\n\nThis is an end-to-end markdown ingest example.",
        },
        headers={"Authorization": "Bearer dev-key"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["artifact"]["status"] == "rendered"
    assert payload["version"]["version_no"] == 1
    assert Path(payload["version"]["pdf_path"]).exists()
    assert payload["artifact"]["source_path"] == "specs/001-demo/spec.md"
