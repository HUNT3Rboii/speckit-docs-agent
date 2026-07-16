import importlib.util
from pathlib import Path


def load_module():
    module_path = Path(__file__).resolve().parents[2] / ".." / "extension" / "scripts" / "python" / "markdown_watcher.py"
    spec = importlib.util.spec_from_file_location("markdown_watcher", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_ingest_payload_uses_relative_path_and_content():
    module = load_module()
    payload = module.build_ingest_payload("project-1", "docs/guide.md", "# Guide")

    assert payload["project_id"] == "project-1"
    assert payload["source_path"] == "docs/guide.md"
    assert payload["raw_content"] == "# Guide"


def test_is_ignored_skips_output_and_virtual_environment_dirs(tmp_path):
    module = load_module()
    root = tmp_path
    ignored_dir = root / "backend" / "tmp"
    ignored_dir.mkdir(parents=True)

    assert module.is_ignored(ignored_dir / "artifact.pdf", root)
