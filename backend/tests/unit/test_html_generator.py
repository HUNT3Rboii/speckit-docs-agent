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


class TestGenerateCoverPage:
    def test_includes_title_summary_and_metadata(self, generator):
        html = generator.generate_cover_page(
            "My Title", "My summary", {"type": "spec", "source": "a.md", "commit": "abc", "generated": "now"}
        )
        assert "My Title" in html
        assert "My summary" in html
        assert "a.md" in html
        assert "abc" in html


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

    def test_design_decision_section_uses_callout_wrapper(self, generator, sample_enriched_json):
        html = generator.generate_html(sample_enriched_json, {})
        assert "section-design-decision" in html


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
