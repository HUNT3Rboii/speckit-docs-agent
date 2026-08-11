"""Section classification tests.

Typing sections is heuristic and always was: nobody labels their own spec, so
the rules read the shape of the content. What matters is that the obvious cases
are right and the ambiguous ones fall back to ordinary prose rather than
labelling something wrongly.
"""

from pdf.sections import (
    DESIGN_DECISION,
    NORMAL,
    TASK,
    USER_STORY,
    classify_section,
    split_sections,
    summaries_by_heading,
    summary_for,
)


class TestClassification:
    def test_checkboxes_make_a_task_section(self):
        assert classify_section("Work", "- [ ] Build it\n- [x] Ship it") == TASK

    def test_user_story_phrasing_is_recognised(self):
        assert (
            classify_section("Stories", "As a customer, I want an email so that I have proof of purchase.")
            == USER_STORY
        )

    def test_user_story_survives_different_punctuation(self):
        assert classify_section("Stories", "As an operator I want alerts") == USER_STORY

    def test_a_decision_heading_is_enough(self):
        assert classify_section("Design Decision: Event Bus", "We use a bus.") == DESIGN_DECISION

    def test_decision_language_in_the_body_counts(self):
        assert classify_section("Transport", "We chose the Event Bus rather than direct calls.") == DESIGN_DECISION

    def test_ordinary_prose_stays_ordinary(self):
        assert classify_section("Architecture", "The gateway forwards to the order service.") == NORMAL

    def test_checkboxes_win_over_a_decision_heading(self):
        # The more specific signal wins: a checklist under a "Decisions" heading
        # is still a checklist.
        assert classify_section("Decisions", "- [ ] Pick a queue") == TASK


class TestSplitting:
    DOC = """# Title

Intro prose.

## Architecture

The gateway forwards requests.

## Tasks

- [x] T001 Ship it

### Sub-heading

More detail.
"""

    def test_sections_split_at_headings(self):
        headings = [section.heading for section in split_sections(self.DOC)]
        assert headings == ["Title", "Architecture", "Tasks", "Sub-heading"]

    def test_levels_are_recorded(self):
        levels = {section.heading: section.level for section in split_sections(self.DOC)}
        assert levels["Title"] == 1
        assert levels["Sub-heading"] == 3

    def test_types_are_assigned_per_section(self):
        types = {section.heading: section.type for section in split_sections(self.DOC)}
        assert types["Tasks"] == TASK
        assert types["Architecture"] == NORMAL

    def test_headings_inside_a_code_fence_are_not_headings(self):
        # Otherwise a shell example splits the document at its comments.
        document = "# Real\n\n```bash\n# not a heading\necho hi\n```\n\n## Also real\n"
        assert [section.heading for section in split_sections(document)] == ["Real", "Also real"]

    def test_a_document_with_no_headings_has_no_sections(self):
        assert split_sections("Just prose, no headings.") == []


class TestSummaries:
    def test_lookup_ignores_punctuation_and_case(self):
        # The model is asked to key summaries by heading text and will not
        # reproduce punctuation exactly.
        indexed = summaries_by_heading({"Request Flow:": "How an order moves."})
        assert summary_for("request flow", indexed) == "How an order moves."

    def test_blank_summaries_are_dropped(self):
        assert summaries_by_heading({"A": "   "}) == {}

    def test_missing_heading_returns_nothing(self):
        assert summary_for("Nothing", summaries_by_heading({"A": "b"})) is None
