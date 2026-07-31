"""
Tests for GlossaryTermValidator

Tests that validate glossary entry evidence against source text using fuzzy matching.
Validates Requirements 9.1 and 9.2.
"""

import re

import pytest
from hypothesis import given, settings, HealthCheck, strategies as st
from app.validators.glossary_term_validator import GlossaryTermValidator
from app.validators.fuzzy_match_service import FuzzyMatchService


@pytest.fixture
def fuzzy_matcher():
    """Create a FuzzyMatchService instance for testing."""
    return FuzzyMatchService(default_threshold=0.85)


@pytest.fixture
def validator(fuzzy_matcher):
    """Create a GlossaryTermValidator instance for testing."""
    return GlossaryTermValidator(fuzzy_matcher)


class TestValidateEntryEvidence:
    """Tests for validate_entry_evidence() method."""
    
    def test_valid_entry_with_matching_evidence(self, validator):
        """Entry with evidence exactly matching source should pass."""
        entry = {
            "term": "API",
            "definition": "Application Programming Interface",
            "evidence": "An Application Programming Interface is a contract between components"
        }
        source = "An Application Programming Interface is a contract between components that defines how they interact."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_valid_entry_with_fuzzy_matching_evidence(self, validator):
        """Entry with evidence similar to source (≥85%) should pass."""
        entry = {
            "term": "Cache",
            "definition": "Temporary storage for frequently accessed data",
            "evidence": "cache is a temporary storage mechanism"
        }
        source = "A cache is a temporary storage mechanism for frequently accessed data."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_valid_entry_case_insensitive(self, validator):
        """Evidence matching should be case-insensitive."""
        entry = {
            "term": "Database",
            "definition": "Organized data storage system",
            "evidence": "DATABASE is a persistent storage system"
        }
        source = "A database is a persistent storage system for application data."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_valid_entry_with_whitespace_differences(self, validator):
        """Evidence should match even with extra whitespace."""
        entry = {
            "term": "Token",
            "definition": "Authentication credential",
            "evidence": "token   is    an   authentication   credential"
        }
        source = "A token is an authentication credential used for session management."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_invalid_entry_with_nonmatching_evidence(self, validator):
        """Entry with evidence not in source should fail."""
        entry = {
            "term": "Blockchain",
            "definition": "Distributed ledger",
            "evidence": "Blockchain uses quantum cryptography for security"
        }
        source = "Blockchain is a distributed ledger technology."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid
        assert len(result.errors) > 0
        assert "Blockchain" in result.errors[0]
        assert "not found" in result.errors[0]
    
    def test_invalid_entry_with_missing_evidence_field(self, validator):
        """Entry without evidence field should fail."""
        entry = {
            "term": "REST API",
            "definition": "Web service architecture"
        }
        source = "REST API is a web service architecture."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid
        assert len(result.errors) > 0
        assert "Missing evidence" in result.errors[0]
    
    def test_invalid_entry_with_empty_evidence(self, validator):
        """Entry with empty evidence string should fail."""
        entry = {
            "term": "Middleware",
            "definition": "Software layer between applications",
            "evidence": ""
        }
        source = "Middleware sits between the web server and the application."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid
        assert len(result.errors) > 0
        assert "Missing evidence" in result.errors[0]
    
    def test_error_includes_term_name(self, validator):
        """Rejection error should name the specific term."""
        entry = {
            "term": "Deprecated API",
            "definition": "Outdated interface",
            "evidence": "This API uses alien technology"
        }
        source = "The API is no longer maintained."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid
        assert "Deprecated API" in result.errors[0]
    
    def test_error_includes_claimed_evidence(self, validator):
        """Rejection error should include the claimed evidence (truncated)."""
        entry = {
            "term": "GraphQL",
            "definition": "Query language",
            "evidence": "GraphQL is not supported in this application"
        }
        source = "GraphQL is a query language for APIs."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid
        error_text = result.errors[0]
        assert "GraphQL is not supported" in error_text or "Claimed evidence" in error_text
    
    def test_punctuation_tolerance(self, validator):
        """Evidence should match even with punctuation differences."""
        entry = {
            "term": "Endpoint",
            "definition": "API access point",
            "evidence": "An endpoint is a URL that processes requests"
        }
        source = "An endpoint is a URL that processes requests, defined in the API specification."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
    
    def test_very_short_evidence(self, validator):
        """Even very short evidence should be fuzzy matched properly."""
        entry = {
            "term": "ORM",
            "definition": "Object-Relational Mapping",
            "evidence": "ORM maps objects to tables"
        }
        source = "ORM maps objects to database tables"
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
    
    def test_long_evidence_with_sliding_window(self, validator):
        """Long evidence should use sliding window approach."""
        entry = {
            "term": "Microservice",
            "definition": "Small, independent service",
            "evidence": "A microservice is a small, independent, and loosely coupled service that encapsulates specific business capability and is developed and deployed independently"
        }
        source = "A microservice is a small, independent, and loosely coupled service that encapsulates specific business capability and is developed and deployed independently to enable rapid delivery of complex applications."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid


class TestValidateAllEntries:
    """Tests for validate_all_entries() method."""
    
    def test_all_valid_entries(self, validator):
        """All valid entries should pass validation."""
        glossary = [
            {
                "term": "API",
                "definition": "Application Programming Interface",
                "evidence": "API is a set of protocols for communication"
            },
            {
                "term": "Cache",
                "definition": "Temporary storage",
                "evidence": "Cache stores frequently accessed data"
            }
        ]
        source = "API is a set of protocols for communication. Cache stores frequently accessed data efficiently."
        
        result = validator.validate_all_entries(glossary, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_mixed_valid_and_invalid_entries(self, validator):
        """Collection with invalid entries should fail validation."""
        glossary = [
            {
                "term": "API",
                "definition": "Application Programming Interface",
                "evidence": "API is a set of protocols for communication"
            },
            {
                "term": "Quantum",
                "definition": "Not a real tech term",
                "evidence": "Quantum computers use magic"
            }
        ]
        source = "API is a set of protocols for communication."
        
        result = validator.validate_all_entries(glossary, source)
        assert not result.valid
        assert len(result.errors) > 0
        assert "Quantum" in result.errors[0]
    
    def test_empty_glossary(self, validator):
        """Empty glossary should pass validation."""
        glossary = []
        source = "Some document content"
        
        result = validator.validate_all_entries(glossary, source)
        assert result.valid
        assert len(result.errors) == 0
    
    def test_single_invalid_entry_fails_collection(self, validator):
        """One invalid entry should fail the entire collection."""
        glossary = [
            {
                "term": "Valid",
                "definition": "Real term",
                "evidence": "Valid concept"
            },
            {
                "term": "Invalid",
                "definition": "Fake",
                "evidence": "NonexistentPhraseXYZ123"
            }
        ]
        source = "Valid concept is important."
        
        result = validator.validate_all_entries(glossary, source)
        assert not result.valid
    
    def test_multiple_invalid_entries_reported(self, validator):
        """Multiple invalid entries should all be reported."""
        glossary = [
            {
                "term": "Bad1",
                "definition": "First bad entry",
                "evidence": "Nonexistent phrase ABC"
            },
            {
                "term": "Bad2",
                "definition": "Second bad entry",
                "evidence": "Nonexistent phrase XYZ"
            }
        ]
        source = "This is a simple document."
        
        result = validator.validate_all_entries(glossary, source)
        assert not result.valid
        assert len(result.errors) >= 2


class TestEvidenceExistsInSource:
    """Tests for the internal _evidence_exists_in_source() method."""
    
    def test_evidence_exact_substring(self, validator):
        """Exact substring evidence should be found."""
        evidence = "test string"
        source = "This is a test string in a document"
        
        assert validator._evidence_exists_in_source(evidence, source)
    
    def test_evidence_not_in_source(self, validator):
        """Evidence not in source should not be found."""
        evidence = "impossible phrase XYZ123"
        source = "This is a normal document"
        
        assert not validator._evidence_exists_in_source(evidence, source)
    
    def test_evidence_case_insensitive_match(self, validator):
        """Case differences should not prevent matching."""
        evidence = "DATABASE IS IMPORTANT"
        source = "A database is important for applications."
        
        assert validator._evidence_exists_in_source(evidence, source)
    
    def test_evidence_whitespace_normalization(self, validator):
        """Multiple spaces should be normalized."""
        evidence = "the   quick   brown"
        source = "the quick brown fox"
        
        assert validator._evidence_exists_in_source(evidence, source)


class TestPropertyBasedGlossaryValidation:
    """Property-based tests validating core invariants of glossary validation.
    
    Validates: Requirements 9.1, 9.3
    """
    
    @settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        term=st.text(min_size=1, max_size=100).filter(lambda x: x.strip()),
        definition=st.text(min_size=10, max_size=200).filter(lambda x: x.strip()),
        evidence_prefix=st.text(min_size=5, max_size=50),
        evidence_suffix=st.text(min_size=5, max_size=50)
    )
    def test_evidence_from_source_always_validates(
        self, 
        validator, 
        term, 
        definition, 
        evidence_prefix, 
        evidence_suffix
    ):
        """
        **Validates: Requirements 9.1, 9.3**
        
        For any glossary entry where the evidence is a substring from the source,
        validation SHALL succeed.
        """
        # Create source that contains the evidence
        source = f"prefix text {evidence_prefix}evidenceMarker{evidence_suffix} more text"
        evidence = f"{evidence_prefix}evidenceMarker{evidence_suffix}"
        
        entry = {
            "term": term,
            "definition": definition,
            "evidence": evidence
        }
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid, f"Evidence from source should validate: {evidence}"
    
    @settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
    @given(
        st.lists(
            st.fixed_dictionaries({
                "term": st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),
                "definition": st.text(min_size=10, max_size=100).filter(lambda x: x.strip()),
                # Must contain at least one alphanumeric character: evidence
                # matching strips punctuation for fuzzy-tolerance (see
                # GlossaryTermValidator._normalize_for_matching), so
                # punctuation-only evidence carries no matchable content and
                # is not a meaningful "verbatim excerpt" in the first place.
                "evidence": st.text(min_size=5, max_size=100).filter(
                    lambda x: x.strip() and re.search(r"[a-zA-Z0-9]", x)
                )
            }),
            min_size=0,
            max_size=10
        )
    )
    def test_glossary_filtering_preserves_valid_entries(self, validator, glossary):
        """
        **Validates: Requirements 9.2, 9.5, 5.4, 5.5**
        
        For any glossary, filtering SHALL preserve all entries with valid evidence
        in source, and remove only those without valid evidence.
        """
        # Create a source that contains all evidence
        combined_source = " ".join(entry.get("evidence", "") for entry in glossary)
        
        result = validator.validate_all_entries(glossary, combined_source)
        
        # Since all evidence is in source, validation should succeed
        assert result.valid or len(glossary) == 0, "All entries have evidence in combined source"


class TestTermExistenceValidation:
    """Tests validating term appearance in source text.
    
    Note: These tests validate that the evidence field (not the term itself)
    contains the source grounding, per Requirement 9.1.
    """
    
    def test_entry_with_term_in_source_and_evidence(self, validator):
        """Entry where both term and evidence appear in source should validate."""
        entry = {
            "term": "REST",
            "definition": "Representational State Transfer",
            "evidence": "REST is an architectural style"
        }
        source = "REST is an architectural style for web services."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid
    
    def test_entry_with_term_missing_from_source_but_evidence_present(self, validator):
        """Entry validates based on evidence, not term presence."""
        entry = {
            "term": "API_TERM",  # Not in source
            "definition": "Something",
            "evidence": "the system provides communication"
        }
        source = "The system provides communication between components."
        
        result = validator.validate_entry_evidence(entry, source)
        assert result.valid, "Evidence presence is what matters, not term presence"
    
    def test_entry_with_term_present_but_invalid_evidence(self, validator):
        """Entry fails if evidence doesn't validate, regardless of term presence."""
        entry = {
            "term": "API",
            "definition": "Something",
            "evidence": "API uses quantum mechanics"
        }
        source = "API is defined elsewhere."
        
        result = validator.validate_entry_evidence(entry, source)
        assert not result.valid, "Invalid evidence should fail even if term is in source"
