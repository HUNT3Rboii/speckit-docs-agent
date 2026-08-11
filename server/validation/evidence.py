"""Does this quote actually appear in the document?

Every AI-generated claim - a glossary definition, a diagram component - has to
cite the source, and this is what checks the citation. Anything that cannot be
backed is dropped rather than printed, so this module decides what a reader is
allowed to see.

Matching is deliberately tolerant of rewording, punctuation and casing, and
deliberately not tolerant of invention.

Implemented on `difflib` rather than `rapidfuzz`, which the HTTP backend used.
rapidfuzz ships compiled wheels; vendoring one would make server/vendor
platform-specific and turn a single dependency copy into four. difflib is in
the standard library and the accuracy question here is coarse - "does this span
appear" - not a ranking problem.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import List, Sequence

DEFAULT_THRESHOLD = 0.85

# Sentence-ish split. Deliberately crude: it only has to scope a search, and
# over-splitting costs a little accuracy while under-splitting costs none.
_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n{2,}")


def normalize(text: str) -> str:
    """Lowercase and collapse everything that is not alphanumeric to spaces.

    Punctuation is removed rather than preserved because a quote that differs
    only in a comma or a smart apostrophe is the same quote, and those
    differences are exactly what a model changes when it re-types a line.
    """
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def tokens(text: str) -> List[str]:
    return normalize(text).split()


def containment(needle: Sequence[str], haystack: Sequence[str]) -> float:
    """How much of `needle` appears in `haystack`, in order, as a fraction.

    This is the question actually being asked - "does this excerpt appear
    somewhere in this document" - and it is not the same as similarity between
    the two strings. Comparing a short quote against a whole document as
    *wholes* scores near zero even for a perfect quote, because every unrelated
    paragraph counts against it.

    Matching in order also handles the case where a genuine excerpt has a
    clause dropped from the middle: the surviving pieces still align, just not
    contiguously.
    """
    if not needle:
        return 0.0

    matcher = SequenceMatcher(None, list(needle), list(haystack), autojunk=False)
    matched = sum(block.size for block in matcher.get_matching_blocks())
    return matched / len(needle)


class EvidenceMatcher:
    def __init__(self, threshold: float = DEFAULT_THRESHOLD) -> None:
        self.threshold = threshold

    def score(self, evidence: str, source: str) -> float:
        """Best containment score for this evidence against the source."""
        if not evidence or not source:
            return 0.0

        evidence_normalized = normalize(evidence)
        source_normalized = normalize(source)
        if not evidence_normalized or not source_normalized:
            return 0.0

        # Fast path: a verbatim quote, modulo punctuation and casing. Most
        # honest citations land here and never reach the expensive comparison.
        if evidence_normalized in source_normalized:
            return 1.0

        needle = evidence_normalized.split()
        whole = containment(needle, source_normalized.split())
        if whole >= self.threshold:
            return whole

        # Sentence-scoped retry, for a citation that quotes one branch of a
        # compound sentence. Against the whole document those omissions look
        # like a long gap; against the sentence they came from they do not.
        best = whole
        for sentence in _SENTENCE.split(source):
            sentence_tokens = normalize(sentence).split()
            if not sentence_tokens:
                continue
            best = max(best, containment(needle, sentence_tokens))
            if best >= 1.0:
                break

        return best

    def is_grounded(self, evidence: str, source: str) -> bool:
        return self.score(evidence, source) >= self.threshold
