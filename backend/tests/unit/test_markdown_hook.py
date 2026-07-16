import importlib.util
from pathlib import Path


def load_module():
    module_path = Path(__file__).resolve().parents[2] / ".." / "extension" / "scripts" / "python" / "post_commit_hook.py"
    spec = importlib.util.spec_from_file_location("post_commit_hook", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_ingest_payload_uses_relative_path_and_content():
    module = load_module()
    payload = module.build_ingest_payload("project-1", "specs/001/spec.md", "# Heading\n\nBody")

    assert payload["project_id"] == "project-1"
    assert payload["source_path"] == "specs/001/spec.md"
    assert payload["raw_content"] == "# Heading\n\nBody"
