"""
Unit tests for RetryLoopOrchestrator, including the public wrapper methods
(run_validators, is_fully_valid, collect_warnings) added so an HTTP endpoint
can drive validation/retry across separate requests instead of relying on a
synchronous ai_session_callback.
"""

import pytest

from app.validators.retry_loop_orchestrator import RetryLoopOrchestrator, StructuredError


SOURCE_MARKDOWN = """# Overview

The Auth Service validates user credentials against the database and issues JWT tokens upon successful login.

## Architecture

The system uses a PostgreSQL database to store user records.
"""


def make_valid_enriched_json():
    return {
        "title": "Auth Doc",
        "abstract": "Describes authentication.",
        "sections": [
            {"heading": "Overview", "content": "Overview content.", "type": "normal", "level": 1},
            {"heading": "Architecture", "content": "Architecture content.", "type": "design_decision", "level": 2},
        ],
        "diagrams": [
            {
                "type": "architecture",
                "mermaidCode": "graph LR\n  A-->B",
                "sectionRef": "Architecture",
                "location": "after-section-2",
                "components": [
                    {
                        "name": "Auth Service",
                        "evidence": "The Auth Service validates user credentials against the database and issues JWT tokens upon successful login.",
                    }
                ],
            }
        ],
        "glossary": [
            {
                "term": "JWT",
                "definition": "JSON Web Token.",
                "evidence": "issues JWT tokens upon successful login",
            }
        ],
        "summaries": {"executiveSummary": "This document describes the authentication system."},
    }


@pytest.fixture
def orchestrator():
    return RetryLoopOrchestrator(max_retries=2, fuzzy_threshold=0.85)


class TestPublicWrappers:
    def test_run_validators_returns_all_four_categories(self, orchestrator):
        results = orchestrator.run_validators(make_valid_enriched_json(), SOURCE_MARKDOWN)
        assert set(results.keys()) == {"schema", "headings", "diagrams", "glossary"}

    def test_is_fully_valid_true_for_valid_document(self, orchestrator):
        results = orchestrator.run_validators(make_valid_enriched_json(), SOURCE_MARKDOWN)
        assert orchestrator.is_fully_valid(results) is True

    def test_is_fully_valid_false_for_ungrounded_diagram(self, orchestrator):
        enriched = make_valid_enriched_json()
        enriched["diagrams"][0]["components"][0]["evidence"] = "this text does not appear anywhere in source"
        results = orchestrator.run_validators(enriched, SOURCE_MARKDOWN)
        assert orchestrator.is_fully_valid(results) is False

    def test_collect_warnings_is_a_list(self, orchestrator):
        results = orchestrator.run_validators(make_valid_enriched_json(), SOURCE_MARKDOWN)
        warnings = orchestrator.collect_warnings(results)
        assert isinstance(warnings, list)


class TestGracefulDegradation:
    def test_proceed_with_validated_drops_only_ungrounded_diagram(self, orchestrator):
        enriched = make_valid_enriched_json()
        enriched["diagrams"][0]["components"][0]["evidence"] = "this text does not appear anywhere in source"

        validated = orchestrator.proceed_with_validated(enriched, SOURCE_MARKDOWN)

        assert validated.enriched_json["diagrams"] == []
        assert len(validated.dropped_items["diagrams"]) == 1
        # Glossary and sections untouched since only the diagram failed.
        assert len(validated.enriched_json["glossary"]) == 1

    def test_build_structured_error_names_ungrounded_component(self, orchestrator):
        enriched = make_valid_enriched_json()
        enriched["diagrams"][0]["components"][0]["evidence"] = "this text does not appear anywhere in source"
        results = orchestrator.run_validators(enriched, SOURCE_MARKDOWN)

        error = orchestrator.build_structured_error(results, retry_count=1)

        assert isinstance(error, StructuredError)
        assert error.valid is False
        assert "ungrounded_diagrams" in error.errors
        assert any("Auth Service" in msg for msg in error.errors["ungrounded_diagrams"])


class TestRetryLoopWithCallback:
    def test_callback_corrects_and_succeeds_on_retry(self, orchestrator):
        enriched = make_valid_enriched_json()
        broken_evidence = enriched["diagrams"][0]["components"][0]["evidence"]
        enriched["diagrams"][0]["components"][0]["evidence"] = "this text does not appear anywhere in source"

        def fix_it(structured_error):
            fixed = make_valid_enriched_json()
            fixed["diagrams"][0]["components"][0]["evidence"] = broken_evidence
            return fixed

        result = orchestrator.validate_with_retry(enriched, SOURCE_MARKDOWN, ai_session_callback=fix_it)

        assert result.dropped_items == {}
        assert len(result.enriched_json["diagrams"]) == 1

    def test_no_callback_proceeds_with_validated_immediately(self, orchestrator):
        enriched = make_valid_enriched_json()
        enriched["diagrams"][0]["components"][0]["evidence"] = "this text does not appear anywhere in source"

        result = orchestrator.validate_with_retry(enriched, SOURCE_MARKDOWN, ai_session_callback=None)

        assert result.dropped_items.get("diagrams") == ["architecture"]
