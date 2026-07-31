"""
Diagram Grounding Validator

Validates diagram component evidence against source using fuzzy matching.
DOES NOT parse component names from Mermaid code — validates the evidence field the AI provided.

Per Requirement 8 (Diagram Grounding):
- FOR EACH diagram component, fuzzy match component's evidence field against source (≥85%)
- Evaluate evidence text ONLY, NOT component names
- Return structured error naming ungrounded components with their claimed evidence
- Test-render each diagram's mermaidCode for syntax validity (parse-check)
- NEVER ask AI to judge diagram accuracy — evidence matching is automatic
"""

import logging
import re
from typing import List, Tuple
from app.validators.fuzzy_match_service import FuzzyMatchService
from app.models.enriched_json import ValidationResult

logger = logging.getLogger(__name__)


class DiagramGroundingValidator:
    """
    Validates diagram component evidence against source text using fuzzy matching.
    
    This validator checks that evidence fields (not component names) for diagram
    components exist in the source markdown with ≥85% fuzzy similarity.
    """
    
    # Valid Mermaid diagram type declarations
    VALID_MERMAID_TYPES = {
        'graph', 'flowchart', 'sequencediagram', 'sequence', 'classDiagram',
        'class', 'statediagram', 'state', 'statediagram-v2', 'erdiagram',
        'er', 'journey', 'gantt', 'pie', 'gitgraph', 'git', 'mindmap',
        'timeline', 'c4diagram', 'requirementDiagram', 'requirement'
    }
    
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        """
        Initialize validator with fuzzy matcher.
        
        Args:
            fuzzy_matcher: FuzzyMatchService instance for similarity comparison
        """
        self.fuzzy_matcher = fuzzy_matcher
    
    def validate_diagram_evidence(
        self, 
        diagram: dict, 
        source_markdown: str,
        diagram_id: str = None
    ) -> ValidationResult:
        """
        Check each component's evidence field against source (fuzzy ≥85%).
        
        Validates ONLY the evidence field, not the component name. A component
        with name "Auth Service" and evidence "system checks credentials" will
        pass if the evidence phrase appears in source, regardless of the name.
        
        Args:
            diagram: Dictionary containing diagram data with components
            source_markdown: Original markdown source text
            diagram_id: Optional identifier for the diagram in error messages
            
        Returns:
            ValidationResult with validation status and ungrounded components.
            If validation fails, errors list contains ungrounded components
            with their claimed evidence.
        """
        errors = []
        warnings = []
        ungrounded_components = []
        
        components = diagram.get('components', [])
        diagram_type = diagram.get('type', 'unknown')
        
        if not components:
            # Diagram with no components is valid (empty diagram)
            return ValidationResult(valid=True, errors=[], warnings=[])
        
        # Check each component's evidence
        for idx, component in enumerate(components):
            if not isinstance(component, dict):
                errors.append(
                    f"Diagram {diagram_id or idx}: "
                    f"Component at index {idx} is not a valid object"
                )
                continue
            
            component_name = component.get('name', f'component_{idx}')
            evidence = component.get('evidence', '')
            
            # Evidence field is required
            if not evidence or not isinstance(evidence, str):
                errors.append(
                    f"Diagram {diagram_id or idx}, Component '{component_name}': "
                    f"Missing or empty evidence field (required per Requirement 3.3)"
                )
                ungrounded_components.append((component_name, ''))
                continue
            
            # Check if evidence appears in source markdown (fuzzy match ≥85%)
            if not self._evidence_exists_in_source(evidence, source_markdown):
                # Evidence not found in source
                evidence_snippet = evidence[:80] if len(evidence) > 80 else evidence
                logger.warning(
                    "Diagram evidence ungrounded | diagram=%s component=%s "
                    "full_evidence=%r",
                    diagram_id, component_name, evidence,
                )
                errors.append(
                    f"Diagram {diagram_id or idx}, Component '{component_name}': "
                    f"Evidence ungrounded, not found in source. Claimed evidence: '{evidence_snippet}'"
                )
                ungrounded_components.append((component_name, evidence_snippet))
        
        if errors:
            return ValidationResult(
                valid=False,
                errors=errors,
                warnings=warnings
            )
        
        return ValidationResult(
            valid=True,
            errors=[],
            warnings=warnings
        )
    
    def validate_all_diagrams(
        self, 
        diagrams: List[dict], 
        source_markdown: str
    ) -> ValidationResult:
        """
        Validate evidence for all diagram components across multiple diagrams.
        
        Validates each diagram's components and their evidence fields. If any
        diagram fails validation, the overall validation fails with a list of
        all ungrounded components grouped by diagram.
        
        Args:
            diagrams: List of diagram dictionaries
            source_markdown: Original markdown source text
            
        Returns:
            ValidationResult with combined validation status and all errors.
            If valid=False, errors list contains ungrounded components grouped by diagram.
        """
        all_errors = []
        all_warnings = []
        
        if not diagrams:
            # No diagrams to validate
            return ValidationResult(valid=True, errors=[], warnings=[])
        
        for diagram_idx, diagram in enumerate(diagrams):
            result = self.validate_diagram_evidence(
                diagram, 
                source_markdown,
                diagram_id=f"[diagram_{diagram_idx}]"
            )
            if not result.valid:
                all_errors.extend(result.errors)
            all_warnings.extend(result.warnings)
        
        if all_errors:
            return ValidationResult(
                valid=False,
                errors=all_errors,
                warnings=all_warnings
            )
        
        return ValidationResult(
            valid=True,
            errors=[],
            warnings=all_warnings
        )
    
    def validate_mermaid_syntax(self, mermaid_code: str) -> ValidationResult:
        """
        Parse-check Mermaid syntax for validity.
        
        Performs basic syntax validation by checking:
        - Non-empty code
        - Valid diagram type declaration on first line
        - Basic structural validity (opening declarations, etc.)
        
        This is a parse-check, not full Mermaid validation. Full validation
        would require running the actual Mermaid parser.
        
        Args:
            mermaid_code: Mermaid diagram code to validate
            
        Returns:
            ValidationResult with syntax validation status.
            Errors indicate syntax problems that would prevent rendering.
        """
        errors = []
        warnings = []
        
        # Check for empty code
        if not mermaid_code or not mermaid_code.strip():
            errors.append("Mermaid code is empty")
            return ValidationResult(valid=False, errors=errors, warnings=warnings)
        
        # Parse lines
        lines = mermaid_code.strip().split('\n')
        first_line = lines[0].strip()
        
        if not first_line:
            errors.append("First line of Mermaid code is empty")
            return ValidationResult(valid=False, errors=errors, warnings=warnings)
        
        # Check for valid diagram type declaration on first line
        first_word = first_line.split()[0] if first_line.split() else ''
        first_word_lower = first_word.lower()
        
        # Check if first word is a valid Mermaid type (case-insensitive)
        has_valid_type = any(
            first_word_lower.startswith(vtype.lower()) 
            for vtype in self.VALID_MERMAID_TYPES
        )
        
        if not has_valid_type:
            warnings.append(
                f"Unrecognized Mermaid diagram type in first line: '{first_line}'. "
                f"Expected one of: graph, flowchart, sequenceDiagram, stateDiagram, etc. "
                f"This may still be valid Mermaid syntax, but will be caught at render time."
            )
        
        # Basic structural checks
        # Most Mermaid diagrams should have multiple lines
        if len(lines) < 2:
            warnings.append(
                "Mermaid code appears very short (single line). "
                "This may be incomplete or render as an empty diagram."
            )
        
        # Check for matching quotes/brackets if present
        code_combined = " ".join(lines)
        
        # Count quotes (not strict, just warning about potential issues)
        single_quotes = code_combined.count("'")
        double_quotes = code_combined.count('"')
        
        if (single_quotes % 2 != 0) or (double_quotes % 2 != 0):
            warnings.append(
                "Mermaid code contains unmatched quotes. This may be a syntax error."
            )
        
        # Return valid even with warnings — warnings allow render-time validation
        return ValidationResult(
            valid=True,
            errors=errors,
            warnings=warnings
        )
    
    def _evidence_exists_in_source(
        self, 
        evidence: str, 
        source_markdown: str,
        threshold: float = 0.85
    ) -> bool:
        """
        Check if evidence text appears in source markdown using fuzzy matching.

        Uses partial-ratio matching to find the best-aligning span of the
        source for the evidence, which tolerates trivial rewording,
        punctuation differences, and case variations without penalizing the
        score for all the *other* unrelated content elsewhere in the source
        (see FuzzyMatchService.partial_match for why token_sort_ratio /
        manual word-windowing was the wrong tool here: a genuinely-quoted
        20-30 word excerpt checked against an entire multi-paragraph source
        scored as low as 25-35% with that approach, since token_sort_ratio
        compares two strings as wholes rather than finding a substring
        alignment - causing correctly-grounded evidence to be rejected).

        Args:
            evidence: Evidence text to search for
            source_markdown: Source markdown to search in
            threshold: Fuzzy matching threshold (0.0-1.0), defaults to 0.85

        Returns:
            True if evidence found with ≥threshold similarity, False otherwise
        """
        if not evidence or not isinstance(evidence, str):
            return False

        if not source_markdown or not isinstance(source_markdown, str):
            return False

        # Normalize case, punctuation, and whitespace for both strings (fuzzy
        # tolerance for casing/punctuation is part of Requirement 8's intent;
        # without stripping punctuation, "JSON-formatted" / "data." tokenize
        # differently than "JSON formatted" / "data" and spuriously fail).
        evidence_normalized = self._normalize_for_matching(evidence)
        source_normalized = self._normalize_for_matching(source_markdown)

        if not evidence_normalized or not source_normalized:
            return False

        # Fast path: exact/near-exact verbatim quotes.
        if evidence_normalized in source_normalized:
            return True

        # General case: does evidence align with some contiguous span of the
        # (much longer) source, tolerant of minor rewording within that span?
        if self.fuzzy_matcher.partial_match(evidence_normalized, source_normalized, threshold=threshold):
            return True

        # Last resort: a genuine excerpt that had a clause dropped from
        # partway through it (e.g. AI paraphrases "X validates the request
        # and publishes Y" down to "X publishes Y", omitting the middle
        # clause). partial_ratio requires one contiguous alignment window,
        # so this case still fails it even though it's not a fabrication -
        # see FuzzyMatchService.gapped_match's docstring for why its
        # density signal keeps this safe against evidence that recombines
        # real vocabulary from unrelated parts of the source into a false
        # claim.
        return self.fuzzy_matcher.gapped_match(evidence_normalized, source_normalized)

    def _normalize_for_matching(self, text: str) -> str:
        """Lowercase, collapse punctuation to spaces, and collapse whitespace,
        so trivial punctuation/casing differences never break a match."""
        text = re.sub(r"[^a-z0-9]+", " ", text.lower())
        return " ".join(text.split())
