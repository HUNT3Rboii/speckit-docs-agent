"""
Enriched JSON Validator

Validates that AI output conforms to expected schema, including evidence fields.
Uses Pydantic for schema validation.
"""

from typing import List
from pydantic import ValidationError
from app.models.enriched_json import EnrichedJSON, ValidationResult


class EnrichedJSONValidator:
    """Validates enriched JSON schema compliance."""
    
    def validate_schema(self, enriched_json: dict) -> ValidationResult:
        """
        Validate required fields, types, and evidence fields.
        
        Args:
            enriched_json: Dictionary containing enriched JSON data
            
        Returns:
            ValidationResult with validation status and errors
        """
        errors = []
        
        try:
            # Use Pydantic to validate schema
            EnrichedJSON(**enriched_json)
            
            # Additional evidence field validation
            evidence_result = self.validate_evidence_fields(enriched_json)
            if not evidence_result.valid:
                errors.extend(evidence_result.errors)
            
            if errors:
                return ValidationResult(
                    valid=False,
                    errors=errors,
                    warnings=[]
                )
            
            return ValidationResult(
                valid=True,
                errors=[],
                warnings=[]
            )
            
        except ValidationError as e:
            # Extract specific field-level errors from Pydantic
            for error in e.errors():
                field_path = " -> ".join(str(loc) for loc in error['loc'])
                error_msg = f"Field '{field_path}': {error['msg']}"
                errors.append(error_msg)
            
            return ValidationResult(
                valid=False,
                errors=errors,
                warnings=[]
            )
    
    def validate_evidence_fields(self, enriched_json: dict) -> ValidationResult:
        """
        Ensure all diagrams have components[] with evidence, all glossary entries have evidence.
        
        Args:
            enriched_json: Dictionary containing enriched JSON data
            
        Returns:
            ValidationResult with validation status and errors
        """
        errors = []
        
        # Validate diagram components have evidence
        diagrams = enriched_json.get('diagrams', [])
        for idx, diagram in enumerate(diagrams):
            components = diagram.get('components', [])
            if not components:
                errors.append(f"Diagram {idx} (type: {diagram.get('type', 'unknown')}): Missing components array")
            else:
                for comp_idx, component in enumerate(components):
                    if 'evidence' not in component or not component['evidence']:
                        errors.append(
                            f"Diagram {idx}, Component {comp_idx} (name: {component.get('name', 'unknown')}): "
                            f"Missing or empty evidence field"
                        )
        
        # Validate glossary entries have evidence
        glossary = enriched_json.get('glossary', [])
        for idx, entry in enumerate(glossary):
            if 'evidence' not in entry or not entry['evidence']:
                errors.append(
                    f"Glossary entry {idx} (term: {entry.get('term', 'unknown')}): "
                    f"Missing or empty evidence field"
                )
        
        if errors:
            return ValidationResult(
                valid=False,
                errors=errors,
                warnings=[]
            )
        
        return ValidationResult(
            valid=True,
            errors=[],
            warnings=[]
        )
    
    def get_validation_errors(self, validation_result: ValidationResult) -> List[str]:
        """
        Return specific field-level errors.
        
        Args:
            validation_result: ValidationResult from validation
            
        Returns:
            List of error messages
        """
        return validation_result.errors
