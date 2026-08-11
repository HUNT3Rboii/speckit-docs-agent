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

from db import Store, content_hash  # noqa: E402
from pdf.compile import TypstCompileError, convert, write_diagrams  # noqa: E402
from rpc import Server, log  # noqa: E402
from validation import EnrichmentValidator  # noqa: E402

PROTOCOL_VERSION = 2


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


def build_server(storage_path: Path, typst_binary: Path, store: Store) -> Server:
    server = Server()
    validator = EnrichmentValidator()

    @server.method("ping")
    def _ping(_params: dict) -> dict:
        return {"ok": True}

    @server.method("convert")
    def _convert(params: dict) -> dict:
        markdown = params.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError("convert requires non-empty markdown")

        source_path = params.get("sourcePath")
        workspace = str(params.get("workspace") or "")
        label = Path(source_path).name if source_path else None
        stem = Path(source_path).stem if source_path else "document"

        output_dir = storage_path / "pdf"
        output_path = Path(params.get("outputPath") or output_dir / f"{stem}.pdf")

        document = store.upsert_document(workspace, str(source_path or stem), _title(markdown, stem))
        hash_value = content_hash(markdown)

        # Identical content that already produced a PDF is not rebuilt. A save
        # that changed nothing, or a checkout that rewrote every timestamp,
        # would otherwise cost the user a wait for a byte-identical file.
        if not params.get("force"):
            unchanged = store.unchanged_since_last_build(document.id, hash_value)
            if unchanged:
                log(f"unchanged since {unchanged.created_at}, reusing {unchanged.pdf_path}")
                return {
                    "pdfPath": unchanged.pdf_path,
                    "typstSource": None,
                    "warnings": unchanged.warnings,
                    "reused": True,
                }

        # The build directory is scratch: it holds the generated .typ, the
        # template, and diagram SVGs. It is kept when compilation fails so the
        # markup can be inspected, and discarded otherwise.
        build_dir = Path(tempfile.mkdtemp(prefix="speckit-typst-"))

        diagrams = write_diagrams(build_dir, params.get("diagrams") or [])

        # Enrichment arrives already proposed by the model in the editor, and is
        # revalidated here rather than trusted: the host is not where the source
        # document lives, and this is the last point before it reaches a reader.
        enrichment = validator.validate(markdown, params.get("enrichment") or {})
        for item in enrichment.dropped:
            log(f"dropped {item.kind} {item.label}: {item.reason}")

        try:
            result = convert(
                markdown,
                typst_binary=typst_binary,
                build_dir=build_dir,
                output_path=output_path,
                source_label=label,
                diagrams=diagrams,
                summary=enrichment.summary,
                glossary=enrichment.glossary,
            )
        except TypstCompileError as exc:
            log(f"typst failed; generated markup kept at {exc.typst_source}")
            raise

        store.record_version(
            document.id,
            hash_value=hash_value,
            pdf_path=str(result.pdf_path),
            diagram_count=len(diagrams),
            warnings=result.warnings,
        )

        log(f"wrote {result.pdf_path}")
        return {
            "pdfPath": str(result.pdf_path),
            "typstSource": str(result.typst_source),
            "warnings": result.warnings,
            "dropped": [item.to_dict() for item in enrichment.dropped],
            "glossaryCount": len(enrichment.glossary),
            "reused": False,
        }

    @server.method("validateEnrichment")
    def _validate_enrichment(params: dict) -> dict:
        markdown = params.get("markdown")
        if not isinstance(markdown, str) or not markdown.strip():
            raise ValueError("validateEnrichment requires the source markdown")
        return validator.validate(markdown, params.get("enrichment") or {}).to_dict()

    @server.method("history")
    def _history(params: dict) -> dict:
        workspace = str(params.get("workspace") or "")
        source_path = str(params.get("sourcePath") or "")
        document = store.upsert_document(workspace, source_path, None)
        return {
            "versions": [
                {
                    "id": version.id,
                    "pdfPath": version.pdf_path,
                    "diagramCount": version.diagram_count,
                    "warnings": version.warnings,
                    "createdAt": version.created_at,
                }
                for version in store.versions(document.id)
            ]
        }

    @server.method("listExceptions")
    def _list_exceptions(params: dict) -> dict:
        return {"paths": store.exceptions(str(params.get("workspace") or ""))}

    @server.method("setException")
    def _set_exception(params: dict) -> dict:
        workspace = str(params.get("workspace") or "")
        source_path = str(params.get("sourcePath") or "")
        if not source_path:
            raise ValueError("setException requires a sourcePath")

        if params.get("excluded"):
            store.add_exception(workspace, source_path)
        else:
            store.remove_exception(workspace, source_path)
        return {"excluded": store.is_excepted(workspace, source_path)}

    @server.method("getSetting")
    def _get_setting(params: dict) -> dict:
        key = str(params.get("key") or "")
        return {"value": store.get_setting(key, params.get("default"))}

    @server.method("setSetting")
    def _set_setting(params: dict) -> dict:
        key = str(params.get("key") or "")
        if not key:
            raise ValueError("setSetting requires a key")
        store.set_setting(key, str(params.get("value") or ""))
        return {"ok": True}

    return server


def _title(markdown: str, fallback: str) -> str:
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


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

    server = build_server(storage_path, typst_binary, store)

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
