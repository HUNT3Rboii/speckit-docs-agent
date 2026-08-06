"""
Unit tests for HTMLGeneratorService.

Covers the methods that generate_html() depends on (cover page, table of
contents, section rendering by type, diagram embedding, glossary linking) —
previously undefined, causing generate_html() to raise AttributeError.
"""

import pytest

from app.services.html_generator import HTMLGeneratorService


@pytest.fixture
def generator():
    return HTMLGeneratorService()


@pytest.fixture
def sample_enriched_json():
    return {
        "title": "Sample Document",
        "abstract": "A short abstract.",
        "sections": [
            {
                "heading": "Overview",
                "content": "This document describes the system.",
                "type": "normal",
                "level": 1,
            },
            {
                "heading": "Architecture",
                "content": "The API talks to the Database.",
                "type": "design_decision",
                "level": 2,
            },
            {
                "heading": "Tasks",
                "content": "- [x] Write spec\n- [ ] Implement feature",
                "type": "task",
                "level": 2,
            },
        ],
        "diagrams": [
            {
                "type": "architecture",
                "mermaidCode": "graph LR\n  A-->B",
                "sectionRef": "Architecture",
                "location": "after-section-2",
                "components": [{"name": "API", "evidence": "The API talks to the Database."}],
                "title": "System Architecture",
            }
        ],
        "glossary": [
            {
                "term": "API",
                "definition": "Application Programming Interface.",
                "evidence": "The API talks to the Database.",
            }
        ],
        "summaries": {"executiveSummary": "This is the executive summary."},
    }


class TestGenerateHtml:
    def test_generate_html_does_not_raise(self, generator, sample_enriched_json):
        html = generator.generate_html(
            sample_enriched_json,
            rendered_diagrams={"diagram-0": None},
            artifact_type="document",
            source_path="docs/sample.md",
            commit_hash="abc123",
        )
        assert "<!DOCTYPE html>" in html

    def test_title_is_escaped_and_present(self, generator, sample_enriched_json):
        sample_enriched_json["title"] = "<script>alert(1)</script>"
        html = generator.generate_html(sample_enriched_json, {})
        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_executive_summary_appears_on_cover_page(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert "This is the executive summary." in html

    def test_task_progress_summary_for_task_artifact(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {}, artifact_type="task")
        assert "Task Progress" in html
        assert "1 of 2 completed" in html

    def test_no_task_progress_summary_for_non_task_artifact(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {}, artifact_type="document")
        assert "Task Progress" not in html


class TestMarkdownRendering:
    """
    Regression coverage for a real live-testing report: running the
    pipeline on a formatting-heavy document (CLAUDE.md, with lots of ##
    sub-headings and **bold** labels) produced a PDF with literal "##" and
    "**" characters visible in the body text. Root cause: _render_section_body
    only ever HTML-escaped `content` and dumped it as plain text inside a
    <p> tag - it never actually interpreted the markdown syntax the AI was
    told (via the enrichment prompt's schema comment) that `content` would
    contain.
    """

    def test_bold_syntax_is_rendered_not_left_literal(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][0]["content"] = "This is **important** text."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<strong>important</strong>" in html
        assert "**important**" not in html

    def test_nested_heading_syntax_is_rendered_not_left_literal(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][0]["content"] = "## Technology Stack\n\nSome details here."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<h2>Technology Stack</h2>" in html
        assert "## Technology Stack" not in html

    def test_inline_code_syntax_is_rendered_not_left_literal(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][0]["content"] = "Set the `DEBUG` flag to true."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<code>DEBUG</code>" in html
        assert "`DEBUG`" not in html

    def test_bullet_list_syntax_is_rendered_as_list(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][0]["content"] = "- **Frontend**: React\n- **Backend**: FastAPI"
        html = generator.generate_html(sample_enriched_json, {})

        assert "<ul>" in html
        assert "<li>" in html
        assert "<strong>Frontend</strong>" in html

    def test_fenced_code_block_is_rendered_as_pre_code(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][0]["content"] = "Run this:\n\n```bash\nnpm install\n```"
        html = generator.generate_html(sample_enriched_json, {})

        assert "<pre>" in html
        assert "npm install" in html

    def test_embedded_script_tag_in_content_stays_inert(self, generator, sample_enriched_json):
        """A prompt-injection attempt (or the AI accidentally including raw
        HTML) must render as visible inert text, not be interpreted as
        markup - see _render_markdown's docstring for why HTML-escaping
        happens BEFORE markdown parsing rather than trusting python-markdown's
        own raw-HTML handling."""
        sample_enriched_json["sections"][0]["content"] = "Normal text <script>alert(1)</script> more text."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<script>alert(1)</script>" not in html
        assert "&lt;script&gt;" in html

    def test_executive_summary_bold_is_rendered(self, generator, sample_enriched_json):
        sample_enriched_json["summaries"]["executiveSummary"] = "This uses **event sourcing**."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<strong>event sourcing</strong>" in html

    def test_glossary_definition_inline_code_is_rendered(self, generator, sample_enriched_json):
        sample_enriched_json["glossary"][0]["definition"] = "A call to `authenticate()`."
        html = generator.generate_html(sample_enriched_json, {})

        assert "<code>authenticate()</code>" in html


class TestGenerateCoverPage:
    def test_includes_title_summary_and_metadata(self, generator):
        html = generator.generate_cover_page(
            "My Title", "My summary", {"type": "spec", "source": "a.md", "commit": "abc", "generated": "now"}
        )
        assert "My Title" in html
        assert "My summary" in html
        assert "a.md" in html
        # "commit" is deliberately no longer rendered on the cover page -
        # passing it in metadata (as older callers still may) must not
        # raise, but it should simply be dropped, not displayed.
        assert "abc" not in html

    def test_includes_project_framework_and_model_when_provided(self, generator):
        html = generator.generate_cover_page(
            "My Title",
            "My summary",
            {
                "project": "speckit-docs-agent",
                "framework": "speckit",
                "model": "GitHub Copilot Chat — Claude Sonnet 5",
                "type": "spec",
                "source": "a.md",
                "commit": "abc",
                "generated": "now",
            },
        )
        assert "speckit-docs-agent" in html
        assert "speckit" in html
        assert "GitHub Copilot Chat — Claude Sonnet 5" in html

    def test_omits_project_framework_and_model_when_absent(self, generator):
        """Backward compatible: legacy callers that don't pass these keys
        (or pass None, as agentic_pipeline_service.process() does for the
        old-style /api/artifacts/ingest-* path) get no empty rows."""
        html = generator.generate_cover_page(
            "My Title", "My summary", {"type": "spec", "source": "a.md", "commit": "abc", "generated": "now"}
        )
        assert "Project:" not in html
        assert "Authored With:" not in html
        assert "Enriched By:" not in html

    def test_none_values_are_omitted_not_rendered_as_none_string(self, generator):
        html = generator.generate_cover_page(
            "My Title",
            "My summary",
            {
                "project": None,
                "framework": None,
                "model": None,
                "type": "spec",
                "source": "a.md",
                "commit": "abc",
                "generated": "now",
            },
        )
        assert "None" not in html


class TestGenerateHtmlProvenanceFields:
    def test_project_and_model_flow_through_generate_html(self, generator, sample_enriched_json):
        html = generator.generate_html(
            sample_enriched_json,
            {},
            project_root="speckit-docs-agent",
            authoring_framework="claude-code",
            model_used="Anthropic — Claude Sonnet 5",
        )
        assert "speckit-docs-agent" in html
        assert "Anthropic — Claude Sonnet 5" in html
        # "Authored With" (the framework label) is deliberately no longer
        # rendered on the cover page - passing authoring_framework (as
        # older callers still may) must not raise, but it should simply be
        # dropped, not displayed.
        assert "claude-code" not in html

    def test_generate_html_still_works_without_provenance_fields(self, generator, sample_enriched_json):
        """Existing callers (and the legacy pipeline) don't pass these -
        must not raise and must not print literal "None"."""
        html = generator.generate_html(sample_enriched_json, {})
        assert "<!DOCTYPE html>" in html
        assert "None" not in html


class TestGenerateTableOfContents:
    def test_includes_levels_1_to_3_only(self, generator):
        sections = [
            {"heading": "Top", "level": 1},
            {"heading": "Mid", "level": 3},
            {"heading": "Deep", "level": 4},
        ]
        toc = generator.generate_table_of_contents(sections)
        assert "Top" in toc
        assert "Mid" in toc
        assert "Deep" not in toc

    def test_links_point_to_section_anchors(self, generator):
        sections = [{"heading": "My Section", "level": 1}]
        toc = generator.generate_table_of_contents(sections)
        assert 'href="#my-section"' in toc


class TestSectionRenderingByType:
    def test_task_section_renders_checkboxes(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert "task-checkbox checked" in html
        assert "Write spec" in html
        assert "Implement feature" in html

    def test_checked_task_renders_a_green_checkmark_not_a_blue_fill(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        # A checked item gets an actual checkmark glyph inside its span,
        # not just an empty box styled with a solid blue background.
        assert '<span class="task-checkbox checked">✓</span>' in html
        assert "background-color: #0066cc" not in html

    def test_unchecked_task_renders_an_empty_box(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert '<span class="task-checkbox"></span>' in html

    def test_design_decision_section_uses_callout_wrapper(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert "section-design-decision" in html


class TestTaskChecklistRendering:
    """
    Regression coverage for a live-testing report: real spec-kit tasks.md
    files (see this project's own .kiro/specs/**/tasks.md) use a three-state
    checkbox convention - [ ] pending, [x] done, [~] in-progress/checkpoint -
    and interleave each task with its own indented detail bullets and a
    trailing "_Requirements: ..._" line. The previous implementation only
    recognized [ ]/[x] (so every [~] line rendered as raw, unstyled bracket
    text) and bucketed ALL non-checkbox lines from the whole section into
    one block rendered before ALL checkbox items, scrambling every task's
    detail bullets away from the task they belonged to.
    """

    def test_in_progress_checkbox_gets_its_own_style_not_raw_brackets(self, generator):
        html = generator._render_task_checklist("- [~] 5. Checkpoint - verify infra")
        assert '<span class="task-checkbox in-progress">–</span>' in html
        assert "Checkpoint - verify infra" in html
        # Must not fall through to raw, unstyled bracket text.
        assert "[~]" not in html

    def test_checkbox_items_and_detail_bullets_stay_in_original_order(self, generator):
        content = (
            "- [x] 1. Initialize project\n"
            "  - Create Vite project with React\n"
            "  - Install dependencies\n"
            "- [ ] 2. Implement API client\n"
            "  - Define TypeScript interfaces\n"
        )
        html = generator._render_task_checklist(content)

        # Each task's own detail bullets must appear after that task's own
        # checkbox item, not merged into one block before every checkbox.
        task1_pos = html.index("Initialize project")
        detail1_pos = html.index("Create Vite project")
        task2_pos = html.index("Implement API client")
        detail2_pos = html.index("Define TypeScript interfaces")

        assert task1_pos < detail1_pos < task2_pos < detail2_pos

    def test_detail_bullets_render_as_a_real_list_not_escaped_brackets(self, generator):
        content = "- [x] 1. Initialize project\n  - Create Vite project\n  - Install dependencies\n"
        html = generator._render_task_checklist(content)
        assert "<li>" in html
        assert "Create Vite project" in html

    def test_requirements_annotation_renders_with_italics(self, generator):
        content = "- [x] 1. Initialize project\n  _Requirements: 13.1, 13.2_\n"
        html = generator._render_task_checklist(content)
        assert "<em>Requirements: 13.1, 13.2</em>" in html

    def test_full_pipeline_with_realistic_spec_kit_task_content(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][2]["content"] = (
            "- [x] 1. Initialize project structure\n"
            "  - Create Vite project with React and TypeScript template\n"
            "  - Configure TypeScript with strict mode enabled\n"
            "  _Requirements: 13.1, 13.2_\n"
            "\n"
            "- [~] 2. Checkpoint - Ensure core infrastructure is complete\n"
            "  - Ensure all tests pass, ask the user if questions arise.\n"
            "\n"
            "- [ ] 3. Implement ArtifactListView\n"
        )
        html = generator.generate_html(sample_enriched_json, {})
        assert '<span class="task-checkbox checked">✓</span>' in html
        assert '<span class="task-checkbox in-progress">–</span>' in html
        assert '<span class="task-checkbox"></span>' in html
        assert "[~]" not in html
        assert "Create Vite project with React and TypeScript template" in html

    def test_progress_summary_counts_in_progress_tasks(self, generator, sample_enriched_json):
        sample_enriched_json["sections"][2]["content"] = "- [x] Done\n- [~] Doing\n- [ ] Todo\n"
        html = generator.generate_html(sample_enriched_json, {}, artifact_type="task")
        assert "Task Progress" in html
        assert "1 of 3 completed" in html
        assert "1 in progress" in html
        assert "1 pending" in html


class TestDiagramEmbedding:
    def test_diagram_embedded_after_referenced_section(self, generator, sample_enriched_json):
        html = generator.generate_html(
            sample_enriched_json, rendered_diagrams={"diagram-0": "/tmp/does-not-matter.png"}
        )
        # Use the section anchor (body heading) and the diagram's own title in
        # its caption, rather than bare substrings that also appear in <style>.
        arch_section_pos = html.find('id="architecture"')
        diagram_caption_pos = html.find("System Architecture")
        assert arch_section_pos != -1 and diagram_caption_pos != -1
        assert diagram_caption_pos > arch_section_pos

    def test_missing_render_shows_placeholder(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, rendered_diagrams={})
        assert "Diagram unavailable" in html


class TestGlossaryLinking:
    def test_glossary_appendix_present_and_alphabetized(self, generator):
        enriched = {
            "title": "T",
            "abstract": "A",
            "sections": [],
            "diagrams": [],
            "glossary": [
                {"term": "Zebra", "definition": "An animal.", "evidence": "zebra"},
                {"term": "Apple", "definition": "A fruit.", "evidence": "apple"},
            ],
            "summaries": {"executiveSummary": "S"},
        }
        html = generator.generate_html(enriched, {})
        assert html.index("Apple") < html.index("Zebra")

    def test_first_occurrence_of_term_is_linked(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert 'href="#glossary-api"' in html
