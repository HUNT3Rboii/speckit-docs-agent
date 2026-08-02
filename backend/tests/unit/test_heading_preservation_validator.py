"""
Regression tests for HeadingPreservationValidator: the document's own H1
title (e.g. "# Order Processing Service") must not be required to also
appear as a body section heading. The enriched JSON schema deliberately
keeps the title separate from `sections` - without extract_json_headings()
also considering `title`, that H1 has nothing to fuzzy-match against and
every real document fails validation on its own title line, regardless of
how faithfully everything else was preserved.
"""

from app.validators.fuzzy_match_service import FuzzyMatchService
from app.validators.heading_preservation_validator import HeadingPreservationValidator


def make_validator() -> HeadingPreservationValidator:
    return HeadingPreservationValidator(FuzzyMatchService())


SOURCE_MARKDOWN = """# Order Processing Service

## Overview

Some overview text.

## Architecture

Some architecture text.
"""


def make_enriched_json(title: str = "Order Processing Service") -> dict:
    return {
        "title": title,
        "abstract": "abstract",
        "sections": [
            {"heading": "Overview", "content": "...", "type": "normal", "level": 1},
            {"heading": "Architecture", "content": "...", "type": "normal", "level": 2},
        ],
    }


def test_document_title_heading_does_not_need_to_be_a_section_too():
    validator = make_validator()
    markdown_headings = validator.extract_markdown_headings(SOURCE_MARKDOWN)
    json_headings = validator.extract_json_headings(make_enriched_json())

    result = validator.validate_preservation(markdown_headings, json_headings)

    assert result.valid is True
    assert result.errors == []


def test_title_omitted_from_enriched_json_still_flags_the_title_heading_as_missing():
    """Confirms the fix is additive, not a blanket exemption for H1s: if the
    AI genuinely drops the title, that's still a real validation failure."""
    validator = make_validator()
    enriched = make_enriched_json()
    del enriched["title"]

    markdown_headings = validator.extract_markdown_headings(SOURCE_MARKDOWN)
    json_headings = validator.extract_json_headings(enriched)

    result = validator.validate_preservation(markdown_headings, json_headings)

    assert result.valid is False
    assert any("Order Processing Service" in err for err in result.errors)


def test_body_headings_still_required_even_when_title_matches():
    validator = make_validator()
    enriched = make_enriched_json()
    enriched["sections"] = enriched["sections"][:1]  # drop "Architecture"

    markdown_headings = validator.extract_markdown_headings(SOURCE_MARKDOWN)
    json_headings = validator.extract_json_headings(enriched)

    result = validator.validate_preservation(markdown_headings, json_headings)

    assert result.valid is False
    assert any("Architecture" in err for err in result.errors)


def test_extract_json_headings_appends_title_after_section_headings():
    validator = make_validator()
    headings = validator.extract_json_headings(make_enriched_json())
    assert headings == ["Overview", "Architecture", "Order Processing Service"]


def test_extract_json_headings_omits_title_when_absent():
    validator = make_validator()
    enriched = make_enriched_json()
    del enriched["title"]
    headings = validator.extract_json_headings(enriched)
    assert headings == ["Overview", "Architecture"]
