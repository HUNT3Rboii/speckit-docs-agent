#!/usr/bin/env python
"""
Manual test script for GlossaryTermValidator to verify implementation works correctly.
This avoids environment issues by running without pytest.
"""

import sys
sys.path.insert(0, '/c/Users/MSI/Desktop/speckit-docs-agent/speckit-docs-agent/backend')

from app.validators.glossary_term_validator import GlossaryTermValidator
from app.validators.fuzzy_match_service import FuzzyMatchService

def test_basic_functionality():
    """Test basic glossary validation functionality."""
    print("Testing GlossaryTermValidator basic functionality...")
    
    fuzzy_matcher = FuzzyMatchService(default_threshold=0.85)
    validator = GlossaryTermValidator(fuzzy_matcher)
    
    # Test 1: Valid entry with exact match
    print("\n1. Testing valid entry with exact match...")
    entry = {
        "term": "API",
        "definition": "Application Programming Interface",
        "evidence": "An Application Programming Interface is a contract"
    }
    source = "An Application Programming Interface is a contract between components."
    result = validator.validate_entry_evidence(entry, source)
    print(f"   Result: {'PASS' if result.valid else 'FAIL'} - {result.errors if not result.valid else 'Valid'}")
    assert result.valid, "Should pass with exact match"
    
    # Test 2: Valid entry with fuzzy match
    print("\n2. Testing valid entry with fuzzy match (case-insensitive)...")
    entry = {
        "term": "Cache",
        "definition": "Temporary storage",
        "evidence": "cache is a temporary storage mechanism"
    }
    source = "A Cache is a temporary storage mechanism for data."
    result = validator.validate_entry_evidence(entry, source)
    print(f"   Result: {'PASS' if result.valid else 'FAIL'} - {result.errors if not result.valid else 'Valid'}")
    assert result.valid, "Should pass with fuzzy match"
    
    # Test 3: Invalid entry - evidence not in source
    print("\n3. Testing invalid entry (evidence not in source)...")
    entry = {
        "term": "Blockchain",
        "definition": "Distributed ledger",
        "evidence": "Blockchain uses quantum cryptography"
    }
    source = "Blockchain is a distributed ledger technology."
    result = validator.validate_entry_evidence(entry, source)
    print(f"   Result: {'PASS' if not result.valid else 'FAIL'} - Errors: {result.errors}")
    assert not result.valid, "Should fail when evidence not in source"
    assert len(result.errors) > 0, "Should have error messages"
    assert "Blockchain" in result.errors[0], "Error should name the term"
    
    # Test 4: Missing evidence field
    print("\n4. Testing entry with missing evidence field...")
    entry = {
        "term": "REST API",
        "definition": "Web service architecture"
    }
    source = "REST API is a web service architecture."
    result = validator.validate_entry_evidence(entry, source)
    print(f"   Result: {'PASS' if not result.valid else 'FAIL'} - Errors: {result.errors}")
    assert not result.valid, "Should fail without evidence field"
    assert "Missing evidence" in result.errors[0], "Error should mention missing evidence"
    
    # Test 5: Empty evidence
    print("\n5. Testing entry with empty evidence...")
    entry = {
        "term": "Middleware",
        "definition": "Software layer",
        "evidence": ""
    }
    source = "Middleware sits between applications."
    result = validator.validate_entry_evidence(entry, source)
    print(f"   Result: {'PASS' if not result.valid else 'FAIL'} - Errors: {result.errors}")
    assert not result.valid, "Should fail with empty evidence"
    
    # Test 6: Multiple entries validation
    print("\n6. Testing validation of multiple entries...")
    glossary = [
        {
            "term": "API",
            "definition": "Communication interface",
            "evidence": "API enables communication"
        },
        {
            "term": "Cache",
            "definition": "Storage layer",
            "evidence": "Cache improves performance"
        }
    ]
    source = "API enables communication between services. Cache improves performance."
    result = validator.validate_all_entries(glossary, source)
    print(f"   Result: {'PASS' if result.valid else 'FAIL'} - {result.errors if not result.valid else 'All valid'}")
    assert result.valid, "Should pass when all entries are valid"
    
    # Test 7: Multiple entries with one invalid
    print("\n7. Testing multiple entries with one invalid...")
    glossary = [
        {
            "term": "API",
            "definition": "Communication interface",
            "evidence": "API enables communication"
        },
        {
            "term": "Quantum",
            "definition": "Fake term",
            "evidence": "Uses quantum computing magic"
        }
    ]
    source = "API enables communication between services."
    result = validator.validate_all_entries(glossary, source)
    print(f"   Result: {'PASS' if not result.valid else 'FAIL'} - Errors: {result.errors}")
    assert not result.valid, "Should fail when any entry is invalid"
    assert len(result.errors) > 0, "Should report errors"
    
    print("\n" + "="*60)
    print("All manual tests PASSED!")
    print("="*60)

if __name__ == "__main__":
    try:
        test_basic_functionality()
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
