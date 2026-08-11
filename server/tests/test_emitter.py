"""Emitter tests.

These assert what markdown *becomes*, not what it looks like - styling lives in
template.typ and is not this module's business. The escaping cases matter most:
Typst treats characters that appear constantly in technical prose (`#`, `[`,
`@`, backticks) as markup, and a leak there is either a compile error or
silently swallowed text.
"""

from pathlib import Path

import pytest

from pdf.emitter import Diagram, emit, escape_string

FIXTURES = Path(__file__).parent / "fixtures"


def typst_for(markdown: str) -> str:
    return emit(markdown).typst


class TestHeadings:
    def test_levels_map_to_equals_signs(self):
        assert typst_for("# One") == "= One\n"
        assert typst_for("### Three") == "=== Three\n"

    def test_heading_text_is_escaped(self):
        assert typst_for("# Deploy #1 [beta]") == "= Deploy \\#1 \\[beta\\]\n"


class TestInline:
    def test_emphasis_maps_to_typst_markers(self):
        assert typst_for("**bold** and *italic*").strip() == "*bold* and _italic_"

    def test_inline_code_uses_raw_function(self):
        # Backtick delimiters cannot express a snippet that itself contains a
        # backtick: Typst reads `` as an empty raw, so the document would run on
        # into the next construct.
        assert typst_for("a `b ` c` d").strip().startswith("a #raw(")
        assert '#raw("b ` c")' in typst_for("a `` b ` c `` d")

    def test_links_become_link_calls(self):
        assert typst_for("[docs](https://example.com/a)").strip() == '#link("https://example.com/a")[docs]'

    def test_link_target_is_escaped_for_a_typst_string(self):
        # markdown-it percent-encodes most of what would break a URL, so this
        # guards the emitter's own escaping rather than a reachable document:
        # a target that ends up carrying a quote must not close the string.
        assert escape_string('a"b\\c') == 'a\\"b\\\\c'

    def test_soft_break_becomes_a_line_break(self):
        # python-markdown's nl2br behaviour, preserved: spec authors soft-wrap
        # lines and expect them to stay separate.
        assert typst_for("one\ntwo").strip() == "one \\\ntwo"


class TestEscaping:
    @pytest.mark.parametrize(
        "character",
        ["#", "$", "*", "_", "`", "<", ">", "@", "[", "]", "~", "\\"],
    )
    def test_typst_markup_characters_are_escaped(self, character):
        emitted = typst_for(f"prefix {character}suffix")
        assert f"\\{character}" in emitted

    @pytest.mark.parametrize("marker", ["=", "/", "."])
    def test_paragraphs_starting_with_a_marker_are_escaped(self, marker):
        # Otherwise Typst reads the paragraph as a heading, a term, or a comment
        # - none of which the author wrote. `-` and `+` are absent because
        # markdown claims them first: they arrive as real lists, never as
        # paragraphs.
        assert typst_for(f"{marker} not markup").startswith(f"\\{marker}")

    def test_marker_after_a_line_break_is_escaped(self):
        assert "\\= not a heading" in typst_for("text\n= not a heading")


class TestCodeBlocks:
    def test_language_is_preserved_for_highlighting(self):
        assert typst_for("```python\nx = 1\n```") == "```python\nx = 1\n```\n"

    def test_fence_outgrows_backticks_in_the_code(self):
        emitted = typst_for("````\ncontains ``` fence\n````")
        assert emitted.startswith("````")

    def test_unusable_language_hint_is_dropped_with_a_warning(self):
        result = emit("```lang!!\nx\n```")
        assert result.typst.startswith("```\n")
        assert any("language hint" in warning for warning in result.warnings)


class TestLists:
    def test_bullet_and_ordered_markers(self):
        assert typst_for("- a\n- b") == "- a\n- b\n"
        assert typst_for("1. a\n2. b") == "+ a\n+ b\n"

    def test_nested_list_is_indented(self):
        emitted = typst_for("- outer\n  - inner")
        assert "- outer\n  - inner" in emitted

    def test_task_items_render_their_marker_as_raw(self):
        emitted = typst_for("- [x] done\n- [ ] pending")
        assert "- `[x]` done" in emitted
        assert "- `[ ]` pending" in emitted


class TestBlocks:
    def test_blockquote_uses_quote_block(self):
        emitted = typst_for("> quoted")
        assert emitted.startswith("#quote(block: true)[")
        assert "quoted" in emitted

    def test_horizontal_rule_becomes_a_line(self):
        assert typst_for("---").startswith("#line(")

    def test_table_emits_header_and_rows(self):
        emitted = typst_for("| A | B |\n|---|---|\n| 1 | 2 |")
        assert "columns: 2," in emitted
        assert "table.header([*A*], [*B*])," in emitted
        assert "[1], [2]," in emitted

    def test_ragged_table_rows_are_padded(self):
        # A row shorter than the header would otherwise shift every later cell
        # into the wrong column.
        emitted = emit("| A | B |\n|---|---|\n| 1 |\n").typst
        assert "columns: 2," in emitted


class TestUnsupported:
    def test_images_are_dropped_with_a_warning(self):
        result = emit("![alt](picture.png)")
        assert "picture.png" not in result.typst
        assert any("images are not supported" in warning for warning in result.warnings)

    def test_inline_html_is_kept_as_literal_text(self):
        # Dropping it loses content the author wrote; interpreting it would mean
        # a second rendering engine. Printing it is the honest middle.
        result = emit("before <span>x</span> after")
        assert "\\<span\\>" in result.typst
        assert any("Inline HTML" in warning for warning in result.warnings)

    def test_html_block_is_kept_as_literal_text(self):
        result = emit("<div>\n  block\n</div>")
        assert "block" in result.typst
        assert any("HTML block" in warning for warning in result.warnings)


class TestDiagrams:
    def test_diagrams_become_figures(self):
        result = emit("# Doc", [Diagram(id="d1", filename="diagram-1.svg", title="Flow")])
        assert '#figure(\n  image("diagram-1.svg", width: 90%),\n  caption: [Flow]\n)' in result.typst

    def test_untitled_diagram_has_no_caption(self):
        result = emit("# Doc", [Diagram(id="d1", filename="diagram-1.svg")])
        assert "caption" not in result.typst


class TestGolden:
    def test_kitchen_sink_matches_golden_output(self):
        """Full-document regression guard.

        Regenerate deliberately after an intended change:
            python server/tests/regenerate_golden.py
        """
        markdown = (FIXTURES / "kitchen-sink.md").read_text(encoding="utf-8")
        expected = (FIXTURES / "kitchen-sink.typ").read_text(encoding="utf-8")
        assert emit(markdown).typst == expected
