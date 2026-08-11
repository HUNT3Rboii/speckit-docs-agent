"""Rewrite the golden emitter output.

Run this only when the emitted markup was meant to change, and read the diff
before committing it - the point of the golden file is that a change nobody
intended shows up as a failing test.

    python server/tests/regenerate_golden.py
"""

import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(SERVER_ROOT), str(SERVER_ROOT / "vendor")]

from pdf.emitter import emit  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def main() -> int:
    markdown = (FIXTURES / "kitchen-sink.md").read_text(encoding="utf-8")
    target = FIXTURES / "kitchen-sink.typ"
    target.write_text(emit(markdown).typst, encoding="utf-8")
    print(f"Wrote {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
