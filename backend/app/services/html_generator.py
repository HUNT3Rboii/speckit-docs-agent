"""
HTML Generator Service

Generates styled HTML with embedded diagrams, table of contents, glossary links,
and page breaks. This service transforms validated EnrichedJSON into professional HTML.

Requirements: 12.1, 12.2, 12.4
"""

import re
import html as html_stdlib
import markdown as markdown_lib
from typing import Any, Dict, List, Optional
from pathlib import Path
from datetime import datetime
import urllib.parse

# CSS class used to wrap sections of a given type; sections not in this map
# render without a special wrapper (plain <section>).
SECTION_TYPE_CSS_CLASS = {
    "task": "section-task",
    "user_story": "section-user-story",
    "design_decision": "section-design-decision",
    "callout": "section-callout",
    "open_question": "section-callout",
}


class HTMLGeneratorService:
    """
    Generates professional styled HTML from enriched JSON with diagrams,
    table of contents, glossary links, and page breaks.
    """

    # Professional CSS styling for HTML output
    CSS_STYLES = """
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            /* No padding here: PDFGeneratorService's @page rule already
               sets 1in margins on all sides. Body padding would stack on
               top of that (previously it did - 1in page margin + 1in body
               padding = 2in before any content started, and ~2in narrower
               usable width on every page), pushing the cover page title
               and every section's content much further from the page edge
               than intended. */
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #fff;
        }

        /* Cover Page - top-aligned like a normal document cover, not a
           vertically-centered title slide (a tall flexbox with
           justify-content: center pushed everything toward the middle of
           the page with large dead space above/below on short content). */
        .cover-page {
            page-break-after: always;
            border-bottom: 1px solid #ddd;
            padding-top: 0.3in;
            padding-bottom: 1in;
            margin-bottom: 1in;
            text-align: center;
        }

        .cover-title {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 0.3in;
            color: #1a1a1a;
            word-wrap: break-word;
        }

        .cover-abstract {
            font-size: 14px;
            line-height: 1.8;
            margin: 0 auto 0.4in;
            color: #555;
            max-width: 6in;
        }

        .cover-metadata {
            font-size: 11px;
            color: #777;
            margin-top: 0.4in;
            text-align: center;
            border-top: 1px solid #ddd;
            padding-top: 0.3in;
        }

        .metadata-item {
            margin: 0.1in 0;
        }

        /* Table of Contents */
        .toc-section {
            page-break-after: always;
            margin-bottom: 1in;
        }

        .toc-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 0.5in;
            color: #1a1a1a;
        }

        .toc-list {
            list-style: none;
            font-size: 12px;
        }

        .toc-item {
            margin: 0.15in 0;
        }

        .toc-level-1 {
            margin-left: 0;
            font-weight: 600;
        }

        .toc-level-2 {
            margin-left: 0.3in;
        }

        .toc-level-3 {
            margin-left: 0.6in;
        }

        .toc-link {
            color: #0066cc;
            text-decoration: none;
        }

        .toc-link:hover {
            text-decoration: underline;
        }

        /* Content Sections */
        .content {
            page-break-inside: avoid;
        }

        section {
            margin-bottom: 0.5in;
            page-break-inside: avoid;
        }

        h1, h2, h3, h4, h5, h6 {
            margin-top: 0.3in;
            margin-bottom: 0.2in;
            color: #1a1a1a;
            page-break-after: avoid;
        }

        h1 {
            font-size: 28px;
            font-weight: 700;
            border-bottom: 2px solid #0066cc;
            padding-bottom: 0.15in;
            page-break-before: always;
        }

        h2 {
            font-size: 22px;
            font-weight: 700;
            border-bottom: 1px solid #ddd;
            padding-bottom: 0.1in;
        }

        h3 {
            font-size: 16px;
            font-weight: 600;
        }

        h4, h5, h6 {
            font-size: 14px;
            font-weight: 600;
        }

        /* Paragraphs and Text */
        p {
            margin-bottom: 0.15in;
            text-align: justify;
        }

        /* Summary Box */
        .section-summary {
            background-color: #f5f5f5;
            border-left: 4px solid #0066cc;
            padding: 0.2in 0.3in;
            margin: 0.2in 0;
            font-size: 12px;
            font-style: italic;
            page-break-inside: avoid;
        }

        /* Section Types Styling */
        .section-task {
            background-color: #f0f7ff;
            border: 1px solid #99ccff;
            padding: 0.2in;
            margin: 0.2in 0;
            page-break-inside: avoid;
        }

        .section-user-story {
            background-color: #f5fff0;
            border: 1px solid #99ff99;
            padding: 0.2in;
            margin: 0.2in 0;
            page-break-inside: avoid;
        }

        .section-design-decision {
            background-color: #fff5f0;
            border: 1px solid #ffcc99;
            padding: 0.2in;
            margin: 0.2in 0;
            page-break-inside: avoid;
        }

        .section-callout {
            background-color: #fffdf0;
            border-left: 4px solid #ff9900;
            padding: 0.2in 0.3in;
            margin: 0.2in 0;
            page-break-inside: avoid;
        }

        /* Diagrams */
        .diagram-container {
            margin: 0.3in 0;
            page-break-inside: avoid;
            text-align: center;
        }

        .diagram-image {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            padding: 0.15in;
            background-color: #fafafa;
        }

        .diagram-caption {
            font-size: 11px;
            color: #666;
            margin-top: 0.1in;
            font-style: italic;
        }

        /* Glossary */
        .glossary-section {
            page-break-before: always;
        }

        .glossary-term {
            margin-bottom: 0.2in;
            page-break-inside: avoid;
        }

        .glossary-term-title {
            font-weight: 600;
            font-size: 12px;
            color: #1a1a1a;
            margin-bottom: 0.05in;
        }

        .glossary-term-definition {
            font-size: 11px;
            color: #555;
            margin-left: 0.2in;
        }

        .glossary-link {
            color: #0066cc;
            text-decoration: none;
            font-weight: 600;
        }

        .glossary-link:hover {
            text-decoration: underline;
        }

        /* Footer and Page Breaks */
        .page-break {
            page-break-after: always;
        }

        footer {
            margin-top: 1in;
            border-top: 1px solid #ddd;
            padding-top: 0.2in;
            font-size: 10px;
            color: #777;
            text-align: center;
        }

        @media print {
            /* No body margin/padding here either - see the base body rule
               above for why (WeasyPrint evaluates @media print, so this
               would otherwise reintroduce the same double-margin bug). */
            .page-break {
                page-break-after: always;
            }
            h1 {
                page-break-before: always;
            }
        }

        /* Task checklist styling */
        .task-item {
            display: flex;
            align-items: center;
            margin: 0.1in 0;
            font-size: 12px;
        }

        .task-checkbox {
            width: 0.2in;
            height: 0.2in;
            margin-right: 0.1in;
            border: 1px solid #999;
        }

        .task-checkbox.checked {
            background-color: #0066cc;
        }

        /* Lists */
        ul, ol {
            margin-left: 0.3in;
            margin-bottom: 0.15in;
        }

        li {
            margin-bottom: 0.1in;
        }

        /* Code blocks */
        code {
            background-color: #f4f4f4;
            padding: 0.05in 0.1in;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            border-radius: 3px;
        }

        pre {
            background-color: #f4f4f4;
            padding: 0.2in;
            border-radius: 3px;
            overflow-x: auto;
            margin: 0.15in 0;
        }

        pre code {
            background-color: transparent;
            padding: 0;
        }

        /* Blockquotes */
        blockquote {
            border-left: 4px solid #ccc;
            padding-left: 0.2in;
            margin-left: 0;
            color: #666;
            font-style: italic;
        }

        /* Tables */
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 0.15in 0;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 0.1in;
            text-align: left;
            font-size: 11px;
        }

        th {
            background-color: #f5f5f5;
            font-weight: 600;
        }

        /* Scrollable for wide content */
        div.table-container {
            overflow-x: auto;
        }
    </style>
    """

    def __init__(self) -> None:
        """Initialize HTML generator."""
        pass

    def generate_html(
        self,
        enriched_json: Dict[str, Any],
        rendered_diagrams: Dict[str, str],
        artifact_type: str = "document",
        source_path: str = "",
        commit_hash: Optional[str] = None,
        project_root: Optional[str] = None,
        authoring_framework: Optional[str] = None,
        model_used: Optional[str] = None,
    ) -> str:
        """
        Generate complete HTML document from enriched JSON.

        Args:
            enriched_json: Validated enriched JSON with all enrichments
            rendered_diagrams: Dict mapping diagram IDs (``diagram-{index}``) to
                rendered PNG paths (or absent/None if rendering failed)
            artifact_type: Type of artifact (document, specification, guide, etc.)
            source_path: Path to source markdown file
            commit_hash: Optional git commit hash for version tracking
            project_root: Optional project/workspace folder name, detected
                client-side (the backend has no filesystem visibility into the
                caller's workspace)
            authoring_framework: Optional detected authoring framework for the
                source .md (e.g. "speckit", "kiro", "claude-code", "manual")
            model_used: Optional human-readable label for the AI model/provider
                that produced the enriched JSON

        Returns:
            Complete HTML string ready for PDF rendering
        """
        # Extract metadata
        title = enriched_json.get("title", "Untitled Document")
        abstract = enriched_json.get("abstract", "")
        sections = enriched_json.get("sections", [])
        diagrams = enriched_json.get("diagrams", [])
        glossary = enriched_json.get("glossary", [])
        summaries = enriched_json.get("summaries", {}) or {}

        # Build metadata
        metadata = {
            "type": artifact_type,
            "source": source_path,
            "commit": commit_hash or "N/A",
            "generated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "project": project_root,
            "framework": authoring_framework,
            "model": model_used,
        }

        # Executive summary takes precedence over the raw abstract on the
        # cover page (Requirement 11.1 / 12.2), falling back to abstract.
        cover_summary = summaries.get("executiveSummary") or abstract

        # Generate HTML sections
        cover_page_html = self.generate_cover_page(title, cover_summary, metadata)
        task_summary_html = (
            self._generate_task_progress_summary(sections)
            if artifact_type == "task"
            else ""
        )
        toc_html = self.generate_table_of_contents(sections)
        content_html = self._generate_sections_html(
            sections, glossary, rendered_diagrams, summaries, diagrams
        )
        glossary_html = self._generate_glossary_html(glossary)

        # Combine into complete HTML document
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self._escape_html(title)}</title>
    {self.CSS_STYLES}
</head>
<body>
    {cover_page_html}
    {task_summary_html}
    {toc_html}
    {content_html}
    {glossary_html}
    <footer>
        <p>Generated on {metadata['generated']} | {metadata['type'].title()} | Page <span class="page-number"></span></p>
    </footer>
</body>
</html>
"""
        return html

    def generate_cover_page(self, title: str, summary: str, metadata: Dict[str, Any]) -> str:
        """
        Generate cover page HTML with title, summary, and metadata.

        Args:
            title: Document title
            summary: Executive summary or abstract to display
            metadata: Dict with optional "project", "framework", "model", "type",
                "source", "commit", "generated" keys - any falsy/absent value is
                simply omitted from the rendered metadata block (keeps this
                backward compatible with callers that don't pass the newer keys)

        Returns:
            HTML string for the cover page section
        """
        labels = {
            "project": "Project",
            "framework": "Authored With",
            "model": "Enriched By",
            "type": "Type",
            "source": "Source",
            "commit": "Commit",
            "generated": "Generated",
        }
        meta_items = []
        for key in ("project", "framework", "model", "type", "source", "commit", "generated"):
            value = metadata.get(key)
            if value:
                meta_items.append(
                    f'<div class="metadata-item">{labels[key]}: {self._escape_html(str(value))}</div>'
                )

        return f"""<div class="cover-page">
    <div class="cover-title">{self._escape_html(title)}</div>
    <div class="cover-abstract">{self._render_inline_markdown(summary)}</div>
    <div class="cover-metadata">
        {''.join(meta_items)}
    </div>
</div>"""

    def generate_table_of_contents(self, sections: List[Dict[str, Any]]) -> str:
        """
        Generate table of contents HTML for heading levels 1-3.

        Args:
            sections: List of section dicts with "heading" and "level"

        Returns:
            HTML string for the table of contents section
        """
        items = []
        for idx, section in enumerate(sections):
            level = section.get("level", 2)
            if not isinstance(level, int) or level < 1 or level > 3:
                continue
            heading = section.get("heading", "")
            anchor = self._section_anchor(heading, idx)
            items.append(
                f'<li class="toc-item toc-level-{level}">'
                f'<a class="toc-link" href="#{anchor}">{self._escape_html(heading)}</a>'
                f"</li>"
            )

        return f"""<div class="toc-section">
    <h2 class="toc-title">Table of Contents</h2>
    <ul class="toc-list">
        {''.join(items)}
    </ul>
</div>"""

    def embed_diagrams(
        self,
        section_html_blocks: List[str],
        diagrams: List[Dict[str, Any]],
        rendered_diagrams: Dict[str, str],
    ) -> str:
        """
        Embed diagram images after their referenced sections.

        Diagrams whose ``location`` is ``after-section-{N}`` (1-indexed, matching
        the position of ``section_html_blocks``) are inserted immediately after
        that section's HTML block. Diagrams with an ``inline-section-*`` location
        are embedded by ``_render_section_body`` directly and are skipped here.

        Args:
            section_html_blocks: Rendered HTML for each section, in document order
            diagrams: List of diagram dicts (with "location", "type", etc.)
            rendered_diagrams: Dict mapping "diagram-{index}" to rendered PNG paths

        Returns:
            Combined HTML string with diagrams interleaved between sections
        """
        result: List[str] = []
        for idx, section_html in enumerate(section_html_blocks):
            result.append(section_html)
            section_number = idx + 1
            for diagram_idx, diagram in enumerate(diagrams):
                location = diagram.get("location", "")
                if location == f"after-section-{section_number}":
                    result.append(
                        self._render_diagram_block(diagram_idx, diagram, rendered_diagrams)
                    )
        return "\n".join(result)

    def linkify_glossary_terms(self, html_fragment: str, glossary: List[Dict[str, Any]]) -> str:
        """
        Wrap the first occurrence of each glossary term with a hyperlink to
        its glossary entry.

        Args:
            html_fragment: HTML content to search within (typically one section)
            glossary: List of glossary entry dicts with a "term" key

        Returns:
            HTML with the first occurrence of each term linkified
        """
        result = html_fragment
        for entry in glossary:
            term = entry.get("term", "")
            if not term or len(term) < 2:
                continue
            anchor = self._glossary_anchor(term)
            pattern = re.compile(r"\b" + re.escape(term) + r"\b", re.IGNORECASE)

            def _replace(match: "re.Match[str]", anchor: str = anchor) -> str:
                return f'<a class="glossary-link" href="#{anchor}">{match.group(0)}</a>'

            result, _ = pattern.subn(_replace, result, count=1)
        return result

    def _generate_sections_html(
        self,
        sections: List[Dict[str, Any]],
        glossary: List[Dict[str, Any]],
        rendered_diagrams: Dict[str, str],
        summaries: Dict[str, Any],
        diagrams: List[Dict[str, Any]],
    ) -> str:
        """Render every section (grouped/styled by type) with summaries, then
        interleave diagrams at their requested locations."""
        per_section_summaries = (summaries or {}).get("perSection") or {}
        section_blocks: List[str] = []

        for idx, section in enumerate(sections):
            heading = section.get("heading", "")
            content = section.get("content", "")
            section_type = section.get("type", "normal")
            level = section.get("level", 2)
            tag = f"h{level}" if isinstance(level, int) and 1 <= level <= 6 else "h3"
            anchor = self._section_anchor(heading, idx)
            section_number = idx + 1

            body_html = self._render_section_body(
                content, section_type, section_number, diagrams, rendered_diagrams
            )
            body_html = self.linkify_glossary_terms(body_html, glossary)

            summary_html = ""
            if len(content.split()) > 200:
                per_section_summary = per_section_summaries.get(heading)
                if per_section_summary:
                    summary_html = (
                        f'<div class="section-summary">{self._render_inline_markdown(per_section_summary)}</div>'
                    )

            inner = f'<{tag} id="{anchor}">{self._escape_html(heading)}</{tag}>{summary_html}{body_html}'

            wrapper_class = SECTION_TYPE_CSS_CLASS.get(section_type)
            if wrapper_class:
                section_blocks.append(f'<section class="{wrapper_class}">{inner}</section>')
            else:
                section_blocks.append(f"<section>{inner}</section>")

        return self.embed_diagrams(section_blocks, diagrams, rendered_diagrams)

    def _render_section_body(
        self,
        content: str,
        section_type: str,
        section_number: int,
        diagrams: List[Dict[str, Any]],
        rendered_diagrams: Dict[str, str],
    ) -> str:
        """Render a section's content as HTML, splicing in any
        inline-section-{N}-paragraph-{M} diagrams and rendering task
        checklists specially."""
        if section_type == "task":
            return self._render_task_checklist(content)

        paragraphs = [p for p in re.split(r"\n\s*\n", content.strip()) if p.strip()]
        if not paragraphs:
            return self._render_markdown(content)

        rendered_paragraphs = []
        for p_idx, paragraph in enumerate(paragraphs, start=1):
            rendered_paragraphs.append(self._render_markdown(paragraph))
            for diagram_idx, diagram in enumerate(diagrams):
                location = diagram.get("location", "")
                if location == f"inline-section-{section_number}-paragraph-{p_idx}":
                    rendered_paragraphs.append(
                        self._render_diagram_block(diagram_idx, diagram, rendered_diagrams)
                    )

        return "\n".join(rendered_paragraphs)

    def _render_task_checklist(self, content: str) -> str:
        """Render checkbox lines (``- [ ]`` / ``- [x]``) as styled task items."""
        checkbox_pattern = re.compile(r"^\s*[-*]\s+\[([ xX])\]\s+(.*)$")
        items: List[str] = []
        other_lines: List[str] = []

        for line in content.split("\n"):
            match = checkbox_pattern.match(line)
            if match:
                checked = match.group(1).lower() == "x"
                text = match.group(2)
                css_class = "task-checkbox checked" if checked else "task-checkbox"
                items.append(
                    f'<div class="task-item"><span class="{css_class}"></span>'
                    f"<span>{self._escape_html(text)}</span></div>"
                )
            elif line.strip():
                other_lines.append(line)

        html_parts = []
        if other_lines:
            escaped = self._escape_html("\n".join(other_lines)).replace("\n", "<br>")
            html_parts.append(f"<p>{escaped}</p>")
        html_parts.extend(items)
        return "\n".join(html_parts)

    def _render_diagram_block(
        self, diagram_index: int, diagram: Dict[str, Any], rendered_diagrams: Dict[str, str]
    ) -> str:
        """Render a single diagram's image (or a placeholder if rendering failed)."""
        diagram_id = f"diagram-{diagram_index}"
        image_path = rendered_diagrams.get(diagram_id)
        title = diagram.get("title") or str(diagram.get("type", "Diagram")).replace("_", " ").title()
        section_ref = diagram.get("sectionRef", "")
        caption = f"{title} — {section_ref}" if section_ref else title

        if image_path:
            src = self._to_embeddable_uri(image_path)
            image_html = f'<img class="diagram-image" src="{src}" alt="{self._escape_html(title)}">'
        else:
            image_html = (
                '<div class="diagram-image" style="padding: 0.5in; color: #999;">'
                "Diagram unavailable</div>"
            )

        return (
            f'<div class="diagram-container">{image_html}'
            f'<div class="diagram-caption">{self._escape_html(caption)}</div></div>'
        )

    def _generate_glossary_html(self, glossary: List[Dict[str, Any]]) -> str:
        """Generate an alphabetized glossary appendix, cross-linkable from
        first occurrence in the document body."""
        if not glossary:
            return ""

        sorted_entries = sorted(glossary, key=lambda entry: entry.get("term", "").lower())
        items = []
        for entry in sorted_entries:
            term = entry.get("term", "")
            definition = entry.get("definition", "")
            anchor = self._glossary_anchor(term)
            items.append(
                f'<div class="glossary-term" id="{anchor}">'
                f'<div class="glossary-term-title">{self._escape_html(term)}</div>'
                f'<div class="glossary-term-definition">{self._render_inline_markdown(definition)}</div>'
                f"</div>"
            )

        return f"""<div class="glossary-section">
    <h2>Glossary</h2>
    {''.join(items)}
</div>"""

    def _generate_task_progress_summary(self, sections: List[Dict[str, Any]]) -> str:
        """Generate a completed/pending checklist count summary for task-type
        artifacts (Requirement 12.3)."""
        completed = 0
        pending = 0
        for section in sections:
            content = section.get("content", "")
            completed += len(re.findall(r"^\s*[-*]\s+\[[xX]\]", content, re.MULTILINE))
            pending += len(re.findall(r"^\s*[-*]\s+\[\s\]", content, re.MULTILINE))

        total = completed + pending
        if total == 0:
            return ""

        return f"""<div class="section-summary" style="page-break-after: avoid;">
    <strong>Task Progress:</strong> {completed} of {total} completed ({pending} pending)
</div>"""

    def _section_anchor(self, heading: str, fallback_index: int) -> str:
        """Build a stable HTML anchor id for a section heading."""
        return self._slugify(heading) or f"section-{fallback_index}"

    def _glossary_anchor(self, term: str) -> str:
        """Build a stable HTML anchor id for a glossary term."""
        return "glossary-" + (self._slugify(term) or "term")

    def _slugify(self, text: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")

    def _to_embeddable_uri(self, path: str) -> str:
        """Convert a filesystem path to a URI WeasyPrint can embed as an <img src>."""
        try:
            return Path(path).resolve().as_uri()
        except Exception:
            return path

    def _escape_html(self, text: Any) -> str:
        """HTML-escape arbitrary text for safe embedding."""
        return html_stdlib.escape(str(text), quote=True)

    def _render_markdown(self, text: str) -> str:
        """
        Convert AI-generated markdown-flavored text to HTML (headings,
        bold/italic, inline/fenced code, lists).

        The enrichment prompt documents section `content` as markdown, but
        this was previously only HTML-escaped and dumped as plain text, so
        any formatting the AI included (**bold**, `code`, even nested ##
        sub-headings) leaked through as literal characters in the rendered
        PDF instead of being interpreted - this is the actual fix.

        HTML-escapes the input BEFORE running the markdown parser, rather
        than trusting python-markdown's own raw-HTML passthrough: markdown
        syntax (**, `, #, -) doesn't involve angle brackets, so it's still
        recognized and converted normally, but any literal HTML the AI's
        output happens to contain - or that a prompt-injection attempt in
        the source document tries to smuggle through - renders as inert
        visible text (e.g. "&lt;script&gt;") instead of being interpreted
        as markup.

        Args:
            text: Raw markdown-flavored text

        Returns:
            HTML string (may contain block-level tags: <p>, <h1-6>, <ul>, <pre>)
        """
        if not text or not text.strip():
            return ""
        escaped = self._escape_html(text)
        return markdown_lib.markdown(escaped, extensions=["fenced_code", "tables", "nl2br"])

    def _render_inline_markdown(self, text: str) -> str:
        """
        Convert inline-only markdown (bold, inline code) to HTML, without
        the block-level <p>/<h1-6>/<ul> wrapping _render_markdown adds.

        Used for text that's placed directly inside an existing styled
        container (cover abstract, section summaries, glossary
        definitions) that was never a <p> itself - wrapping it in
        _render_markdown's own <p> there would add that tag's default
        margin as unwanted extra spacing. Same HTML-escape-first safety
        rationale as _render_markdown.

        Args:
            text: Raw markdown-flavored text (expected to be a single
                short passage, not multi-paragraph content)

        Returns:
            HTML string with no block-level wrapping
        """
        if not text:
            return ""
        escaped = self._escape_html(text)
        escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
        escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
        return escaped
