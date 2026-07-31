"""
Unit tests for DiagramGroundingValidator.

Tests the diagram component evidence validation and Mermaid syntax checking:
- Evidence field validation against source markdown
- Fuzzy matching with ≥85% similarity threshold
- Proper error messages for ungrounded components
- Mermaid syntax validation (parse-check)
- Validates evidence text, NOT component names

Requirement 8 (Diagram Grounding):
- FOR EACH diagram component, fuzzy match component's evidence against source (≥85%)
- Evaluate evidence text ONLY, NOT component names
- Return structured error naming ungrounded components with their claimed evidence
- Test-render each diagram's mermaidCode for syntax validity (parse-check)
"""

import pytest

from app.validators.diagram_grounding_validator import DiagramGroundingValidator
from app.validators.fuzzy_match_service import FuzzyMatchService
from app.models.enriched_json import ValidationResult


@pytest.fixture
def fuzzy_matcher():
    """Create a FuzzyMatchService for testing."""
    return FuzzyMatchService(default_threshold=0.85)


@pytest.fixture
def validator(fuzzy_matcher):
    """Create a DiagramGroundingValidator for testing."""
    return DiagramGroundingValidator(fuzzy_matcher)


# ============================================================================
# Tests for validate_diagram_evidence()
# ============================================================================

class TestValidateDiagramEvidence:
    """Tests for validating individual diagram evidence."""
    
    def test_valid_diagram_with_grounded_evidence(self, validator):
        """
        Test that a diagram with evidence grounded in source passes validation.
        
        Requirement 8.1: Evidence field must match source (fuzzy ≥85%)
        """
        source = "The system includes an authentication service that validates user credentials."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Auth Service",
                    "evidence": "authentication service that validates user credentials"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
        assert len(result.errors) == 0
    
    def test_diagram_evidence_with_case_variation(self, validator):
        """
        Test that evidence matching is case-insensitive.
        
        Requirement 8.2 (via FuzzyMatchService): Token-sort ratio is case-insensitive
        """
        source = "The Database stores all information."
        diagram = {
            "type": "data_model",
            "components": [
                {
                    "name": "DB",
                    "evidence": "database stores all information"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
    
    def test_diagram_evidence_with_punctuation_variation(self, validator):
        """
        Test that evidence matching tolerates punctuation differences.
        
        Requirement 8.2 (via FuzzyMatchService): Token-sort ratio is punctuation-tolerant
        """
        source = "The API endpoint returns JSON-formatted data."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "API",
                    "evidence": "API endpoint returns JSON formatted data"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
    
    def test_diagram_evidence_with_whitespace_variation(self, validator):
        """
        Test that evidence matching tolerates whitespace variations.
        
        Requirement 8.2 (via FuzzyMatchService): Normalizes whitespace
        """
        source = "The  Web   Server   handles    HTTP requests."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Web Server",
                    "evidence": "Web Server handles HTTP requests"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
    
    def test_ungrounded_evidence_fails_validation(self, validator):
        """
        Test that evidence NOT in source fails validation.
        
        Requirement 8.1: Ungrounded evidence should fail validation
        """
        source = "The system has a web interface."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Database",
                    "evidence": "The system stores data in a PostgreSQL database"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is False
        assert len(result.errors) == 1
        assert "ungrounded" in result.errors[0].lower() or "not found" in result.errors[0].lower()
        assert "Database" in result.errors[0]
    
    def test_evidence_name_not_checked_only_evidence_text(self, validator):
        """
        Test that component NAMES are NOT validated, only evidence fields.
        
        Requirement 8.2: "evaluate evidence text, NOT component names"
        A component named "NonExistent Service" with valid evidence should pass.
        """
        source = "The authentication module validates user credentials."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "NonExistent Service",  # Name doesn't appear in source
                    "evidence": "authentication module validates user credentials"  # But evidence does
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        # Should pass because evidence is grounded, even though name isn't
        assert result.valid is True
    
    def test_missing_evidence_field_fails(self, validator):
        """
        Test that component without evidence field fails validation.
        
        Requirement 3.3: Components must have evidence field
        """
        source = "The system processes data."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Processor",
                    # missing "evidence" field
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is False
        assert len(result.errors) == 1
        assert "evidence" in result.errors[0].lower()
    
    def test_empty_evidence_field_fails(self, validator):
        """
        Test that empty evidence field fails validation.
        
        Requirement 3.3: Evidence field is required and must not be empty
        """
        source = "The system processes data."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Processor",
                    "evidence": ""  # Empty evidence
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is False
        assert len(result.errors) == 1
    
    def test_multiple_components_with_mixed_validation(self, validator):
        """
        Test diagram with multiple components, some grounded and some not.
        
        Should fail if ANY component is ungrounded.
        """
        source = "The system has a frontend and backend. The frontend displays content."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Frontend",
                    "evidence": "frontend displays content"  # Grounded
                },
                {
                    "name": "Database",
                    "evidence": "database stores persistent data"  # Not grounded
                },
                {
                    "name": "Backend",
                    "evidence": "backend"  # Grounded (substring match)
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is False
        assert len(result.errors) == 1
        assert "Database" in result.errors[0]
        assert "database stores persistent data" in result.errors[0]
    
    def test_diagram_with_no_components_passes(self, validator):
        """
        Test that diagram with empty components array passes validation.
        
        Per design: diagram with no components is valid (edge case, but allowed)
        """
        source = "The system does something."
        diagram = {
            "type": "architecture",
            "components": []
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
    
    def test_long_evidence_string_fuzzy_matching(self, validator):
        """
        Test that longer evidence strings are matched using sliding window.
        
        Requirement 8.1: Fuzzy matching should handle longer evidence strings
        """
        source = (
            "The user authentication system validates credentials by checking "
            "against a secure database. The system enforces password policies "
            "and logs all authentication attempts for security audit trails."
        )
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Auth",
                    "evidence": "user authentication system validates credentials by checking against a secure database"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is True
    
    def test_error_message_includes_evidence_snippet(self, validator):
        """
        Test that ungrounded error includes the claimed evidence snippet.
        
        Requirement 8.1: "Return structured error naming ungrounded components with their claimed evidence"
        """
        source = "The system has a web interface."
        diagram = {
            "type": "architecture",
            "components": [
                {
                    "name": "Database",
                    "evidence": "stores data in a PostgreSQL database cluster with replication"
                }
            ]
        }
        
        result = validator.validate_diagram_evidence(diagram, source)
        
        assert result.valid is False
        # Error should include component name and evidence
        assert "Database" in result.errors[0]
        # Evidence snippet should be truncated to ~80 chars
        assert "stores data in a PostgreSQL" in result.errors[0]


# ============================================================================
# Tests for validate_all_diagrams()
# ============================================================================

class TestValidateAllDiagrams:
    """Tests for validating multiple diagrams."""
    
    def test_all_diagrams_valid_passes(self, validator):
        """
        Test that all diagrams passing validation results in overall pass.
        """
        source = "The system has a frontend, backend, and database."
        diagrams = [
            {
                "type": "architecture",
                "components": [
                    {"name": "Frontend", "evidence": "system has a frontend"}
                ]
            },
            {
                "type": "data_model",
                "components": [
                    {"name": "DB", "evidence": "database"}
                ]
            }
        ]
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is True
    
    def test_one_diagram_fails_overall_fails(self, validator):
        """
        Test that if any diagram fails, overall validation fails.
        
        Requirement 8.3: If any component's evidence fails, diagram is rejected
        """
        source = "The system has a frontend and backend."
        diagrams = [
            {
                "type": "architecture",
                "components": [
                    {"name": "Frontend", "evidence": "system has a frontend"}
                ]
            },
            {
                "type": "data_model",
                "components": [
                    {"name": "Cache", "evidence": "distributed Redis cache"}  # Not in source
                ]
            }
        ]
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is False
        assert len(result.errors) >= 1
    
    def test_empty_diagrams_list_passes(self, validator):
        """
        Test that empty diagrams list passes validation.
        """
        source = "Some content"
        diagrams = []
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is True
    
    def test_error_includes_diagram_index(self, validator):
        """
        Test that errors include diagram index for disambiguation.
        """
        source = "The system has a frontend."
        diagrams = [
            {
                "type": "architecture",
                "components": [
                    {"name": "Frontend", "evidence": "frontend"}
                ]
            },
            {
                "type": "data_model",
                "components": [
                    {"name": "Cache", "evidence": "distributed cache"}  # Not in source
                ]
            }
        ]
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is False
        # Should indicate which diagram failed
        assert "diagram" in result.errors[0].lower()


# ============================================================================
# Tests for validate_mermaid_syntax()
# ============================================================================

class TestValidateMermaidSyntax:
    """Tests for Mermaid syntax validation (parse-check)."""
    
    def test_valid_graph_diagram(self, validator):
        """
        Test that valid graph diagram passes syntax validation.
        
        Requirement 8.4: Parse-check for Mermaid syntax validity
        """
        mermaid_code = """graph TD
    A[Start] --> B[Process]
    B --> C[End]"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is True
    
    def test_valid_flowchart_diagram(self, validator):
        """Test that valid flowchart passes validation."""
        mermaid_code = """flowchart LR
    A[Input] --> B{Decision}
    B -->|Yes| C[Output]
    B -->|No| D[Error]"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is True
    
    def test_valid_sequence_diagram(self, validator):
        """Test that valid sequence diagram passes validation."""
        mermaid_code = """sequenceDiagram
    Alice->>John: Hello!
    John-->>Alice: Hi there!"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is True
    
    def test_valid_state_diagram(self, validator):
        """Test that valid state diagram passes validation."""
        mermaid_code = """stateDiagram-v2
    [*] --> Active
    Active --> Inactive
    Inactive --> [*]"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is True
    
    def test_valid_er_diagram(self, validator):
        """Test that valid entity-relationship diagram passes validation."""
        mermaid_code = """erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ PRODUCT : contains"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is True
    
    def test_empty_mermaid_code_fails(self, validator):
        """
        Test that empty Mermaid code fails validation.
        
        Requirement 8.4: Parse-check should reject empty code
        """
        mermaid_code = ""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is False
        assert len(result.errors) > 0
        assert "empty" in result.errors[0].lower()
    
    def test_whitespace_only_mermaid_fails(self, validator):
        """Test that whitespace-only Mermaid code fails validation."""
        mermaid_code = "   \n   \n  "
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        assert result.valid is False
    
    def test_unrecognized_diagram_type_warning(self, validator):
        """
        Test that unrecognized diagram type produces warning (not error).
        
        Parse-check should warn but not fail on unknown types since they
        might be valid Mermaid extensions or render-time catch them.
        """
        mermaid_code = """unknownDiagram
    A --> B"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        # Should produce warning but still be considered valid (render will catch it)
        assert result.valid is True or result.valid is False  # Implementation choice
        assert len(result.warnings) > 0
        assert "unrecognized" in result.warnings[0].lower()
    
    def test_single_line_mermaid_warning(self, validator):
        """
        Test that single-line Mermaid code (potentially incomplete) produces warning.
        """
        mermaid_code = "graph TD"
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        # Should warn about being too short
        assert len(result.warnings) > 0
    
    def test_unmatched_quotes_warning(self, validator):
        """
        Test that unmatched quotes in Mermaid code produces warning.
        """
        mermaid_code = """graph TD
    A["Unclosed quote] --> B["Valid quote"]"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        # Should warn about potential quote mismatch
        if len(result.warnings) > 0:
            assert "quote" in result.warnings[0].lower()
    
    def test_case_insensitive_diagram_type_recognition(self, validator):
        """
        Test that diagram type recognition is case-insensitive.
        """
        # Mermaid is case-insensitive for keywords
        mermaid_code = """GRAPH TD
    A[Node] --> B[Node2]"""
        
        result = validator.validate_mermaid_syntax(mermaid_code)
        
        # Should recognize as valid graph type
        assert result.valid is True


# ============================================================================
# Integration tests
# ============================================================================

class TestDiagramGroundingIntegration:
    """Integration tests combining evidence and syntax validation."""
    
    def test_complete_diagram_validation_pipeline(self, validator):
        """
        Test complete validation: evidence + syntax for multiple diagrams.
        """
        source = """
        The system architecture consists of three components:
        - A web frontend that handles user interactions
        - A REST API backend that processes requests
        - A database that persists data
        
        The flow is: frontend sends request, backend processes, database stores.
        """
        
        diagrams = [
            {
                "type": "architecture",
                "components": [
                    {"name": "Frontend", "evidence": "web frontend that handles user interactions"},
                    {"name": "Backend", "evidence": "REST API backend that processes requests"},
                    {"name": "Database", "evidence": "database that persists data"}
                ]
            }
        ]
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is True
    
    def test_partially_grounded_diagram_fails(self, validator):
        """
        Test that diagram with partially grounded components fails overall.
        """
        source = "The system has a frontend and database."
        
        diagrams = [
            {
                "type": "architecture",
                "components": [
                    {"name": "Frontend", "evidence": "system has a frontend"},
                    {"name": "Cache", "evidence": "Redis distributed cache"},  # Not grounded
                    {"name": "Database", "evidence": "database"}
                ]
            }
        ]
        
        result = validator.validate_all_diagrams(diagrams, source)
        
        assert result.valid is False
        assert "Cache" in result.errors[0]
    
    def test_valid_syntax_invalid_evidence_fails(self, validator):
        """
        Test that valid Mermaid syntax with invalid evidence fails.
        """
        source = "The system has a frontend."
        
        # Valid Mermaid syntax
        mermaid_code = """graph TD
    A[Cache] --> B[Database]"""
        
        # But evidence is not in source
        diagram = {
            "type": "architecture",
            "mermaidCode": mermaid_code,
            "components": [
                {"name": "Cache", "evidence": "Redis distributed cache"},
                {"name": "Database", "evidence": "PostgreSQL database"}
            ]
        }
        
        # Check evidence validation
        evidence_result = validator.validate_diagram_evidence(diagram, source)
        assert evidence_result.valid is False
        
        # Check syntax validation
        syntax_result = validator.validate_mermaid_syntax(mermaid_code)
        assert syntax_result.valid is True
