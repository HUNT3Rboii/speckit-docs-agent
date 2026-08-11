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


def build_parser() -> MarkdownIt:
    # `breaks=True` keeps the single-newline-is-a-line-break behaviour the HTML
    # pipeline got from python-markdown's nl2br extension. Users write specs
    # with soft-wrapped lines and expect them to stay separate.
    return MarkdownIt("commonmark", {"breaks": True}).enable("table")


class TypstEmitter:
    def __init__(self, diagrams: Sequence[Diagram] = ()) -> None:
        self._diagrams = list(diagrams)
        self.warnings: List[str] = []

    def emit(self, markdown: str) -> EmitResult:
        tokens = build_parser().parse(markdown)
        tree = SyntaxTreeNode(tokens)
        body = self._blocks(tree.children)

        if self._diagrams:
            body = body + "\n" + self._emit_diagrams()

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
        return f"{'=' * level} {self._inline(node.children[0])}\n"

    def _block_paragraph(self, node: SyntaxTreeNode, _depth: int) -> str:
        return _escape_line_start(self._inline(node.children[0])) + "\n"

    def _block_fence(self, node: SyntaxTreeNode, _depth: int) -> str:
        code = node.content.rstrip("\n")
        language = (node.info or "").strip().split()[0] if node.info else ""
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

    def _emit_diagrams(self) -> str:
        blocks = []
        for diagram in self._diagrams:
            caption = f",\n  caption: [{escape(diagram.title)}]" if diagram.title else ""
            blocks.append(
                f'#figure(\n  image("{escape_string(diagram.filename)}", width: 90%){caption}\n)\n'
            )
        return "\n".join(blocks)

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
        if node.children:
            return self._inline_children(node)

        self.warnings.append(f"Unsupported markdown inline dropped: {node.type}")
        return escape(node.content)

    def _inline_children(self, node: SyntaxTreeNode) -> str:
        return "".join(self._inline_node(child) for child in node.children)


def emit(markdown: str, diagrams: Sequence[Diagram] = ()) -> EmitResult:
    return TypstEmitter(diagrams).emit(markdown)
