"""Markdown -> Typst markup.

The pipeline is `.md -> markdown-it-py -> AST -> generated .typ -> typst
compile -> .pdf`, and this module is the middle step. It emits Typst *as text*
on purpose: when a PDF comes out wrong the generated `.typ` is right there to
read, which is not true of a layout API.

Styling lives in `template.typ`. Nothing here decides what anything looks like -
it decides only what each markdown construct *is*.

Supported, matching what the HTML pipeline handled: headings 1-6, paragraphs
with hard line breaks, fenced code (now syntax-highlighted, which the HTML path
never did), tables, ordered/unordered/nested lists, task list items,
blockquotes, horizontal rules, and inline bold/italic/code/links. Images are
deliberately absent - they never resolved in the HTML pipeline either.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, List, Sequence

from markdown_it import MarkdownIt
from markdown_it.tree import SyntaxTreeNode

from .sections import NORMAL, split_sections, summaries_by_heading, summary_for

# Characters that begin markup in Typst content. Escaped everywhere text is
# emitted, because a stray `#` or `[` from a user's prose is a compile error at
# best and silently swallowed markup at worst.
_ESCAPE = re.compile(r"([\\#$*_`<>@\[\]~])")

# A line starting with one of these reads as a list, heading, or term in Typst
# even when the rest of the line is plain prose.
_LINE_START = re.compile(r"^([-+/=.])")

# Typst raw-block languages are identifiers; anything else is dropped rather
# than risking a compile error over a syntax-highlighting hint.
_LANG = re.compile(r"^[A-Za-z0-9_+#-]+$")

_TASK_MARKER = re.compile(r"^\[([ xX])\]\s+")
# The same marker after escaping, which is the form it has by the time the
# emitted text is available to strip it from.
_ESCAPED_TASK_MARKER = re.compile(r"^\\\[[ xX]\\\]\s*")


def escape(text: str) -> str:
    """Escape a run of literal text for Typst content mode."""
    return _ESCAPE.sub(r"\\\1", text)


def escape_string(text: str) -> str:
    """Escape for a Typst string literal, e.g. a link target."""
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _escape_line_start(text: str) -> str:
    # Applied per line, not once: a paragraph is emitted as several lines when
    # it contains breaks, and Typst reads a marker at the start of any of them.
    return "\n".join(_LINE_START.sub(r"\\\1", line) for line in text.split("\n"))


@dataclass
class Diagram:
    """A rendered diagram, already SVG by the time it reaches Python.

    Mermaid runs in the webview - it is a browser, so it renders there and
    passes the SVG back. Typst cannot embed PDF, so SVG is also the only vector
    format that works; the two constraints agree.
    """

    id: str
    filename: str
    title: str | None = None


@dataclass
class EmitResult:
    typst: str
    warnings: List[str] = field(default_factory=list)


def emit_glossary(entries: Sequence[dict]) -> str:
    """Render validated glossary entries as a terms section.

    Everything here has already been checked against the document; the emitter
    does not decide what is true, only how it looks.
    """
    if not entries:
        return ""

    lines = ["= Glossary", ""]
    for entry in entries:
        term = escape(str(entry.get("term", "")))
        definition = escape(str(entry.get("definition", "")))
        lines.append(f"/ {term}: {definition}")
    return "\n".join(lines) + "\n"


def build_parser() -> MarkdownIt:
    # `breaks=True` keeps the single-newline-is-a-line-break behaviour the HTML
    # pipeline got from python-markdown's nl2br extension. Users write specs
    # with soft-wrapped lines and expect them to stay separate.
    return MarkdownIt("commonmark", {"breaks": True}).enable("table")


class TypstEmitter:
    def __init__(
        self,
        diagrams: Sequence[Diagram] = (),
        section_summaries: dict | None = None,
    ) -> None:
        self._diagrams = list(diagrams)
        self._placed: set[str] = set()
        self._mermaid_seen = 0
        self._summaries = summaries_by_heading(section_summaries)
        self._types: dict = {}
        self.warnings: List[str] = []

    def emit(self, markdown: str) -> EmitResult:
        # Section types come from the source text rather than the token stream:
        # what a section *is* depends on its whole content, which the per-node
        # walk below never sees at once.
        self._types = {
            section.heading.strip(): section.type
            for section in split_sections(markdown)
            if section.type != NORMAL
        }

        tokens = build_parser().parse(markdown)
        tree = SyntaxTreeNode(tokens)
        body = self._blocks(tree.children)

        # Diagrams are placed where their code block was, so a figure stays with
        # the prose that introduces it. Any that were never claimed by a fence -
        # a diagram id with no matching block - are appended rather than lost.
        leftover = [diagram for diagram in self._diagrams if diagram.id not in self._placed]
        if leftover:
            body = body + "\n" + "\n".join(self._figure(diagram) for diagram in leftover)

        return EmitResult(typst=body.strip() + "\n", warnings=self.warnings)

    # -- block level ----------------------------------------------------------

    def _blocks(self, nodes: Iterable[SyntaxTreeNode], depth: int = 0) -> str:
        return "\n".join(part for part in (self._block(node, depth) for node in nodes) if part)

    def _block(self, node: SyntaxTreeNode, depth: int) -> str:
        handler = getattr(self, f"_block_{node.type}", None)
        if handler is None:
            self.warnings.append(f"Unsupported markdown block dropped: {node.type}")
            return ""
        return handler(node, depth)

    def _block_heading(self, node: SyntaxTreeNode, _depth: int) -> str:
        level = int(node.tag[1:])
        text = self._inline(node.children[0])
        raw = node.children[0].content.strip()

        parts = [f"{'=' * level} {text}"]

        # The label carries what the HTML pipeline's grouping used to: a reader
        # can see that a section is a task list or a decision record without
        # having to read it first.
        section_type = self._types.get(raw)
        if section_type:
            parts.append(f'#section-label("{escape_string(section_type.replace("_", " "))}")')

        summary = summary_for(raw, self._summaries)
        if summary:
            parts.append(f"#section-summary[{escape(summary)}]")

        return "\n".join(parts) + "\n"

    def _block_paragraph(self, node: SyntaxTreeNode, _depth: int) -> str:
        return _escape_line_start(self._inline(node.children[0])) + "\n"

    def _block_fence(self, node: SyntaxTreeNode, _depth: int) -> str:
        code = node.content.rstrip("\n")
        language = (node.info or "").strip().split()[0] if node.info else ""

        if language.lower() == "mermaid":
            figure = self._mermaid_figure()
            if figure is not None:
                return figure
            # No rendered SVG for this one - the panel was closed, or mermaid
            # rejected the syntax. The source is more useful in the PDF than a
            # gap where a diagram should be.
            self.warnings.append("A mermaid diagram was not rendered; its source is shown instead")

        if language and not _LANG.match(language):
            self.warnings.append(f"Ignored unusable code language hint: {language!r}")
            language = ""

        # The fence has to outrun any backtick run inside the code, or the block
        # terminates early and the rest of the document lands inside it.
        longest = max((len(run) for run in re.findall(r"`+", code)), default=0)
        fence = "`" * max(3, longest + 1)
        return f"{fence}{language}\n{code}\n{fence}\n"

    _block_code_block = _block_fence

    def _block_bullet_list(self, node: SyntaxTreeNode, depth: int) -> str:
        return self._list(node, depth, marker="-")

    def _block_ordered_list(self, node: SyntaxTreeNode, depth: int) -> str:
        return self._list(node, depth, marker="+")

    def _list(self, node: SyntaxTreeNode, depth: int, marker: str) -> str:
        indent = "  " * depth
        items = []
        for item in node.children:
            content = self._list_item(item, depth)
            items.append(f"{indent}{marker} {content}" if content else f"{indent}{marker} ")
        return "\n".join(items) + "\n"

    def _list_item(self, item: SyntaxTreeNode, depth: int) -> str:
        parts: List[str] = []
        for index, child in enumerate(item.children):
            if child.type == "paragraph":
                inline = child.children[0]
                text = self._inline(inline)
                # `- [x] text` arrives as a plain paragraph; markdown-it has no
                # task-list support in commonmark mode. Rendering the marker as
                # inline raw sidesteps Typst's bracket syntax and needs no font
                # with box glyphs in it. The text lives on the inline node - a
                # paragraph node's own `content` is empty.
                if index == 0:
                    match = _TASK_MARKER.match(inline.content)
                    if match:
                        checked = match.group(1).lower() == "x"
                        text = _ESCAPED_TASK_MARKER.sub("", text, count=1)
                        text = f"`[{'x' if checked else ' '}]` {text}"
                parts.append(text)
            elif child.type in ("bullet_list", "ordered_list"):
                nested = self._block(child, depth + 1)
                parts.append("\n" + nested.rstrip("\n"))
            else:
                block = self._block(child, depth)
                if block:
                    parts.append("\n" + self._indent_continuation(block, depth))
        return "".join(parts).rstrip()

    def _indent_continuation(self, block: str, depth: int) -> str:
        """Indent a non-list block so it stays inside its list item."""
        indent = "  " * (depth + 1)
        return "\n".join(indent + line if line else line for line in block.rstrip("\n").splitlines())

    def _block_blockquote(self, node: SyntaxTreeNode, depth: int) -> str:
        inner = self._blocks(node.children, depth).strip()
        return f"#quote(block: true)[\n{inner}\n]\n"

    def _block_html_block(self, node: SyntaxTreeNode, _depth: int) -> str:
        # Same reasoning as inline HTML: kept verbatim rather than silently
        # discarded, so an author can see what did not survive the change of
        # medium.
        self.warnings.append("HTML block kept as literal text")
        return _escape_line_start(escape(node.content.strip())) + "\n"

    def _block_hr(self, _node: SyntaxTreeNode, _depth: int) -> str:
        return "#line(length: 100%, stroke: 0.5pt + luma(180))\n"

    def _block_table(self, node: SyntaxTreeNode, _depth: int) -> str:
        header: List[str] = []
        rows: List[List[str]] = []

        for section in node.children:
            for row in section.children:
                cells = [self._inline(cell.children[0]) if cell.children else "" for cell in row.children]
                if section.type == "thead":
                    header = cells
                else:
                    rows.append(cells)

        columns = max([len(header)] + [len(row) for row in rows] or [0])
        if columns == 0:
            return ""

        lines = ["#table(", f"  columns: {columns},"]
        if header:
            padded = header + [""] * (columns - len(header))
            cells = ", ".join(f"[*{cell}*]" for cell in padded)
            lines.append(f"  table.header({cells}),")
        for row in rows:
            padded = row + [""] * (columns - len(row))
            lines.append("  " + ", ".join(f"[{cell}]" for cell in padded) + ",")
        lines.append(")")
        return "\n".join(lines) + "\n"

    def _mermaid_figure(self) -> str | None:
        """Claim the next rendered diagram, in document order.

        The host scans fences the same way and numbers them identically, so the
        nth mermaid block here is the nth diagram it sent.
        """
        index = self._mermaid_seen
        self._mermaid_seen += 1

        if index >= len(self._diagrams):
            return None

        diagram = self._diagrams[index]
        self._placed.add(diagram.id)
        return self._figure(diagram)

    def _figure(self, diagram: Diagram) -> str:
        caption = f",\n  caption: [{escape(diagram.title)}]" if diagram.title else ""
        return f'#figure(\n  image("{escape_string(diagram.filename)}", width: 90%){caption}\n)\n'

    # -- inline level ---------------------------------------------------------

    def _inline(self, node: SyntaxTreeNode) -> str:
        return "".join(self._inline_node(child) for child in node.children)

    def _inline_node(self, node: SyntaxTreeNode) -> str:
        if node.type == "text":
            return escape(node.content)
        if node.type == "strong":
            return f"*{self._inline_children(node)}*"
        if node.type == "em":
            return f"_{self._inline_children(node)}_"
        if node.type == "code_inline":
            # `#raw(...)` rather than backtick delimiters: doubling the ticks is
            # a markdown habit, and Typst reads `` as an empty raw instead of
            # an escaped delimiter, so any snippet containing a backtick would
            # swallow the rest of the document.
            return f'#raw("{escape_string(node.content)}")'
        if node.type == "link":
            target = escape_string(node.attrs.get("href", ""))
            return f'#link("{target}")[{self._inline_children(node)}]'
        if node.type in ("softbreak", "hardbreak"):
            return " \\\n"
        if node.type == "image":
            self.warnings.append("Markdown images are not supported and were dropped")
            return ""
        if node.type == "html_inline":
            # A PDF has nothing to do with a tag. Printing it as written is at
            # least honest about what was in the source; interpreting it would
            # mean a second rendering engine.
            self.warnings.append(f"Inline HTML kept as literal text: {node.content.strip()}")
            return escape(node.content)
        if node.children:
            return self._inline_children(node)

        self.warnings.append(f"Unsupported markdown inline dropped: {node.type}")
        return escape(node.content)

    def _inline_children(self, node: SyntaxTreeNode) -> str:
        return "".join(self._inline_node(child) for child in node.children)


def emit(
    markdown: str,
    diagrams: Sequence[Diagram] = (),
    section_summaries: dict | None = None,
) -> EmitResult:
    return TypstEmitter(diagrams, section_summaries).emit(markdown)
