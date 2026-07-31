"""
Unit tests for validate_evidence_fields() method

Tests that the EnrichedJSONValidator correctly:
- Checks each diagram has components[] with name AND evidence
- Checks each glossary entry has term, definition, AND evidence
- Returns specific errors naming missing evidence fields
"""

import pytest
from app.validators.enriched_json_validator import EnrichedJSONValidator


class TestValidateEvidenceFields:
    """Test suite for evidence field validation."""
    
    def setup_method(self):
        """Initialize validator for each test."""
        self.validator = EnrichedJSONValidator()
    
    def test_valid_enriched_json_with_evidence(self):
        """Test that valid enriched JSON with evidence passes validation."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A",
                            "evidence": "This service handles authentication and authorization"
                        }
                    ]
                }
            ],
            "glossary": [
                {
                    "term": "Authentication",
                    "definition": "The process of verifying identity",
                    "evidence": "This service handles authentication and authorization"
                }
            ]
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is True
        assert result.errors == []
    
    def test_diagram_missing_components_array(self):
        """Test that diagram without components[] is rejected with specific error."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1"
                    # Missing components
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) > 0
        assert any("Diagram 0" in error and "Missing components array" in error for error in result.errors)
    
    def test_diagram_component_missing_evidence_field(self):
        """Test that component without evidence field is rejected with specific error."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A"
                            # Missing evidence field
                        }
                    ]
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) > 0
        error_msg = result.errors[0]
        assert "Diagram 0, Component 0" in error_msg
        assert "Service A" in error_msg
        assert "Missing or empty evidence field" in error_msg
    
    def test_diagram_component_empty_evidence_field(self):
        """Test that component with empty evidence string is rejected."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A",
                            "evidence": ""  # Empty string
                        }
                    ]
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) > 0
        assert any("Missing or empty evidence field" in error for error in result.errors)
    
    def test_multiple_diagram_components_with_missing_evidence(self):
        """Test that all components with missing evidence are reported."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]; B[Service B]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A",
                            "evidence": "Valid evidence"
                        },
                        {
                            "name": "Service B"
                            # Missing evidence
                        },
                        {
                            "name": "Service C",
                            "evidence": ""  # Empty evidence
                        }
                    ]
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        # Should have 2 errors for components without evidence
        assert len(result.errors) == 2
        assert any("Component 1" in error and "Service B" in error for error in result.errors)
        assert any("Component 2" in error and "Service C" in error for error in result.errors)
    
    def test_multiple_diagrams_with_evidence_issues(self):
        """Test that errors from multiple diagrams are all reported."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A"
                            # Missing evidence
                        }
                    ]
                },
                {
                    "type": "sequence",
                    "mermaidCode": "sequenceDiagram",
                    "sectionRef": "section-2",
                    "location": "after-section-2",
                    "components": [
                        {
                            "name": "Actor",
                            "evidence": ""  # Empty evidence
                        }
                    ]
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) == 2
    
    def test_glossary_entry_missing_evidence_field(self):
        """Test that glossary entry without evidence field is rejected with specific error."""
        enriched_json = {
            "diagrams": [],
            "glossary": [
                {
                    "term": "Authentication",
                    "definition": "The process of verifying identity"
                    # Missing evidence field
                }
            ]
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) > 0
        error_msg = result.errors[0]
        assert "Glossary entry 0" in error_msg
        assert "Authentication" in error_msg
        assert "Missing or empty evidence field" in error_msg
    
    def test_glossary_entry_empty_evidence_field(self):
        """Test that glossary entry with empty evidence string is rejected."""
        enriched_json = {
            "diagrams": [],
            "glossary": [
                {
                    "term": "Authentication",
                    "definition": "The process of verifying identity",
                    "evidence": ""  # Empty string
                }
            ]
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        assert len(result.errors) > 0
        assert any("Missing or empty evidence field" in error for error in result.errors)
    
    def test_multiple_glossary_entries_with_missing_evidence(self):
        """Test that all glossary entries with missing evidence are reported."""
        enriched_json = {
            "diagrams": [],
            "glossary": [
                {
                    "term": "Authentication",
                    "definition": "The process of verifying identity",
                    "evidence": "Valid evidence"
                },
                {
                    "term": "Authorization",
                    "definition": "Granting access permissions"
                    # Missing evidence
                },
                {
                    "term": "Encryption",
                    "definition": "Securing data with cryptography",
                    "evidence": ""  # Empty evidence
                }
            ]
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        # Should have 2 errors for entries without evidence
        assert len(result.errors) == 2
        assert any("Glossary entry 1" in error and "Authorization" in error for error in result.errors)
        assert any("Glossary entry 2" in error and "Encryption" in error for error in result.errors)
    
    def test_combined_diagram_and_glossary_missing_evidence(self):
        """Test that errors from both diagrams and glossary are reported together."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "architecture",
                    "mermaidCode": "graph LR; A[Service A]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Service A"
                            # Missing evidence
                        }
                    ]
                }
            ],
            "glossary": [
                {
                    "term": "Authentication",
                    "definition": "The process of verifying identity"
                    # Missing evidence
                }
            ]
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        # Should have 2 errors total
        assert len(result.errors) == 2
        assert any("Diagram" in error for error in result.errors)
        assert any("Glossary" in error for error in result.errors)
    
    def test_empty_diagrams_and_glossary(self):
        """Test that empty diagrams and glossary lists pass validation."""
        enriched_json = {
            "diagrams": [],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is True
        assert result.errors == []
    
    def test_error_messages_are_specific(self):
        """Test that error messages provide specific, actionable information."""
        enriched_json = {
            "diagrams": [
                {
                    "type": "flowchart",
                    "mermaidCode": "graph LR; A[Start]; B[End]",
                    "sectionRef": "section-1",
                    "location": "after-section-1",
                    "components": [
                        {
                            "name": "Start Node",
                            "evidence": "The process begins here"
                        },
                        {
                            "name": "End Node"
                            # Missing evidence
                        }
                    ]
                }
            ],
            "glossary": []
        }
        
        result = self.validator.validate_evidence_fields(enriched_json)
        
        assert result.valid is False
        error_msg = result.errors[0]
        
        # Verify error contains all required information
        assert "Diagram 0" in error_msg  # Which diagram
        assert "Component 1" in error_msg  # Which component
        assert "End Node" in error_msg  # Component name
        assert "evidence" in error_msg.lower()  # What field is missing
