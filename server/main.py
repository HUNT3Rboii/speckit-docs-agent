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

# Dependencies are vendored next to this file rather than installed into the
# bundled interpreter, so the interpreter stays exactly as shipped and a
# dependency change is a plain file copy.
sys.path.insert(0, str(Path(__file__).parent / "vendor"))

from pdf.compile import TypstCompileError, convert, write_diagrams  # noqa: E402
from rpc import Server, log  # noqa: E402

PROTOCOL_VERSION = 1


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


def build_server(storage_path: Path, typst_binary: Path) -> Server:
    server = Server()

    @server.method("ping")
    def _ping(_params: dict) -> dict:
        return {"ok": True}

    @server.method("convert")
    def _convert(params: dict) -> dict:
        markdown = params.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError("convert requires non-empty markdown")

        source_path = params.get("sourcePath")
        label = Path(source_path).name if source_path else None
        stem = Path(source_path).stem if source_path else "document"

        output_dir = storage_path / "pdf"
        output_path = Path(params.get("outputPath") or output_dir / f"{stem}.pdf")

        # The build directory is scratch: it holds the generated .typ, the
        # template, and diagram SVGs. It is kept when compilation fails so the
        # markup can be inspected, and discarded otherwise.
        build_dir = Path(tempfile.mkdtemp(prefix="speckit-typst-"))

        diagrams = write_diagrams(build_dir, params.get("diagrams") or [])

        try:
            result = convert(
                markdown,
                typst_binary=typst_binary,
                build_dir=build_dir,
                output_path=output_path,
                source_label=label,
                diagrams=diagrams,
            )
        except TypstCompileError as exc:
            log(f"typst failed; generated markup kept at {exc.typst_source}")
            raise

        log(f"wrote {result.pdf_path}")
        return {
            "pdfPath": str(result.pdf_path),
            "typstSource": str(result.typst_source),
            "warnings": result.warnings,
        }

    return server


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

    server = build_server(storage_path, typst_binary)

    # The host waits for this before sending anything. Spawn returning is not
    # the same as the interpreter being ready to serve.
    server.notify(
        "ready",
        {
            "protocol": PROTOCOL_VERSION,
            "python": sys.version.split()[0],
            "storagePath": str(storage_path),
        },
    )

    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
