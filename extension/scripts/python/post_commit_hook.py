#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

API_URL_ENV = "SPECKIT_EXT_API_URL"
API_KEY_ENV = "SPECKIT_EXT_API_KEY"


def build_ingest_payload(project_id: str, source_path: str, content: str) -> Dict[str, Any]:
    return {
        "project_id": project_id,
        "source_path": source_path,
        "raw_content": content,
    }


def _api_base_url() -> str:
    return os.getenv(API_URL_ENV, "http://127.0.0.1:8000")


def _api_key() -> str:
    return os.getenv(API_KEY_ENV, "dev-key")


def _post_json(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
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


def main() -> int:
    if len(sys.argv) < 3:
        return 0

    project_id = sys.argv[1]
    paths = sys.argv[2:]
    markdown_files = [path for path in paths if path.endswith(".md")]

    if not markdown_files:
        return 0

    try:
        _post_json("/api/projects", {"name": project_id, "repo_url": None})
    except Exception:
        pass

    for path in markdown_files:
        resolved = Path(path)
        content = resolved.read_text(encoding="utf-8") if resolved.exists() else ""
        payload = build_ingest_payload(project_id, str(resolved).replace("\\", "/"), content)
        try:
            result = _post_json("/api/artifacts/ingest-raw", payload)
            print(json.dumps(result))
        except Exception as exc:  # pragma: no cover - network failure path
            print(json.dumps({"error": str(exc)}))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
