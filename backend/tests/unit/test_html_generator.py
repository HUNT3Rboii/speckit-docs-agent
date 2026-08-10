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
        # The checkmark is drawn by a CSS ::after pseudo-element keyed off
        # this class, not a Unicode glyph in the span's own text (WeasyPrint
        # frequently has no glyph for symbol characters like "✓", rendering
        # a "tofu" placeholder box instead) - so the span itself stays
        # empty, and it's not just an empty box with a solid blue background.
        assert '<span class="task-checkbox checked"></span>' in html
        assert "background-color: #0066cc" not in html
        assert "border-right: 2px solid #22863a" in html

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
        assert '<span class="task-checkbox in-progress"></span>' in html
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
        assert '<span class="task-checkbox checked"></span>' in html
        assert '<span class="task-checkbox in-progress"></span>' in html
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

    def test_checkbox_spans_never_carry_a_unicode_glyph(self, generator):
        """Regression coverage for a live-testing report showing checkboxes
        as garbled "tofu" placeholder boxes in the actual PDF: WeasyPrint's
        font fallback frequently has no glyph for symbol characters like
        "✓"/"–", even though they render fine in a browser preview. The
        checkmark/dash must be drawn entirely by CSS (border/background on
        a ::after pseudo-element), so the span itself is always empty
        regardless of state."""
        content = "- [x] Done\n- [~] Doing\n- [ ] Todo\n"
        html = generator._render_task_checklist(content)
        assert "✓" not in html
        assert "–" not in html
        assert html.count('<span class="task-checkbox') == 3
        assert '<span class="task-checkbox checked"></span>' in html
        assert '<span class="task-checkbox in-progress"></span>' in html
        assert '<span class="task-checkbox"></span>' in html

    def test_checkbox_box_does_not_use_flexbox_centering(self, generator, sample_enriched_json):
        """WeasyPrint's flexbox support is a known trouble spot for a tiny
        fixed-size inline-flex box - combined with the glyph issue above,
        this produced a visibly broken (oversized/garbled) checkbox. The
        box must be sized by plain box-model rules instead."""
        html = generator.generate_html(sample_enriched_json, {})
        assert ".task-checkbox {" in html
        checkbox_rule = html.split(".task-checkbox {", 1)[1].split("}", 1)[0]
        assert "inline-flex" not in checkbox_rule


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


class TestDiagramPlacementResolution:
    """sectionRef names a section; location counts them. When they disagree,
    the name wins - see resolve_diagram_placements."""

    SECTIONS = [
        {"heading": "Overview", "content": "Intro."},
        {"heading": "\U0001F3D7️ Architecture", "content": "How it fits together."},
        {"heading": "Data Flow", "content": "How data moves."},
        {"heading": "Troubleshooting", "content": "When it breaks."},
    ]

    def test_section_ref_wins_over_a_wrong_location_index(self, generator):
        # The real failure: the AI labelled the diagram "Architecture" (section 2)
        # but numbered it after section 4, so it rendered under Troubleshooting.
        diagrams = [{"sectionRef": "Architecture", "location": "after-section-4"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {2: [0]}

    def test_section_ref_matches_through_an_emoji_decorated_heading(self, generator):
        diagrams = [{"sectionRef": "architecture", "location": "after-section-1"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {2: [0]}

    def test_falls_back_to_location_when_section_ref_names_nothing(self, generator):
        diagrams = [{"sectionRef": "Nonexistent Section", "location": "after-section-3"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {3: [0]}

    def test_falls_back_to_location_when_section_ref_is_absent(self, generator):
        diagrams = [{"location": "after-section-3"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {3: [0]}

    def test_out_of_range_location_lands_after_the_last_section(self, generator):
        diagrams = [{"location": "after-section-99"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {4: [0]}

    def test_diagram_with_neither_reference_still_gets_placed(self, generator):
        # Better last than nowhere: an unplaceable diagram used to vanish.
        diagrams = [{"mermaidCode": "graph LR\n A-->B"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {4: [0]}

    def test_inline_diagrams_are_left_to_the_section_body(self, generator):
        diagrams = [{"sectionRef": "Architecture", "location": "inline-section-2-paragraph-1"}]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {}

    def test_duplicate_headings_resolve_to_the_first_occurrence(self, generator):
        sections = [
            {"heading": "Overview", "content": "First."},
            {"heading": "Details", "content": "Body."},
            {"heading": "Overview", "content": "Second."},
        ]
        diagrams = [{"sectionRef": "Overview", "location": "after-section-2"}]

        placements = generator.resolve_diagram_placements(sections, diagrams)

        assert placements == {1: [0]}

    def test_several_diagrams_on_one_section_keep_document_order(self, generator):
        diagrams = [
            {"sectionRef": "Data Flow", "location": "after-section-1"},
            {"sectionRef": "Data Flow", "location": "after-section-4"},
        ]

        placements = generator.resolve_diagram_placements(self.SECTIONS, diagrams)

        assert placements == {3: [0, 1]}

    def test_renders_under_the_named_heading_end_to_end(self, generator):
        enriched = {
            "title": "T",
            "abstract": "A",
            "sections": self.SECTIONS,
            "diagrams": [
                {
                    "type": "architecture",
                    "title": "System Layout",
                    "sectionRef": "Architecture",
                    "location": "after-section-4",
                    "mermaidCode": "graph LR\n A-->B",
                    "components": [],
                }
            ],
            "glossary": [],
        }

        html = generator.generate_html(
            enriched, rendered_diagrams={"diagram-0": "/tmp/does-not-matter.png"}
        )

        arch_pos = html.find('id="architecture"')
        troubleshooting_pos = html.find('id="troubleshooting"')
        caption_pos = html.find("System Layout")
        assert arch_pos != -1 and troubleshooting_pos != -1 and caption_pos != -1
        assert arch_pos < caption_pos < troubleshooting_pos


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


class TestParentHeadingSections:
    """A section holding only a heading (a parent like "## Architecture"
    whose text all lives in its subsections) must share a box with what
    follows it. On its own it is a <section> with "page-break-inside:
    avoid", so a tall next section moves to the next page and strands the
    heading on an almost-blank one - observed as "Architecture" alone on
    page 19 of a real README."""

    @staticmethod
    def _enriched(sections, diagrams=None):
        return {
            "title": "T",
            "abstract": "A",
            "sections": sections,
            "diagrams": diagrams or [],
            "glossary": [],
            "summaries": {"executiveSummary": "S"},
        }

    def test_heading_only_section_shares_a_box_with_the_next_section(self, generator):
        html = generator.generate_html(
            self._enriched(
                [
                    {"heading": "Architecture", "content": "", "type": "design_decision", "level": 2},
                    {"heading": "System Overview", "content": "The API talks to the DB.", "type": "normal", "level": 3},
                ]
            ),
            {},
        )

        assert '<section class="section-group">' in html
        # One box, heading first, subsection second - not two sections that
        # a page break can come between.
        group = html.split('<section class="section-group">')[1].split("</section>")[0]
        assert group.index("Architecture") < group.index("System Overview")
        assert '<section class="section-design-decision"><h2 id="architecture">Architecture</h2></section>' not in html

    def test_consecutive_heading_only_sections_all_join_the_next_one(self, generator):
        html = generator.generate_html(
            self._enriched(
                [
                    {"heading": "Architecture", "content": "", "type": "normal", "level": 2},
                    {"heading": "Internals", "content": "", "type": "normal", "level": 3},
                    {"heading": "Detail", "content": "Real content here.", "type": "normal", "level": 4},
                ]
            ),
            {},
        )

        group = html.split('<section class="section-group">')[1].split("</section>")[0]
        assert group.index("Architecture") < group.index("Internals") < group.index("Detail")

    def test_section_with_its_own_diagram_is_not_treated_as_heading_only(self, generator):
        # The diagram is that section's content, and merging would put it
        # above the heading it belongs to. Asserted against the sections
        # fragment, since the table of contents repeats every heading.
        diagrams = [
            {
                "type": "architecture",
                "mermaidCode": "graph TD; A-->B;",
                "sectionRef": "Architecture",
                "location": "after-section-1",
                "components": [],
                "title": "Arch",
            }
        ]
        content = generator._generate_sections_html(
            [
                {"heading": "Architecture", "content": "", "type": "normal", "level": 2},
                {"heading": "Next", "content": "Body.", "type": "normal", "level": 3},
            ],
            [],
            {"diagram-0": "/nonexistent.png"},
            {},
            diagrams,
        )

        assert '<section class="section-group">' not in content
        assert content.index("Architecture</h2>") < content.index("diagram-container")

    def test_a_trailing_heading_only_section_still_renders(self, generator):
        html = generator.generate_html(
            self._enriched(
                [
                    {"heading": "Body", "content": "Something.", "type": "normal", "level": 2},
                    {"heading": "Appendix", "content": "", "type": "normal", "level": 2},
                ]
            ),
            {},
        )

        assert "Appendix" in html

    def test_diagram_placement_after_a_merged_section_is_unchanged(self, generator):
        # The merged-away section leaves a placeholder so "after-section-N"
        # keeps pointing at the section the author numbered.
        diagrams = [
            {
                "type": "flowchart",
                "mermaidCode": "graph TD; A-->B;",
                "sectionRef": "Detail",
                "location": "after-section-2",
                "components": [],
                "title": "Flow",
            }
        ]
        content = generator._generate_sections_html(
            [
                {"heading": "Parent", "content": "", "type": "normal", "level": 2},
                {"heading": "Detail", "content": "Body.", "type": "normal", "level": 3},
                {"heading": "After", "content": "Later body.", "type": "normal", "level": 3},
            ],
            [],
            {"diagram-0": "/nonexistent.png"},
            {},
            diagrams,
        )

        assert content.index("Detail") < content.index("Flow") < content.index("After")
