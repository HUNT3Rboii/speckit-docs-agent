#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        return 0
    project_id = sys.argv[1]
    paths = sys.argv[2:]
    payload = {
        "project_id": project_id,
        "paths": paths,
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
