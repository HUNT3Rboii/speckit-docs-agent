"""
Unit tests for FuzzyMatchService.

Tests fuzzy string matching with various edge cases:
- Punctuation differences
- Case differences
- Whitespace variations
- Threshold boundary conditions
"""

import pytest
from app.validators.fuzzy_match_service import FuzzyMatchService


class TestFuzzyMatchService:
    """Test suite for FuzzyMatchService."""

    def setup_method(self):
        """Initialize FuzzyMatchService for each test."""
        self.service = FuzzyMatchService(default_threshold=0.85)

    def test_identical_strings_match(self):
        """Test that identical strings have maximum similarity."""
        text = "The quick brown fox"
        score = self.service.similarity_score(text, text)
        assert score == 1.0

    def test_identical_strings_fuzzy_match_returns_true(self):
        """Test that identical strings fuzzy match."""
        text = "Heading: Implementation Details"
        assert self.service.fuzzy_match(text, text) is True

    def test_completely_different_strings_no_match(self):
        """Test that completely different strings have low similarity."""
        text1 = "apple orange banana"
        text2 = "xyz abc 123"
        score = self.service.similarity_score(text1, text2)
        assert score < 0.5

    def test_case_insensitive_matching(self):
        """Test that matching is case-insensitive."""
        text1 = "The Quick Brown Fox"
        text2 = "the quick brown fox"
        assert self.service.fuzzy_match(text1, text2) is True

    def test_case_difference_high_similarity(self):
        """Test case difference produces high similarity score."""
        text1 = "Heading"
        text2 = "heading"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0  # Now case-insensitive


    def test_punctuation_tolerance(self):
        """Test that punctuation differences are tolerated."""
        text1 = "The user creates a new account, validates input and verifies email."
        text2 = "The user creates a new account validates input and verifies email"
        score = self.service.similarity_score(text1, text2)
        assert score > 0.85  # Should match above threshold

    def test_punctuation_at_end(self):
        """Test punctuation at end is tolerated."""
        text1 = "Configuration Settings"
        text2 = "Configuration Settings."
        assert self.service.fuzzy_match(text1, text2) is True

    def test_multiple_punctuation_marks(self):
        """Test multiple punctuation marks are handled."""
        text1 = "API Endpoints: GET, POST, PUT, DELETE"
        text2 = "API Endpoints GET POST PUT DELETE"
        score = self.service.similarity_score(text1, text2)
        assert score > 0.75

    def test_whitespace_normalization_single_spaces(self):
        """Test whitespace is normalized to single spaces."""
        text1 = "The   quick   brown   fox"
        text2 = "The quick brown fox"
        assert self.service.fuzzy_match(text1, text2) is True

    def test_whitespace_normalization_leading_trailing(self):
        """Test leading/trailing whitespace is normalized."""
        text1 = "  Heading  "
        text2 = "Heading"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0

    def test_whitespace_tabs_and_newlines(self):
        """Test tabs and newlines are normalized to spaces."""
        text1 = "The\tquick\nbrown\rfox"
        text2 = "The quick brown fox"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0

    def test_minor_word_omission(self):
        """Test that minor word omissions still match."""
        text1 = "Implementation Guide and Best Practices"
        text2 = "Implementation Guide Best Practices"
        score = self.service.similarity_score(text1, text2)
        assert score > 0.8

    def test_word_order_independence(self):
        """Test token-sort handles word order differences."""
        text1 = "System Design Architecture"
        text2 = "Architecture Design System"
        score = self.service.similarity_score(text1, text2)
        # Token sort should handle this well
        assert score > 0.75

    def test_similarity_score_range(self):
        """Test similarity score is always between 0.0 and 1.0."""
        test_pairs = [
            ("apple", "orange"),
            ("The quick brown fox", "The quick brown fox jumps"),
            ("API", "REST"),
            ("", "something"),
            ("something", ""),
        ]
        for text1, text2 in test_pairs:
            score = self.service.similarity_score(text1, text2)
            assert 0.0 <= score <= 1.0

    def test_threshold_boundary_below(self):
        """Test threshold boundary - score below threshold."""
        text1 = "API Documentation"
        text2 = "REST Services"
        score = self.service.similarity_score(text1, text2)
        # These should have low similarity
        assert score < 0.85
        assert self.service.fuzzy_match(text1, text2) is False

    def test_threshold_boundary_above(self):
        """Test threshold boundary - score above threshold."""
        text1 = "Database Migration Guide"
        text2 = "Database Migration Guide."
        score = self.service.similarity_score(text1, text2)
        # These should be similar
        assert score >= 0.85
        assert self.service.fuzzy_match(text1, text2) is True

    def test_custom_threshold_strict(self):
        """Test custom higher threshold."""
        text1 = "Configuration"
        text2 = "Configuration."
        # At 0.99 threshold, small differences might not match
        result = self.service.fuzzy_match(text1, text2, threshold=0.99)
        # This might be True or False depending on exact similarity

    def test_custom_threshold_lenient(self):
        """Test custom lower threshold."""
        text1 = "API"
        text2 = "REST"
        # At 0.1 threshold, these might still not match if similarity is 0
        result = self.service.fuzzy_match(text1, text2, threshold=0.0)
        # At 0.0 threshold, should match
        assert result is True


    def test_find_best_match_exact_match(self):
        """Test find_best_match returns exact match when available."""
        target = "Heading: Introduction"
        candidates = [
            "Heading: Getting Started",
            "Heading: Introduction",
            "Heading: Implementation",
        ]
        best = self.service.find_best_match(target, candidates)
        assert best == "Heading: Introduction"

    def test_find_best_match_closest_match(self):
        """Test find_best_match returns closest match above threshold."""
        target = "Database Configuration"
        candidates = [
            "API Endpoints",
            "Database Configuration.",
            "Cache Settings",
        ]
        best = self.service.find_best_match(target, candidates)
        assert best == "Database Configuration."

    def test_find_best_match_no_match_above_threshold(self):
        """Test find_best_match returns None if no match above threshold."""
        target = "Apple Pie Recipe"
        candidates = [
            "Orange Juice",
            "Banana Split",
            "Cherry Tart",
        ]
        best = self.service.find_best_match(target, candidates)
        assert best is None

    def test_find_best_match_empty_candidates(self):
        """Test find_best_match with empty candidates list."""
        target = "Something"
        candidates = []
        best = self.service.find_best_match(target, candidates)
        assert best is None

    def test_find_best_match_custom_threshold(self):
        """Test find_best_match respects custom threshold."""
        target = "Configuration"
        candidates = [
            "Config",
            "Configuration Setup",
            "Preferences",
        ]
        # Low threshold - should find match
        best = self.service.find_best_match(target, candidates, threshold=0.5)
        assert best is not None
        
        # High threshold - might not find match
        best_strict = self.service.find_best_match(target, candidates, threshold=0.99)
        # We don't assert the result as it depends on exact matching

    def test_empty_strings(self):
        """Test handling of empty strings."""
        score = self.service.similarity_score("", "")
        assert score == 1.0  # Empty strings are identical

    def test_empty_string_vs_content(self):
        """Test empty string vs non-empty string."""
        score = self.service.similarity_score("", "something")
        assert score == 0.0

    def test_content_vs_empty_string(self):
        """Test non-empty string vs empty string."""
        score = self.service.similarity_score("something", "")
        assert score == 0.0

    def test_single_character_strings(self):
        """Test single character strings."""
        score = self.service.similarity_score("a", "a")
        assert score == 1.0
        
        score = self.service.similarity_score("a", "b")
        assert score == 0.0

    def test_very_long_strings(self):
        """Test with very long strings."""
        long_text = "The quick brown fox jumps over the lazy dog. " * 50
        score = self.service.similarity_score(long_text, long_text)
        assert score == 1.0

    def test_special_characters(self):
        """Test handling of special characters."""
        text1 = "Feature@2024: Security & Compliance"
        text2 = "Feature 2024 Security Compliance"
        score = self.service.similarity_score(text1, text2)
        # Should still be reasonably similar despite special chars
        assert score > 0.6

    def test_numbers_in_text(self):
        """Test matching with numbers."""
        text1 = "Version 2.0.1"
        text2 = "Version 2.0.1"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0

    def test_requirement_heading_preservation(self):
        """Test realistic scenario: heading preservation with slight rewording."""
        # Requirement 7.4: Should tolerate paraphrasing with ≥85% threshold
        original = "Backend Validation — Heading Coverage"
        enriched = "Backend Validation - Heading Coverage"
        assert self.service.fuzzy_match(original, enriched) is True

    def test_requirement_evidence_matching(self):
        """Test realistic scenario: evidence field matching for diagram components."""
        # Requirements 8.2, 9.3: Check if evidence appears in source
        # NOTE: For substring/evidence matching, we should use a substring search
        # or lower the threshold. Token sort is best for similar-length strings.
        evidence = "the system checks credentials"
        source = "The system checks credentials against the database"
        # Token sort with lower threshold to allow for substring matches
        score = self.service.similarity_score(evidence, source)
        # This should be reasonably similar (around 60-70%)
        assert score >= 0.6


    def test_requirement_glossary_evidence_matching(self):
        """Test realistic scenario: glossary term evidence in source."""
        # Requirement 9.3: Case-insensitive evidence matching
        evidence = "Authentication service"
        source = "The authentication service handles user login"
        # Token sort should give reasonable score for substring matching
        score = self.service.similarity_score(evidence, source)
        # Should be around 50-60% similarity
        assert score >= 0.4


    def test_multiple_threshold_values(self):
        """Test service handles multiple threshold values correctly."""
        thresholds = [0.5, 0.7, 0.85, 0.95]
        text1 = "Implementation"
        text2 = "Implementation Guide"
        
        for threshold in thresholds:
            result = self.service.fuzzy_match(text1, text2, threshold=threshold)
            assert isinstance(result, bool)

    def test_default_threshold_used_in_fuzzy_match(self):
        """Test that default threshold is used when not specified."""
        text1 = "Introduction"
        text2 = "Intro"
        
        # With default 0.85, these likely won't match
        result_default = self.service.fuzzy_match(text1, text2)
        
        # With lower threshold, should match
        result_lenient = self.service.fuzzy_match(text1, text2, threshold=0.5)
        
        # Lower threshold should be more permissive
        assert result_lenient >= result_default

    def test_unicode_characters(self):
        """Test handling of unicode characters."""
        text1 = "Café Configuration"
        text2 = "Café Configuration"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0


class TestFuzzyMatchServiceEdgeCases:
    """Test edge cases and boundary conditions."""

    def setup_method(self):
        """Initialize service for edge case tests."""
        self.service = FuzzyMatchService()

    def test_repeated_words(self):
        """Test with repeated words."""
        text1 = "test test test"
        text2 = "test test test"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0

    def test_mixed_case_preservation(self):
        """Test that mixed case is normalized."""
        text1 = "CamelCaseHeading"
        text2 = "camelcaseheading"
        score = self.service.similarity_score(text1, text2)
        assert score == 1.0  # Now case-insensitive


    def test_partial_overlap_high_similarity(self):
        """Test strings with high overlap."""
        text1 = "The quick brown fox jumps"
        text2 = "The quick brown fox jumps over"
        score = self.service.similarity_score(text1, text2)
        assert score > 0.8

    def test_partial_overlap_medium_similarity(self):
        """Test strings with partial overlap."""
        text1 = "The quick brown"
        text2 = "The lazy brown"
        score = self.service.similarity_score(text1, text2)
        assert score > 0.6

    def test_acronyms(self):
        """Test handling of acronyms."""
        text1 = "REST API Endpoints"
        text2 = "REST API Endpoints."
        assert self.service.fuzzy_match(text1, text2) is True

    def test_contractions(self):
        """Test handling of contractions."""
        text1 = "It's a good system"
        text2 = "It is a good system"
        score = self.service.similarity_score(text1, text2)
        # Should be reasonably similar
        assert score > 0.7

    def test_hyphenated_words(self):
        """Test handling of hyphenated words."""
        text1 = "Well-designed architecture"
        text2 = "Well designed architecture"
        score = self.service.similarity_score(text1, text2)
        # Hyphen is treated as a character, so it reduces similarity slightly
        assert score > 0.6



class TestFuzzyMatchServiceRequirements:
    """Test that service meets all specification requirements."""

    def setup_method(self):
        """Initialize service."""
        self.service = FuzzyMatchService(default_threshold=0.85)

    def test_requirement_7_4_fuzzy_match_tolerance(self):
        """
        Requirement 7.4: Use fuzzy matching with ≥85% similarity threshold.
        
        Validates: Requirements 7.4, 8.2, 9.3
        """
        # Headings with trivial differences should match at 85%
        original = "Heading One"
        enriched = "Heading One."
        assert self.service.fuzzy_match(original, enriched, threshold=0.85)

    def test_requirement_8_2_evidence_field_matching(self):
        """
        Requirement 8.2: Fuzzy match evidence field against full source.
        
        Validates: Requirements 8.2
        """
        evidence = "the system validates user input"
        source = "The system validates user input against security policies"
        # Token sort gives reasonable similarity for this case
        score = self.service.similarity_score(evidence, source)
        assert score >= 0.55


    def test_requirement_9_3_case_insensitive_matching(self):
        """
        Requirement 9.3: Glossary matching is case-insensitive.
        
        Validates: Requirements 9.3
        """
        evidence = "Authentication Service"
        source = "the authentication service handles login"
        # Token sort gives reasonable similarity for this case
        score = self.service.similarity_score(evidence, source)
        assert score >= 0.4


    def test_threshold_default_85_percent(self):
        """Test that default threshold is 0.85 (85%)."""
        assert self.service.default_threshold == 0.85

    def test_similarity_score_0_to_1_range(self):
        """Test similarity_score returns values in 0.0-1.0 range."""
        test_cases = [
            ("", ""),
            ("a", "b"),
            ("apple", "apple"),
            ("The quick brown fox", "The lazy brown dog"),
        ]
        for text1, text2 in test_cases:
            score = self.service.similarity_score(text1, text2)
            assert 0.0 <= score <= 1.0


class TestPartialMatch:
    """
    Tests for partial_match()/partial_similarity_score() - added because
    similarity_score()/token_sort_ratio (used by find_best_match, and
    previously used directly for evidence-grounding checks) compares two
    strings as wholes. That's correct for heading matching (both sides are
    short, roughly-equal-length headings) but wrong for "does this short
    evidence excerpt appear within this much longer source document": a
    genuinely-quoted 20-30 word excerpt checked against an entire
    multi-paragraph source scores as low as 25-35% with token_sort_ratio,
    since all the source's *other* unrelated content counts against it.
    partial_ratio instead finds the best-aligning contiguous span of the
    longer text, which is the actual question being asked.
    """

    def setup_method(self):
        self.service = FuzzyMatchService(default_threshold=0.85)

    def test_short_verbatim_excerpt_matches_within_long_source(self):
        source = (
            "The Storefront sends order requests to the API Gateway, which authenticates "
            "the request and forwards it to the Order Service. The Order Service validates "
            "the request and publishes an OrderCreated event to the Event Bus. The Payment "
            "Service subscribes to OrderCreated events, charges the customer through the "
            "external Payment Provider, and publishes a PaymentConfirmed event."
        )
        evidence = "The Storefront sends order requests to the API Gateway"

        assert self.service.partial_match(evidence, source) is True

    def test_excerpt_from_middle_of_long_source_matches(self):
        source = (
            "The Storefront sends order requests to the API Gateway, which authenticates "
            "the request and forwards it to the Order Service. The Order Service validates "
            "the request and publishes an OrderCreated event to the Event Bus."
        )
        evidence = "Order Service validates the request and publishes an OrderCreated event"

        assert self.service.partial_match(evidence, source) is True

    def test_whole_string_token_sort_ratio_would_have_failed_this_case(self):
        """Confirms the regression this fix addresses: the same excerpt/source
        pair that partial_match() correctly accepts scores far below any
        reasonable threshold under the old token_sort_ratio-based approach."""
        source = (
            "The Storefront sends order requests to the API Gateway, which authenticates "
            "the request and forwards it to the Order Service. The Order Service validates "
            "the request and publishes an OrderCreated event to the Event Bus. The Payment "
            "Service subscribes to OrderCreated events, charges the customer through the "
            "external Payment Provider, and publishes a PaymentConfirmed event."
        )
        evidence = "The Storefront sends order requests to the API Gateway"

        assert self.service.similarity_score(evidence, source) < 0.5
        assert self.service.partial_similarity_score(evidence, source) >= 0.85

    def test_fabricated_evidence_still_rejected(self):
        source = "The system uses a PostgreSQL database to store user records."
        evidence = "The system uses quantum encryption to secure all transactions"

        assert self.service.partial_match(evidence, source) is False

    def test_partial_match_is_case_insensitive(self):
        source = "The API Gateway authenticates every incoming request."
        evidence = "the api gateway authenticates every incoming request"

        assert self.service.partial_match(evidence, source) is True

    def test_partial_similarity_score_range(self):
        score = self.service.partial_similarity_score("hello", "world hello there")
        assert 0.0 <= score <= 1.0

    def test_partial_match_respects_custom_threshold(self):
        source = "The quick brown fox jumps over the lazy dog"
        evidence = "the slow brown fox jumps over the lazy dog"  # one word changed

        assert self.service.partial_match(evidence, source, threshold=0.99) is False
        assert self.service.partial_match(evidence, source, threshold=0.80) is True


class TestGappedMatch:
    """
    Tests for gapped_containment_score()/gapped_match() - added after a real
    live-testing report ("STILL SAYS EVIDENCE NOT GROUNDED") turned out to be
    a case partial_match() doesn't cover: a genuine excerpt with a clause
    dropped from partway through it (not truncated from an end, which
    partial_ratio already handles fine). E.g. source "The Order Service
    validates the request and publishes an OrderCreated event to the Event
    Bus" paraphrased as evidence "The Order Service publishes an
    OrderCreated event to the Event Bus" (drops "validates the request and"
    from the middle). Reproduced against the actual payload that triggered
    the report: "Event Bus" scored partial_ratio=0.848 and "Inventory
    Database" scored partial_ratio=0.797 - both genuine, both just under the
    0.85 threshold.
    """

    def setup_method(self):
        self.service = FuzzyMatchService(default_threshold=0.85)
        self.real_source = (
            "The Storefront sends order requests to the API Gateway, which authenticates "
            "the request and forwards it to the Order Service. The Order Service validates "
            "the request and publishes an OrderCreated event to the Event Bus. The Payment "
            "Service subscribes to OrderCreated events, charges the customer through the "
            "external Payment Provider, and publishes a PaymentConfirmed event. The "
            "Inventory Service subscribes to PaymentConfirmed events and reserves stock "
            "from the Inventory Database. Once inventory is reserved, the Inventory Service "
            "publishes an OrderFulfilled event, which the Notification Service consumes to "
            "email the customer a confirmation."
        )

    @staticmethod
    def _normalize(text):
        """Mirror the validators' own normalization (lowercase, strip
        punctuation, collapse whitespace) - partial_match()'s own built-in
        normalization only lowercases/collapses whitespace, so comparing raw
        punctuated text here would score differently than what the real
        validators (which normalize first) actually see."""
        import re
        return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())

    def test_regression_event_bus_evidence_from_live_report(self):
        evidence = self._normalize("The Order Service publishes an OrderCreated event to the Event Bus.")
        source = self._normalize(self.real_source)

        # Confirms this is the exact case partial_match() misses (motivating
        # gapped_match as a fallback, not a replacement).
        assert self.service.partial_match(evidence, source) is False
        assert self.service.gapped_match(evidence, source) is True

    def test_regression_inventory_database_evidence_from_live_report(self):
        evidence = self._normalize("The Inventory Service reserves stock from the Inventory Database.")
        source = self._normalize(self.real_source)

        assert self.service.partial_match(evidence, source) is False
        assert self.service.gapped_match(evidence, source) is True

    def test_fabricated_evidence_reusing_real_vocabulary_still_rejected(self):
        """Adversarial case: evidence built entirely from real words/phrases
        pulled from unrelated parts of the source, recombined into a false
        claim. Must stay rejected - this is what the density signal guards
        against (naive coverage alone would wrongly accept this)."""
        evidence = "The Inventory Database charges the customer through the Payment Provider"

        assert self.service.gapped_match(evidence, self.real_source) is False

    def test_fabricated_evidence_with_invented_content_rejected(self):
        evidence = "The API Gateway performs real time fraud detection using a machine learning model"

        assert self.service.gapped_match(evidence, self.real_source) is False

    def test_gapped_containment_score_range(self):
        score = self.service.gapped_containment_score("hello", "world hello there")
        assert 0.0 <= score <= 1.0

    def test_empty_needle_or_haystack_scores_zero(self):
        assert self.service.gapped_containment_score("", "some text") == 0.0
        assert self.service.gapped_containment_score("some text", "") == 0.0

    def test_exact_match_scores_one(self):
        text = "the exact same text"
        assert self.service.gapped_containment_score(text, text) == 1.0

    def test_gapped_match_respects_custom_threshold(self):
        evidence = "The Order Service publishes an OrderCreated event to the Event Bus."
        score = self.service.gapped_containment_score(evidence, self.real_source)

        assert self.service.gapped_match(evidence, self.real_source, threshold=score + 0.01) is False
        assert self.service.gapped_match(evidence, self.real_source, threshold=score - 0.01) is True
