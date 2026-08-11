"""Evidence and enrichment tests.

This layer decides what a reader sees. A false negative loses something the
author wrote; a false positive prints something the model invented. The second
is worse, so the cases below lean on fabrication being rejected even when it is
plausible and well-formed.
"""

import pytest

from validation import EnrichmentValidator, EvidenceMatcher, missing_headings, normalize

SOURCE = """
# Order Processing Service

The Storefront sends order requests to the API Gateway, which authenticates the
request and forwards it to the Order Service. The Order Service validates the
request and publishes an OrderCreated event to the Event Bus.

The system relies on idempotent request handling: replaying the same
OrderCreated event must never charge a customer twice, achieved via a unique
idempotency_key stored per event.
"""


@pytest.fixture
def matcher():
    return EvidenceMatcher()


class TestNormalisation:
    def test_case_and_punctuation_are_irrelevant(self):
        assert normalize("The API Gateway, authenticated!") == "the api gateway authenticated"

    def test_whitespace_collapses(self):
        assert normalize("a\n\n  b\tc") == "a b c"


class TestEvidenceMatching:
    def test_verbatim_quote_is_grounded(self, matcher):
        assert matcher.is_grounded("publishes an OrderCreated event to the Event Bus", SOURCE)

    def test_quote_differing_only_in_punctuation_and_case(self, matcher):
        # Models retype quotes and change punctuation; that is not fabrication.
        assert matcher.is_grounded("PUBLISHES AN ORDERCREATED EVENT -- to the Event Bus!", SOURCE)

    def test_quote_spanning_a_line_wrap(self, matcher):
        # The source wraps mid-sentence; the quote does not.
        assert matcher.is_grounded("which authenticates the request and forwards it", SOURCE)

    def test_excerpt_with_a_dropped_clause_is_still_grounded(self, matcher):
        # A genuine citation that skips a clause from the middle. The surviving
        # pieces still align in order.
        assert matcher.is_grounded("replaying the same OrderCreated event must never charge a customer", SOURCE)

    def test_fabricated_claim_is_rejected(self, matcher):
        assert not matcher.is_grounded("The Order Service encrypts every payload with AES-256", SOURCE)

    def test_plausible_but_absent_claim_is_rejected(self, matcher):
        # Reads like the document and shares its vocabulary, but says something
        # the document never says. This is the case that matters.
        assert not matcher.is_grounded("The API Gateway retries failed requests three times", SOURCE)

    def test_empty_inputs_are_not_grounded(self, matcher):
        assert not matcher.is_grounded("", SOURCE)
        assert not matcher.is_grounded("anything", "")

    def test_score_is_bounded(self, matcher):
        assert matcher.score("the api gateway", SOURCE) <= 1.0
        assert matcher.score("nothing like this text at all zzz", SOURCE) >= 0.0


class TestGlossaryValidation:
    def validate(self, glossary):
        return EnrichmentValidator().validate(SOURCE, {"glossary": glossary})

    def test_grounded_entry_survives(self):
        result = self.validate(
            [
                {
                    "term": "idempotent",
                    "definition": "Replaying a request has the same effect as sending it once.",
                    "evidence": "replaying the same OrderCreated event must never charge a customer twice",
                }
            ]
        )
        assert [entry["term"] for entry in result.glossary] == ["idempotent"]
        assert result.dropped == []

    def test_entry_whose_quote_is_invented_is_dropped(self):
        result = self.validate(
            [
                {
                    "term": "idempotent",
                    "definition": "Safe to retry.",
                    "evidence": "the service guarantees exactly-once delivery",
                }
            ]
        )
        assert result.glossary == []
        assert result.dropped[0].reason == "the supporting quote is not in the document"

    def test_term_absent_from_the_document_is_dropped(self):
        # Correct definition, wrong document.
        result = self.validate(
            [{"term": "Kubernetes", "definition": "A container orchestrator.", "evidence": "the Order Service"}]
        )
        assert result.glossary == []
        assert "does not appear" in result.dropped[0].reason

    def test_entry_without_evidence_is_dropped(self):
        result = self.validate([{"term": "Event Bus", "definition": "A message broker."}])
        assert result.glossary == []
        assert "no supporting quote" in result.dropped[0].reason

    def test_incomplete_entry_is_dropped(self):
        result = self.validate([{"term": "Event Bus"}])
        assert result.glossary == []
        assert "missing a term or definition" in result.dropped[0].reason

    def test_duplicate_terms_are_collapsed(self):
        entry = {
            "term": "Event Bus",
            "definition": "A message broker.",
            "evidence": "publishes an OrderCreated event to the Event Bus",
        }
        result = self.validate([entry, dict(entry)])
        assert len(result.glossary) == 1

    def test_entries_are_alphabetical(self):
        evidence = "publishes an OrderCreated event to the Event Bus"
        result = self.validate(
            [
                {"term": "Order Service", "definition": "x", "evidence": evidence},
                {"term": "Event Bus", "definition": "y", "evidence": evidence},
            ]
        )
        assert [entry["term"] for entry in result.glossary] == ["Event Bus", "Order Service"]


class TestDiagramValidation:
    def validate(self, diagrams):
        return EnrichmentValidator().validate(SOURCE, {"diagrams": diagrams})

    def test_grounded_components_survive(self):
        result = self.validate(
            [
                {
                    "id": "d1",
                    "mermaid": "graph TD\nA --> B",
                    "components": [
                        {"name": "API Gateway", "evidence": "sends order requests to the API Gateway"},
                        {"name": "Order Service", "evidence": "forwards it to the Order Service"},
                    ],
                }
            ]
        )
        assert result.diagrams[0]["components"] == ["API Gateway", "Order Service"]
        assert result.dropped == []

    def test_invented_component_is_removed_but_the_diagram_survives(self):
        result = self.validate(
            [
                {
                    "id": "d1",
                    "mermaid": "graph TD\nA --> B",
                    "components": [
                        {"name": "API Gateway", "evidence": "sends order requests to the API Gateway"},
                        {"name": "Redis Cache", "evidence": "results are cached in Redis for one hour"},
                    ],
                }
            ]
        )
        assert result.diagrams[0]["components"] == ["API Gateway"]
        assert any(item.kind == "component" and "Redis Cache" in item.label for item in result.dropped)

    def test_diagram_with_no_grounded_components_is_dropped(self):
        # A picture of something that is not in the document.
        result = self.validate(
            [
                {
                    "id": "d1",
                    "mermaid": "graph TD\nA --> B",
                    "components": [{"name": "Redis", "evidence": "cached in Redis"}],
                }
            ]
        )
        assert result.diagrams == []
        assert any(item.kind == "diagram" for item in result.dropped)

    def test_diagram_without_mermaid_source_is_dropped(self):
        result = self.validate([{"id": "d1", "components": []}])
        assert result.diagrams == []
        assert "no mermaid source" in result.dropped[0].reason

    def test_bare_string_components_are_checked_against_the_source(self):
        result = self.validate([{"id": "d1", "mermaid": "graph TD", "components": ["API Gateway", "Redis Cache"]}])
        assert result.diagrams[0]["components"] == ["API Gateway"]


class TestSummary:
    def test_summary_is_kept_when_present(self):
        result = EnrichmentValidator().validate(SOURCE, {"summary": "  An order pipeline.  "})
        assert result.summary == "An order pipeline."

    def test_blank_summary_becomes_none(self):
        assert EnrichmentValidator().validate(SOURCE, {"summary": "   "}).summary is None


class TestMalformedInput:
    def test_garbage_shapes_are_ignored_rather_than_raising(self):
        # The model's output is untrusted input; a wrong shape must not take the
        # conversion down with it.
        result = EnrichmentValidator().validate(SOURCE, {"glossary": "not a list", "diagrams": 7})
        assert result.glossary == []
        assert result.diagrams == []

    def test_non_dict_entries_are_skipped(self):
        result = EnrichmentValidator().validate(SOURCE, {"glossary": ["nonsense", 12]})
        assert result.glossary == []


class TestHeadingPreservation:
    def test_missing_heading_is_reported(self):
        assert missing_headings(["Architecture", "Request Flow"], ["Architecture"]) == ["Request Flow"]

    def test_rewritten_punctuation_still_counts_as_present(self):
        assert missing_headings(["Request Flow"], ["request flow!"]) == []
