"""
Heading Preservation Validator

Ensures all original markdown headings appear in enriched sections using fuzzy matching.
"""

import re
from typing import List
from app.validators.fuzzy_match_service import FuzzyMatchService
from app.models.enriched_json import ValidationResult


class HeadingPreservationValidator:
    """Validates heading preservation with fuzzy matching."""
    
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        """
        Initialize validator with fuzzy matcher.
        
        Args:
            fuzzy_matcher: FuzzyMatchService instance for similarity comparison
        """
        self.fuzzy_matcher = fuzzy_matcher
    
    def extract_markdown_headings(self, markdown: str) -> List[str]:
        """
        Extract all headings from original markdown.
        
        Extracts heading text from # to ###### syntax.
        
        Args:
            markdown: Original markdown content
            
        Returns:
            List of heading texts in document order
        """
        headings = []
        
        # Match markdown headings (# through ######)
        # Pattern: start of line, 1-6 #, space, heading text
        pattern = r'^#{1,6}\s+(.+)$'
        
        for line in markdown.split('\n'):
            match = re.match(pattern, line.strip())
            if match:
                heading_text = match.group(1).strip()
                headings.append(heading_text)
        
        return headings
    
    def extract_json_headings(self, enriched_json: dict) -> List[str]:
        """
        Extract all section headings from enriched JSON.
        
        Args:
            enriched_json: Enriched JSON dictionary
            
        Returns:
            List of section headings in array order
        """
        sections = enriched_json.get('sections', [])
        return [section.get('heading', '') for section in sections]
    
    def validate_preservation(
        self, 
        original_headings: List[str], 
        enriched_headings: List[str]
    ) -> ValidationResult:
        """
        Check all original headings match enriched (fuzzy ≥85%).
        
        Args:
            original_headings: List of headings from original markdown
            enriched_headings: List of headings from enriched JSON
            
        Returns:
            ValidationResult with validation status and missing headings
        """
        errors = []
        warnings = []
        
        for original_heading in original_headings:
            # Try to find a fuzzy match in enriched headings
            best_match = self.fuzzy_matcher.find_best_match(
                original_heading,
                enriched_headings,
                threshold=0.85
            )
            
            if best_match is None:
                # Calculate best score for diagnostic purposes
                best_score = 0.0
                closest_match = None
                for enriched_heading in enriched_headings:
                    score = self.fuzzy_matcher.similarity_score(original_heading, enriched_heading)
                    if score > best_score:
                        best_score = score
                        closest_match = enriched_heading
                
                error_msg = (
                    f"Missing heading: '{original_heading}' "
                    f"(closest match: '{closest_match}' with {best_score:.2f} similarity)"
                )
                errors.append(error_msg)
        
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
