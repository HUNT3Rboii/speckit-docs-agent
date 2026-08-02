"""
Glossary Term Validator

Validates glossary entry evidence against source using fuzzy matching.
"""

import logging
import re
from typing import List
from app.validators.fuzzy_match_service import FuzzyMatchService
from app.models.enriched_json import ValidationResult

logger = logging.getLogger(__name__)


class GlossaryTermValidator:
    """Validates glossary entry evidence against source text."""
    
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        """
        Initialize validator with fuzzy matcher.
        
        Args:
            fuzzy_matcher: FuzzyMatchService instance for similarity comparison
        """
        self.fuzzy_matcher = fuzzy_matcher
    
    def validate_entry_evidence(
        self, 
        entry: dict, 
        source_markdown: str
    ) -> ValidationResult:
        """
        Check if entry's evidence field matches source (fuzzy ≥85%, case-insensitive).
        
        Args:
            entry: Dictionary containing glossary entry with term, definition, evidence
            source_markdown: Original markdown source text
            
        Returns:
            ValidationResult with validation status
        """
        errors = []
        warnings = []
        
        term = entry.get('term', 'unknown')
        evidence = entry.get('evidence', '')
        
        if not evidence:
            errors.append(f"Glossary term '{term}': Missing evidence field")
            return ValidationResult(valid=False, errors=errors, warnings=warnings)
        
        # Check if evidence appears in source markdown (fuzzy match ≥85%, case-insensitive)
        if not self._evidence_exists_in_source(evidence, source_markdown):
            logger.warning(
                "Glossary evidence ungrounded | term=%s full_evidence=%r",
                term, evidence,
            )
            errors.append(
                f"Glossary term '{term}': Evidence not found in source. "
                f"Claimed evidence: '{evidence[:100]}...'"
            )
            return ValidationResult(valid=False, errors=errors, warnings=warnings)
        
        return ValidationResult(
            valid=True,
            errors=[],
            warnings=warnings
        )
    
    def validate_all_entries(
        self, 
        glossary: List[dict], 
        source_markdown: str
    ) -> ValidationResult:
        """
        Validate evidence for all glossary entries.
        
        Iterates all glossary entries, collects validation errors, and filters out
        entries that fail validation.
        
        Args:
            glossary: List of glossary entry dictionaries
            source_markdown: Original markdown source text
            
        Returns:
            ValidationResult with combined validation status and filtered_data
            containing only valid entries
        """
        all_errors = []
        all_warnings = []
        valid_entries = []
        
        for entry in glossary:
            result = self.validate_entry_evidence(entry, source_markdown)
            if not result.valid:
                all_errors.extend(result.errors)
            else:
                # Keep only valid entries
                valid_entries.append(entry)
            all_warnings.extend(result.warnings)
        
        # Return result with filtered data (valid entries only)
        if all_errors:
            return ValidationResult(
                valid=False,
                errors=all_errors,
                warnings=all_warnings,
                filtered_data={"glossary": valid_entries}
            )
        
        return ValidationResult(
            valid=True,
            errors=[],
            warnings=all_warnings,
            filtered_data={"glossary": valid_entries}
        )
    
    def _evidence_exists_in_source(self, evidence: str, source_markdown: str) -> bool:
        """
        Check if evidence text appears in source markdown using fuzzy matching.
        Case-insensitive comparison.

        Uses substring containment first (handles exact/near-exact verbatim
        quotes regardless of length), then partial-ratio matching to find the
        best-aligning span of the source. Comparing short evidence directly
        against the *entire* (much longer) source via whole-string similarity
        (token_sort_ratio) is not used: it compares two strings as wholes, so
        a genuinely-quoted excerpt checked against an entire document scores
        very low (all the source's *other* unrelated content counts against
        it) even when the excerpt is a perfect quote - partial_ratio instead
        finds the best-aligning substring, which is the actual question being
        asked here ("does this excerpt appear somewhere in this document").

        Args:
            evidence: Evidence text to search for
            source_markdown: Source markdown to search in

        Returns:
            True if evidence found with ≥85% similarity, False otherwise
        """
        if not evidence or not isinstance(evidence, str):
            return False
        if not source_markdown or not isinstance(source_markdown, str):
            return False

        # Normalize case, punctuation, and whitespace (see
        # DiagramGroundingValidator._normalize_for_matching for why
        # punctuation is stripped, not just whitespace-collapsed).
        evidence_normalized = self._normalize_for_matching(evidence)
        source_normalized = self._normalize_for_matching(source_markdown)

        if not evidence_normalized or not source_normalized:
            return False

        # Fast path: exact/near-exact verbatim quotes.
        if evidence_normalized in source_normalized:
            return True

        # General case: does evidence align with some contiguous span of the
        # (much longer) source, tolerant of minor rewording within that span?
        if self.fuzzy_matcher.partial_match(evidence_normalized, source_normalized, threshold=0.85):
            return True

        # Third try: a genuine excerpt that had a clause dropped from
        # partway through it (see FuzzyMatchService.gapped_match's
        # docstring) - partial_ratio requires one contiguous alignment
        # window, so this case still fails it even though it's not a
        # fabrication.
        if self.fuzzy_matcher.gapped_match(evidence_normalized, source_normalized):
            return True

        # Last resort: the same problem for a LARGER deletion - citing only
        # one branch of a compound "X, or Y" sentence. See
        # sentence_scoped_match's docstring for why this needs its own,
        # stricter check rather than just loosening gapped_match's
        # threshold. Uses the ORIGINAL text so sentence boundaries survive.
        return self.fuzzy_matcher.sentence_scoped_match(evidence, source_markdown)

    def _normalize_for_matching(self, text: str) -> str:
        """Lowercase, collapse punctuation to spaces, and collapse whitespace,
        so trivial punctuation/casing differences never break a match."""
        text = re.sub(r"[^a-z0-9]+", " ", text.lower())
        return " ".join(text.split())
