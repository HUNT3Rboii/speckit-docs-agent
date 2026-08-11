"""Backend entry point.

Spawned by the extension host as a child process; speaks line-delimited
JSON-RPC over stdio and exits when stdin closes. It never listens on a socket
and never assumes anything about the machine it runs on: the storage path and
the Typst binary are both passed in.
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict

# Dependencies are vendored next to this file rather than installed into the
# bundled interpreter, so the interpreter stays exactly as shipped and a
# dependency change is a plain file copy.
sys.path.insert(0, str(Path(__file__).parent / "vendor"))

from api import PROTOCOL_VERSION, register  # noqa: E402
from db import Store  # noqa: E402
from pdf.compile import TypstCompileError, convert, write_diagrams  # noqa: E402
from rpc import Server, log  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="speckit-backend")
    parser.add_argument(
        "--storage-path",
        required=True,
        help="Per-user directory for generated output and state. Supplied by the extension host.",
    )
    parser.add_argument(
        "--typst",
        required=True,
        help="Absolute path to the bundled typst binary.",
    )
    parser.add_argument("--stdio", action="store_true", help="Speak JSON-RPC over stdio (the only mode).")
    return parser.parse_args(argv)


def make_pdf_builder(storage_path: Path, typst_binary: Path):
    """Render markdown to a PDF on disk.

    Kept out of api.py so the RPC layer can be tested without a Typst binary
    present - the surface is large and the compiler is slow.
    """

    def build(request: Dict[str, Any]) -> Dict[str, Any]:
        source_path = request.get("sourcePath") or "document.md"
        stem = Path(source_path).stem
        output_path = Path(request.get("outputPath") or storage_path / "pdf" / f"{stem}.pdf")

        # The build directory is scratch: it holds the generated .typ, the
        # template, and diagram SVGs. It is kept when compilation fails so the
        # markup can be inspected, and discarded otherwise.
        build_dir = Path(tempfile.mkdtemp(prefix="speckit-typst-"))
        diagrams = write_diagrams(build_dir, request.get("diagrams") or [])

        try:
            result = convert(
                request["markdown"],
                typst_binary=typst_binary,
                build_dir=build_dir,
                output_path=output_path,
                source_label=Path(source_path).name,
                diagrams=diagrams,
                summary=request.get("summary"),
                glossary=request.get("glossary") or [],
            )
        except TypstCompileError as exc:
            log(f"typst failed; generated markup kept at {exc.typst_source}")
            raise

        log(f"wrote {result.pdf_path}")
        return {
            "pdfPath": str(result.pdf_path),
            "typstSource": str(result.typst_source),
            "warnings": result.warnings,
            "diagramCount": len(diagrams),
        }

    return build


def _force_utf8_streams() -> None:
    """Pin stdio to UTF-8 regardless of the machine's code page.

    Windows defaults these to the ANSI code page (cp1252 here), so the first
    non-Latin-1 character in a message - a box-drawing character in a Typst
    error, a user's document title - raises UnicodeEncodeError mid-write and
    takes the backend down with it.
    """
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main(argv: list[str] | None = None) -> int:
    _force_utf8_streams()
    args = parse_args(argv)

    storage_path = Path(args.storage_path)
    storage_path.mkdir(parents=True, exist_ok=True)

    typst_binary = Path(args.typst)
    if not typst_binary.exists():
        log(f"bundled typst binary not found at {typst_binary}")
        return 2

    # Migrations run here, before the first request: the extension can update
    # while a user's database sits at an older schema, and that is the normal
    # case rather than an edge case.
    store = Store(storage_path / "speckit.sqlite3", log)
    log(f"database at schema version {store.schema_version}")

    server = register(
        Server(),
        store,
        build_pdf=make_pdf_builder(storage_path, typst_binary),
        log=log,
    )

    # The host waits for this before sending anything. Spawn returning is not
    # the same as the interpreter being ready to serve.
    server.notify(
        "ready",
        {
            "protocol": PROTOCOL_VERSION,
            "python": sys.version.split()[0],
            "storagePath": str(storage_path),
            "schemaVersion": store.schema_version,
        },
    )

    try:
        server.serve_forever()
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
