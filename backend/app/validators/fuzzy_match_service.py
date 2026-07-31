"""
Fuzzy Match Service

Provides fuzzy string matching for validation (tolerates rewording/punctuation/casing).
Uses token-sort ratio algorithm for similarity comparison.
"""

import difflib
from typing import List, Optional
from rapidfuzz import fuzz


class FuzzyMatchService:
    """Service for fuzzy string matching with configurable thresholds."""
    
    def __init__(self, default_threshold: float = 0.85):
        """
        Initialize FuzzyMatchService.
        
        Args:
            default_threshold: Default similarity threshold (0.0-1.0), defaults to 0.85 (85%)
        """
        self.default_threshold = default_threshold
    
    def fuzzy_match(self, text1: str, text2: str, threshold: Optional[float] = None) -> bool:
        """
        Check if two texts are similar above threshold.
        
        Args:
            text1: First text to compare
            text2: Second text to compare
            threshold: Similarity threshold (0.0-1.0), uses default if not provided
            
        Returns:
            True if similarity score >= threshold, False otherwise
        """
        if threshold is None:
            threshold = self.default_threshold
        
        score = self.similarity_score(text1, text2)
        return score >= threshold
    
    def similarity_score(self, text1: str, text2: str) -> float:
        """
        Return similarity score using token-sort ratio.
        
        Normalizes whitespace and uses case-insensitive comparison.
        
        Args:
            text1: First text to compare
            text2: Second text to compare
            
        Returns:
            Similarity score from 0.0 (no match) to 1.0 (identical)
        """
        # Normalize whitespace and convert to lowercase for case-insensitive comparison
        normalized_text1 = " ".join(text1.lower().split())
        normalized_text2 = " ".join(text2.lower().split())
        
        # Use token_sort_ratio for order-independent matching
        # Returns 0-100, convert to 0.0-1.0
        score = fuzz.token_sort_ratio(normalized_text1, normalized_text2)
        return score / 100.0
    
    def partial_match(self, needle: str, haystack: str, threshold: Optional[float] = None) -> bool:
        """
        Check if `needle` closely aligns with some contiguous span of
        `haystack`, tolerant of extra surrounding content in `haystack`.

        Uses partial_ratio rather than token_sort_ratio, which is the right
        tool specifically for "does this short excerpt appear within this
        much longer document" - token_sort_ratio compares two strings as
        wholes (assuming they're roughly the same length/content), so a
        genuinely-quoted 20-word evidence excerpt checked against an entire
        multi-paragraph source scores extremely low (all of the source's
        *other* words count against it) even when the excerpt is a perfect
        quote. partial_ratio instead finds the best-aligning substring of
        the longer text, which is exactly what evidence-grounding needs.

        Args:
            needle: The (typically short) evidence text to search for
            haystack: The (typically much longer) source text to search within
            threshold: Similarity threshold (0.0-1.0), uses default if not provided

        Returns:
            True if the best-aligning span of haystack matches needle at or
            above threshold
        """
        if threshold is None:
            threshold = self.default_threshold

        return self.partial_similarity_score(needle, haystack) >= threshold

    def partial_similarity_score(self, needle: str, haystack: str) -> float:
        """
        Return the partial-ratio similarity between `needle` and the
        best-aligning span of `haystack`. See partial_match() for why this
        differs from similarity_score()/token_sort_ratio.

        Args:
            needle: The (typically short) evidence text to search for
            haystack: The (typically much longer) source text to search within

        Returns:
            Similarity score from 0.0 (no match) to 1.0 (identical)
        """
        normalized_needle = " ".join(needle.lower().split())
        normalized_haystack = " ".join(haystack.lower().split())

        score = fuzz.partial_ratio(normalized_needle, normalized_haystack)
        return score / 100.0

    def gapped_containment_score(self, needle: str, haystack: str) -> float:
        """
        Coverage-of-needle score, weighted by how tightly the matched parts
        cluster in haystack. Catches a genuine excerpt that had a clause
        dropped from partway through it - e.g. evidence "The Order Service
        publishes an OrderCreated event to the Event Bus" for source "The
        Order Service validates the request and publishes an OrderCreated
        event to the Event Bus" (the middle clause "validates the request
        and" is missing). partial_ratio requires ONE contiguous alignment
        window, so this kind of internal deletion still scores low there
        even though it's a legitimate quote, not a fabrication.

        Two signals via difflib.SequenceMatcher's matching blocks:
        - coverage: fraction of needle's characters found in haystack at all
        - density: matched-chars / span-in-haystack-those-blocks-occupy

        Density is what keeps this safe against fabrication that recombines
        real vocabulary from unrelated parts of a long document into a false
        claim: cherry-picked words scattered across a whole document occupy
        a huge span for the little content actually matched, so density (and
        therefore coverage * density) collapses toward 0 - unlike a genuine
        excerpt, whose matched pieces stay clustered in one small span of
        the source even when a middle clause is missing.

        Args:
            needle: The (typically short) evidence text to search for
            haystack: The (typically much longer) source text to search within

        Returns:
            Score from 0.0 (no meaningful match) to 1.0 (identical)
        """
        if not needle or not haystack:
            return 0.0

        matcher = difflib.SequenceMatcher(None, needle, haystack, autojunk=False)
        blocks = [b for b in matcher.get_matching_blocks() if b.size > 0]
        if not blocks:
            return 0.0

        matched = sum(b.size for b in blocks)
        span = (blocks[-1].b + blocks[-1].size) - blocks[0].b

        coverage = matched / len(needle)
        density = matched / span if span else 0.0
        return coverage * density

    def gapped_match(self, needle: str, haystack: str, threshold: float = 0.55) -> bool:
        """
        True if `needle` is a genuine (possibly internally-gapped) excerpt of
        `haystack`. Default threshold of 0.55 is deliberately not the spec's
        0.85: this check exists specifically to accept legitimate excerpts
        that score well below 0.85 on both similarity_score and partial_match
        (an internal clause deletion costs a lot on both those metrics), so
        it needs its own threshold, calibrated so genuine gapped quotes
        (observed 0.60-1.00 on real cases) stay well clear of fabricated
        content reusing real vocabulary (observed <=0.25 in adversarial
        testing, i.e. real content re-assembled out of order into a false
        claim). See gapped_containment_score() for why density prevents this
        being a fabrication loophole.

        Args:
            needle: The (typically short) evidence text to search for
            haystack: The (typically much longer) source text to search within
            threshold: Similarity threshold (0.0-1.0)

        Returns:
            True if the gapped-containment score is >= threshold
        """
        return self.gapped_containment_score(needle, haystack) >= threshold

    def find_best_match(
        self, 
        target: str, 
        candidates: List[str], 
        threshold: Optional[float] = None
    ) -> Optional[str]:
        """
        Find best matching candidate above threshold.
        
        Args:
            target: Text to find match for
            candidates: List of candidate texts
            threshold: Similarity threshold (0.0-1.0), uses default if not provided
            
        Returns:
            Best matching candidate if above threshold, None otherwise
        """
        if threshold is None:
            threshold = self.default_threshold
        
        if not candidates:
            return None
        
        best_match = None
        best_score = 0.0
        
        for candidate in candidates:
            score = self.similarity_score(target, candidate)
            if score > best_score and score >= threshold:
                best_score = score
                best_match = candidate
        
        return best_match
