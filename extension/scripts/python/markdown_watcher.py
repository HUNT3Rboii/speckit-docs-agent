#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, Iterator, Set

API_URL_ENV = "SPECKIT_EXT_API_URL"
API_KEY_ENV = "SPECKIT_EXT_API_KEY"
ROOT_ENV = "SPECKIT_EXT_ROOT"
POLL_INTERVAL_SECONDS = 2
IGNORED_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache", "tmp"}


def build_ingest_payload(project_id: str, source_path: str, content: str) -> Dict[str, object]:
    return {
        "project_id": project_id,
        "source_path": source_path,
        "raw_content": content,
    }


def _api_base_url() -> str:
    return os.getenv(API_URL_ENV, "http://127.0.0.1:8000")


def _api_key() -> str:
    return os.getenv(API_KEY_ENV, "dev-key")


def _post_json(path: str, payload: Dict[str, object]) -> Dict[str, object]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{_api_base_url()}{path}",
        data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_api_key()}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)


def is_ignored(path: Path, root: Path) -> bool:
    try:
        relative_parts = path.relative_to(root).parts
    except ValueError:
        return False
    return any(part in IGNORED_DIRS for part in relative_parts)


def discover_markdown_files(root: Path) -> Iterator[Path]:
    for current_root, dirnames, filenames in os.walk(root):
        current_path = Path(current_root)
        dirnames[:] = [name for name in dirnames if name not in IGNORED_DIRS and not is_ignored(current_path / name, root)]
        for filename in filenames:
            if filename.endswith(".md"):
                candidate = current_path / filename
                if not is_ignored(candidate, root):
                    yield candidate


def watch(root: Path, project_id: str) -> None:
    seen: Set[Path] = set()
    while True:
        for path in discover_markdown_files(root):
            if path in seen:
                continue
            seen.add(path)
            if not path.exists():
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                content = ""
            payload = build_ingest_payload(project_id, path.relative_to(root).as_posix(), content)
            try:
                result = _post_json("/api/artifacts/ingest-raw", payload)
                print(json.dumps({"path": payload["source_path"], "result": result}))
            except Exception as exc:  # pragma: no cover - runtime network failure
                print(json.dumps({"path": payload["source_path"], "error": str(exc)}))
        time.sleep(POLL_INTERVAL_SECONDS)


def main() -> int:
    root = Path(os.getenv(ROOT_ENV, os.getcwd())).resolve()
    project_id = root.name
    print(f"Starting markdown watcher for {root}")
    watch(root, project_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
