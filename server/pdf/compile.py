"""Drive the bundled Typst binary.

Typst is invoked as a subprocess with an explicitly resolved path. It is never
looked up on PATH: the user is not expected to have installed it, and silently
compiling against whatever version they happen to have would defeat pinning the
compiler in the first place.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Sequence

from .emitter import Diagram, emit, emit_glossary, escape, escape_string

TEMPLATE = Path(__file__).with_name("template.typ")


class TypstCompileError(RuntimeError):
    """Raised when typst rejects the generated markup.

    Carries the path of the .typ that failed. Reading it is the whole reason
    the pipeline emits markup as text.
    """

    def __init__(self, message: str, typst_source: Path) -> None:
        super().__init__(message)
        self.typst_source = typst_source


@dataclass
class ConversionResult:
    pdf_path: Path
    typst_source: Path
    warnings: List[str]
    page_images: List[Path] = field(default_factory=list)


def _document_title(markdown: str, fallback: str) -> str:
    """First H1 wins, as it did in the HTML pipeline; filename otherwise."""
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def build_document(
    markdown: str,
    *,
    title: str,
    source_label: str | None,
    diagrams: Sequence[Diagram] = (),
    summary: str | None = None,
    glossary: Sequence[dict] = (),
    section_summaries: dict | None = None,
) -> tuple[str, List[str]]:
    """Wrap emitted body markup in the template call."""
    result = emit(markdown, diagrams, section_summaries)
    generated = datetime.now(timezone.utc).strftime("Generated %Y-%m-%d %H:%M UTC")

    preamble = [
        # Everything the generated body may call has to be imported by name;
        # Typst resolves these at compile time, not by looking around the file.
        '#import "template.typ": doc, section-label, section-summary',
        "#show: doc.with(",
        f'  title: "{escape_string(title)}",',
    ]
    if summary:
        preamble.append(f'  subtitle: "{escape_string(summary)}",')
    if source_label:
        preamble.append(f'  source: "{escape_string(source_label)}",')
    preamble.append(f'  generated: "{generated}",')
    preamble.append(")")

    body = result.typst
    # The glossary goes last, after the document it describes.
    glossary_markup = emit_glossary(list(glossary))
    if glossary_markup:
        body = body.rstrip() + "\n\n" + glossary_markup

    return "\n".join(preamble) + "\n\n" + body, result.warnings


def convert(
    markdown: str,
    *,
    typst_binary: Path,
    build_dir: Path,
    output_path: Path,
    source_label: str | None = None,
    diagrams: Sequence[Diagram] = (),
    summary: str | None = None,
    glossary: Sequence[dict] = (),
    section_summaries: dict | None = None,
) -> ConversionResult:
    """Markdown in, PDF on disk out.

    `build_dir` holds the generated .typ, the template copy, and any diagram
    SVGs; it doubles as Typst's root so nothing outside it can be read.
    """
    build_dir.mkdir(parents=True, exist_ok=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    title = _document_title(markdown, output_path.stem)
    document, warnings = build_document(
        markdown,
        title=title,
        source_label=source_label,
        diagrams=diagrams,
        summary=summary,
        glossary=glossary,
        section_summaries=section_summaries,
    )

    shutil.copyfile(TEMPLATE, build_dir / TEMPLATE.name)
    typst_source = build_dir / "document.typ"
    typst_source.write_text(document, encoding="utf-8")

    try:
        process = subprocess.run(
            [
                str(typst_binary),
                "compile",
                "--root",
                str(build_dir),
                str(typst_source),
                str(output_path),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        # A raw WinError 2 here tells the user nothing. The host checks for the
        # binary before spawning, so reaching this means the install is damaged.
        raise TypstCompileError(
            f"Could not run the bundled Typst binary at {typst_binary}: {exc}",
            typst_source,
        ) from exc

    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise TypstCompileError(
            f"typst compile failed (exit {process.returncode}).\n{detail}",
            typst_source,
        )

    return ConversionResult(
        pdf_path=output_path,
        typst_source=typst_source,
        warnings=warnings,
        page_images=render_page_images(typst_binary, build_dir, typst_source),
    )


def render_page_images(typst_binary: Path, build_dir: Path, typst_source: Path, ppi: int = 144) -> List[Path]:
    """Also render the document as one PNG per page.

    A webview will not display a PDF: the embedded viewer is a browser plugin,
    and it is not available inside one. Chromium renders images perfectly well
    though, so the panel shows pages rather than the file itself, and the PDF is
    still what gets opened, downloaded and shared.

    This is a second Typst run over markup that has already compiled once, so it
    is fast and cannot fail in a way the first run did not. A failure here is
    logged and ignored - the PDF exists either way, and a preview is a
    convenience.
    """
    pages_dir = build_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    process = subprocess.run(
        [
            str(typst_binary),
            "compile",
            "--root",
            str(build_dir),
            "--format",
            "png",
            "--ppi",
            str(ppi),
            str(typst_source),
            str(pages_dir / "page-{p}.png"),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    if process.returncode != 0:
        return []

    # Sorted numerically: page-10 must not come between page-1 and page-2.
    return sorted(pages_dir.glob("page-*.png"), key=lambda path: int(path.stem.split("-")[1]))


def publish_page_images(images: Sequence[Path], destination: Path) -> List[Path]:
    """Move rendered pages somewhere the panel can be pointed at.

    The build directory is scratch and gets discarded; previews have to outlive
    it, so they are copied under the extension's own storage next to the PDF.
    """
    if not images:
        return []

    destination.mkdir(parents=True, exist_ok=True)
    published: List[Path] = []

    for image in images:
        target = destination / image.name
        shutil.copyfile(image, target)
        published.append(target)

    return published


def write_diagrams(build_dir: Path, diagrams: Sequence[dict]) -> List[Diagram]:
    """Persist SVG payloads from the webview next to the generated markup."""
    build_dir.mkdir(parents=True, exist_ok=True)
    written: List[Diagram] = []

    for index, diagram in enumerate(diagrams):
        svg = diagram.get("svg")
        if not svg:
            continue
        filename = f"diagram-{index + 1}.svg"
        (build_dir / filename).write_text(svg, encoding="utf-8")
        written.append(
            Diagram(
                id=str(diagram.get("id") or f"diagram-{index + 1}"),
                filename=filename,
                title=diagram.get("title"),
            )
        )

    return written


__all__ = [
    "ConversionResult",
    "TypstCompileError",
    "build_document",
    "convert",
    "escape",
    "publish_page_images",
    "render_page_images",
    "write_diagrams",
]
