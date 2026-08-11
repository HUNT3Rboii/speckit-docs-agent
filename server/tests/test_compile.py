"""End-to-end: markdown in, PDF on disk out, through the real Typst binary.

The emitter tests assert what markup is produced; only this one proves the
markup is something Typst will actually accept. Without it an escaping mistake
looks fine in a golden file and fails on a user's machine.

Skipped when the runtimes have not been fetched, so a clone without `npm run
fetch-runtimes` still has a green suite.
"""

import sys
from pathlib import Path

import pytest

from pdf.compile import TypstCompileError, build_document, convert
from pdf.emitter import Diagram

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">
  <rect x="1" y="1" width="98" height="38" fill="none" stroke="black"/>
  <text x="10" y="25" font-family="DejaVu Sans" font-size="10">Gateway</text>
</svg>
"""


def typst_binary() -> Path:
    target = "win32-x64" if sys.platform == "win32" else "linux-x64"
    name = "typst.exe" if sys.platform == "win32" else "typst"
    return REPO_ROOT / "bin" / target / name


requires_typst = pytest.mark.skipif(
    not typst_binary().exists(),
    reason="bundled typst not present; run `npm run fetch-runtimes`",
)


class TestBuildDocument:
    def test_preamble_imports_the_template(self):
        document, _ = build_document("# Title\n\nBody.", title="Title", source_label="spec.md")
        assert document.startswith('#import "template.typ": doc')
        assert '#show: doc.with(' in document

    def test_title_quotes_cannot_break_out_of_the_preamble(self):
        document, _ = build_document("body", title='He said "hi"', source_label=None)
        assert '"He said \\"hi\\""' in document


@requires_typst
class TestCompile:
    def test_kitchen_sink_compiles_to_a_pdf(self, tmp_path):
        markdown = (FIXTURES / "kitchen-sink.md").read_text(encoding="utf-8")
        output = tmp_path / "out.pdf"

        result = convert(
            markdown,
            typst_binary=typst_binary(),
            build_dir=tmp_path / "build",
            output_path=output,
            source_label="kitchen-sink.md",
        )

        assert result.pdf_path == output
        assert output.read_bytes().startswith(b"%PDF-")

    def test_title_is_taken_from_the_first_heading(self, tmp_path):
        output = tmp_path / "out.pdf"
        convert(
            "# Order Processing\n\nBody.",
            typst_binary=typst_binary(),
            build_dir=tmp_path / "build",
            output_path=output,
        )
        assert '"Order Processing"' in (tmp_path / "build" / "document.typ").read_text(encoding="utf-8")

    def test_diagram_svg_is_embedded(self, tmp_path):
        build_dir = tmp_path / "build"
        build_dir.mkdir()
        (build_dir / "diagram-1.svg").write_text(SVG, encoding="utf-8")
        output = tmp_path / "out.pdf"

        convert(
            "# Doc\n\nText.",
            typst_binary=typst_binary(),
            build_dir=build_dir,
            output_path=output,
            diagrams=[Diagram(id="d1", filename="diagram-1.svg", title="Flow")],
        )

        assert output.read_bytes().startswith(b"%PDF-")

    def test_compile_failure_keeps_the_generated_markup(self, tmp_path):
        # The .typ surviving a failure is the debugging story for this design:
        # emit text, read it when the compiler complains.
        build_dir = tmp_path / "build"
        with pytest.raises(TypstCompileError) as exc_info:
            convert(
                "# Doc",
                typst_binary=tmp_path / "not-typst.exe",
                build_dir=build_dir,
                output_path=tmp_path / "out.pdf",
            )
        assert exc_info.value.typst_source.exists()
