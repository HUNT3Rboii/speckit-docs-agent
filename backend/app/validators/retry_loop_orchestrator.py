"""
Retry Loop Orchestrator

Manages the validation retry loop: structured errors → AI corrects → resubmits (max 2 attempts).

Per Requirement 10 (Retry Loop):
- WHEN Backend_Validator rejects part or all of Enriched_JSON, return structured error
- THE Extension_AI session SHALL receive this structured error and correct flagged items
- Allow maximum 2 retry attempts
- IF validation still fails after 2 retries, proceed with only validated portions
  and flag dropped items in artifact status
"""

from typing import List, Callable, Optional, Dict, Any
from dataclasses import dataclass, asdict
from app.models.enriched_json import ValidationResult, EnrichedJSON
from app.validators.enriched_json_validator import EnrichedJSONValidator
from app.validators.heading_preservation_validator import HeadingPreservationValidator
from app.validators.diagram_grounding_validator import DiagramGroundingValidator
from app.validators.glossary_term_validator import GlossaryTermValidator
from app.validators.fuzzy_match_service import FuzzyMatchService


@dataclass
class StructuredError:
    """
    Structured error response from validation failures.
    
    Contains specific, actionable information for the AI to correct:
    - Missing headings that don't fuzzy-match the original document
    - Ungrounded diagram components with their claimed evidence
    - Ungrounded glossary terms with their claimed evidence
    - Invalid Mermaid syntax with parser errors
    """
    
    valid: bool  # Whether overall validation passed
    retry_count: int  # Current retry attempt number
    errors: Dict[str, Any]  # Structured errors by category
    warnings: List[str] = None  # Non-fatal warnings
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'valid': self.valid,
            'retry_count': self.retry_count,
            'errors': self.errors,
            'warnings': self.warnings or []
        }


@dataclass
class ValidatedArtifact:
    """
    Result after validation and optional filtering.
    
    Contains validated portions of enriched JSON after validation,
    with removed entries flagged for dashboard visibility.
    """
    
    enriched_json: dict  # Validated enriched JSON
    dropped_items: Dict[str, List[str]] = None  # Dropped components/entries
    validation_warnings: List[str] = None  # Warnings from validation
    
    def __post_init__(self):
        if self.dropped_items is None:
            self.dropped_items = {}
        if self.validation_warnings is None:
            self.validation_warnings = []


class RetryLoopOrchestrator:
    """
    Orchestrates the validation retry loop with automatic error correction.
    
    Coordinates all validators (schema, heading, diagram, glossary) and manages
    the retry loop: validate → report structured errors → AI corrects → retry
    (max 2 attempts). After retry exhaustion, proceeds with validated portions only.
    """
    
    def __init__(
        self,
        max_retries: int = 2,
        fuzzy_threshold: float = 0.85
    ):
        """
        Initialize orchestrator with validators.
        
        Args:
            max_retries: Maximum number of retry attempts (default 2)
            fuzzy_threshold: Fuzzy matching threshold for validators (0.0-1.0)
        """
        self.max_retries = max_retries
        self.fuzzy_threshold = fuzzy_threshold
        
        # Initialize fuzzy matcher (shared by multiple validators)
        self.fuzzy_matcher = FuzzyMatchService(default_threshold=fuzzy_threshold)
        
        # Initialize validators
        self.json_validator = EnrichedJSONValidator()
        self.heading_validator = HeadingPreservationValidator(self.fuzzy_matcher)
        self.diagram_validator = DiagramGroundingValidator(self.fuzzy_matcher)
        self.glossary_validator = GlossaryTermValidator(self.fuzzy_matcher)
    
    def validate_with_retry(
        self,
        enriched_json: dict,
        source_markdown: str,
        ai_session_callback: Optional[Callable[[StructuredError], dict]] = None
    ) -> ValidatedArtifact:
        """
        Validate enriched JSON with automatic retry loop.
        
        Runs all validators in sequence:
        1. Schema validation (required fields, types, evidence fields)
        2. Heading preservation validation (≥85% fuzzy match)
        3. Diagram component evidence validation (≥85% fuzzy match)
        4. Glossary term evidence validation (≥85% fuzzy match)
        
        If validation fails and ai_session_callback is provided, returns structured
        error to AI for correction and retries validation. Allows maximum 2 retry
        attempts before proceeding with validated portions only.
        
        Args:
            enriched_json: Enriched JSON to validate
            source_markdown: Original markdown source text
            ai_session_callback: Optional callback function to send error to AI.
                Should accept StructuredError and return corrected enriched_json dict.
                If None, no retries are performed.
        
        Returns:
            ValidatedArtifact with validated portions and metadata about dropped items.
        
        Raises:
            ValueError: If enriched_json is not a dictionary
        """
        if not isinstance(enriched_json, dict):
            raise ValueError("enriched_json must be a dictionary")
        
        if not isinstance(source_markdown, str):
            raise ValueError("source_markdown must be a string")
        
        current_json = enriched_json
        retry_count = 0
        
        while retry_count <= self.max_retries:
            # Run all validators
            validation_results = self._run_all_validators(current_json, source_markdown)
            
            # Check if all validators passed
            if self._all_valid(validation_results):
                # Validation successful
                return ValidatedArtifact(
                    enriched_json=current_json,
                    dropped_items={},
                    validation_warnings=self._collect_warnings(validation_results)
                )
            
            # Validation failed
            if retry_count >= self.max_retries:
                # Retry exhausted: proceed with validated portions
                return self._proceed_with_validated(
                    current_json,
                    source_markdown,
                    validation_results
                )
            
            # Have retries remaining and AI callback available
            if ai_session_callback is None:
                # No callback: proceed with validated portions
                return self._proceed_with_validated(
                    current_json,
                    source_markdown,
                    validation_results
                )
            
            # Build structured error and ask AI to correct
            structured_error = self.build_structured_error(
                validation_results,
                retry_count=retry_count + 1
            )
            
            # Send error to AI and get corrected JSON
            try:
                corrected_json = ai_session_callback(structured_error)
                if isinstance(corrected_json, dict):
                    current_json = corrected_json
                    retry_count += 1
                    continue
            except Exception as e:
                # Callback failed: proceed with validated portions
                return self._proceed_with_validated(
                    current_json,
                    source_markdown,
                    validation_results
                )
            
            # Callback returned non-dict: proceed with validated portions
            return self._proceed_with_validated(
                current_json,
                source_markdown,
                validation_results
            )
        
        # Should not reach here, but fallback to validated portions
        validation_results = self._run_all_validators(current_json, source_markdown)
        return self._proceed_with_validated(
            current_json,
            source_markdown,
            validation_results
        )
    
    def build_structured_error(
        self,
        validation_results: Dict[str, ValidationResult],
        retry_count: int = 0
    ) -> StructuredError:
        """
        Create structured error with specific failures.
        
        Builds a structured error message that details exactly what failed,
        organized by category:
        - schema_errors: Missing required fields, type violations, evidence field issues
        - missing_headings: Original headings missing from enriched sections
        - ungrounded_diagrams: Diagram components with evidence not found in source
        - ungrounded_glossary: Glossary terms with evidence not found in source
        - mermaid_syntax_errors: Invalid Mermaid code that failed parse checks
        
        This error is sent back to the Extension_AI for correction.
        
        Args:
            validation_results: Dictionary of validation results from all validators
            retry_count: Current retry attempt number (for informational purposes)
        
        Returns:
            StructuredError with detailed, actionable error information
        """
        errors = {}
        all_warnings = []
        
        # Extract schema errors
        if 'schema' in validation_results:
            schema_result = validation_results['schema']
            if not schema_result.valid:
                errors['schema_errors'] = schema_result.errors
            all_warnings.extend(schema_result.warnings)
        
        # Extract heading errors (missing headings)
        if 'headings' in validation_results:
            heading_result = validation_results['headings']
            if not heading_result.valid:
                errors['missing_headings'] = heading_result.errors
            all_warnings.extend(heading_result.warnings)
        
        # Extract diagram grounding errors (ungrounded components)
        if 'diagrams' in validation_results:
            diagram_result = validation_results['diagrams']
            if not diagram_result.valid:
                errors['ungrounded_diagrams'] = diagram_result.errors
            all_warnings.extend(diagram_result.warnings)
        
        # Extract glossary grounding errors (ungrounded terms)
        if 'glossary' in validation_results:
            glossary_result = validation_results['glossary']
            if not glossary_result.valid:
                errors['ungrounded_glossary'] = glossary_result.errors
            all_warnings.extend(glossary_result.warnings)
        
        # Check if overall validation is valid
        is_valid = self._all_valid(validation_results)
        
        return StructuredError(
            valid=is_valid,
            retry_count=retry_count,
            errors=errors,
            warnings=all_warnings
        )
    
    def proceed_with_validated(
        self,
        enriched_json: dict,
        source_markdown: str
    ) -> ValidatedArtifact:
        """
        After exhausting retries, return only validated portions.
        
        Filters out invalid diagrams and glossary entries, preserving the
        document structure while removing ungrounded content. Flags dropped
        items for dashboard visibility.
        
        This enables graceful degradation: even if some diagrams or glossary
        terms are ungrounded, the PDF still generates with the validated
        portions, and the dashboard shows what was dropped.
        
        Args:
            enriched_json: Enriched JSON to filter
            source_markdown: Original markdown source text
        
        Returns:
            ValidatedArtifact with filtered content and dropped item tracking
        """
        validation_results = self._run_all_validators(enriched_json, source_markdown)
        return self._proceed_with_validated(
            enriched_json,
            source_markdown,
            validation_results
        )
    
    def _proceed_with_validated(
        self,
        enriched_json: dict,
        source_markdown: str,
        validation_results: Dict[str, ValidationResult]
    ) -> ValidatedArtifact:
        """
        Internal method: Filter enriched JSON to remove invalid entries.
        
        Removes:
        - Diagrams with ungrounded components (entire diagram removed if any component fails)
        - Glossary entries with ungrounded evidence
        
        Preserves:
        - Document structure and sections
        - Heading text and content
        - Executive summary and per-section summaries
        - Valid diagrams and glossary entries
        
        Args:
            enriched_json: Enriched JSON to filter
            source_markdown: Original markdown source text
            validation_results: Validation results from all validators
        
        Returns:
            ValidatedArtifact with filtered JSON and dropped item tracking
        """
        filtered_json = dict(enriched_json)
        dropped_items = {
            'diagrams': [],
            'glossary_entries': []
        }
        
        # Filter diagrams: keep only those with fully grounded components
        original_diagrams = filtered_json.get('diagrams', [])
        filtered_diagrams = []
        
        if 'diagrams' in validation_results:
            diagram_result = validation_results['diagrams']
            if diagram_result.valid:
                # All diagrams valid, keep all
                filtered_diagrams = original_diagrams
            else:
                # Some diagrams have ungrounded components
                # For now, drop all ungrounded diagrams
                # In a more sophisticated implementation, we could try to filter
                # components, but the requirement says reject the diagram if any
                # component fails (Requirement 8.3)
                
                # Mark all diagrams as potentially dropped for now
                # (In practice, validation should have already flagged which are bad)
                for diagram in original_diagrams:
                    # Simple heuristic: if diagram validates individually, keep it
                    diagram_validation = self.diagram_validator.validate_diagram_evidence(
                        diagram,
                        source_markdown
                    )
                    if diagram_validation.valid:
                        filtered_diagrams.append(diagram)
                    else:
                        dropped_items['diagrams'].append(
                            diagram.get('title', diagram.get('type', 'unknown'))
                        )
        else:
            # No diagram validation result, keep all (shouldn't happen)
            filtered_diagrams = original_diagrams
        
        filtered_json['diagrams'] = filtered_diagrams
        
        # Filter glossary: keep only entries with grounded evidence
        original_glossary = filtered_json.get('glossary', [])
        filtered_glossary = []
        
        if 'glossary' in validation_results:
            glossary_result = validation_results['glossary']
            if glossary_result.valid:
                # All entries valid, keep all
                filtered_glossary = original_glossary
            else:
                # Some entries have ungrounded evidence
                # Check each entry individually
                for entry in original_glossary:
                    entry_validation = self.glossary_validator.validate_entry_evidence(
                        entry,
                        source_markdown
                    )
                    if entry_validation.valid:
                        filtered_glossary.append(entry)
                    else:
                        dropped_items['glossary_entries'].append(entry.get('term', 'unknown'))
        else:
            # No glossary validation result, keep all (shouldn't happen)
            filtered_glossary = original_glossary
        
        filtered_json['glossary'] = filtered_glossary
        
        # Collect warnings from all validators
        all_warnings = self._collect_warnings(validation_results)
        
        return ValidatedArtifact(
            enriched_json=filtered_json,
            dropped_items=dropped_items,
            validation_warnings=all_warnings
        )
    
    def run_validators(
        self,
        enriched_json: dict,
        source_markdown: str
    ) -> Dict[str, ValidationResult]:
        """
        Public entry point to run all validators a single time, without
        engaging the retry loop.

        Intended for callers (e.g. an HTTP endpoint) that drive retries
        themselves across separate requests rather than via a synchronous
        ai_session_callback — see is_fully_valid() and build_structured_error()
        to interpret the result, and proceed_with_validated() for graceful
        degradation once retries are exhausted.

        Args:
            enriched_json: Enriched JSON to validate
            source_markdown: Original markdown source text

        Returns:
            Dictionary of validation results keyed by validator name
        """
        return self._run_all_validators(enriched_json, source_markdown)

    def is_fully_valid(self, validation_results: Dict[str, ValidationResult]) -> bool:
        """
        Public check for whether every validator in a results dict passed.

        Args:
            validation_results: Result of run_validators()

        Returns:
            True if all validators passed, False otherwise
        """
        return self._all_valid(validation_results)

    def collect_warnings(self, validation_results: Dict[str, ValidationResult]) -> List[str]:
        """
        Public accessor for all warnings collected across validators.

        Args:
            validation_results: Result of run_validators()

        Returns:
            List of all warning messages
        """
        return self._collect_warnings(validation_results)

    def _run_all_validators(
        self,
        enriched_json: dict,
        source_markdown: str
    ) -> Dict[str, ValidationResult]:
        """
        Run all validators in sequence.
        
        Args:
            enriched_json: Enriched JSON to validate
            source_markdown: Original markdown source text
        
        Returns:
            Dictionary of validation results keyed by validator name
        """
        results = {}
        
        # 1. Schema validation
        results['schema'] = self.json_validator.validate_schema(enriched_json)
        
        # 2. Heading preservation validation
        markdown_headings = self.heading_validator.extract_markdown_headings(source_markdown)
        json_headings = self.heading_validator.extract_json_headings(enriched_json)
        results['headings'] = self.heading_validator.validate_preservation(
            markdown_headings,
            json_headings
        )
        
        # 3. Diagram grounding validation
        diagrams = enriched_json.get('diagrams', [])
        results['diagrams'] = self.diagram_validator.validate_all_diagrams(
            diagrams,
            source_markdown
        )
        
        # 4. Glossary term validation
        glossary = enriched_json.get('glossary', [])
        results['glossary'] = self.glossary_validator.validate_all_entries(
            glossary,
            source_markdown
        )
        
        return results
    
    def _all_valid(self, validation_results: Dict[str, ValidationResult]) -> bool:
        """
        Check if all validators passed.
        
        Args:
            validation_results: Dictionary of validation results
        
        Returns:
            True if all results are valid, False otherwise
        """
        for result in validation_results.values():
            if not result.valid:
                return False
        return True
    
    def _collect_warnings(self, validation_results: Dict[str, ValidationResult]) -> List[str]:
        """
        Collect all warnings from all validators.
        
        Args:
            validation_results: Dictionary of validation results
        
        Returns:
            List of all warning messages
        """
        warnings = []
        for result in validation_results.values():
            if result.warnings:
                warnings.extend(result.warnings)
        return warnings
