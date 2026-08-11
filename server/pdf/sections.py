"""Classify a document's sections by what they contain.

The HTML pipeline typed every section - task, user story, design decision, or
ordinary prose - and the PDF grouped and labelled them accordingly. The
classification is heuristic and always was: it reads the shape of the content,
not a declaration, because nobody writing a spec labels their own sections.

Kept here rather than in the emitter so the rules can be read and tested on
their own; the emitter only decides how a typed section looks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

NORMAL = "normal"
TASK = "task"
USER_STORY = "user_story"
DESIGN_DECISION = "design_decision"

# `- [ ]` / `- [x]`, anywhere in the section.
_CHECKBOX = re.compile(r"^\s*[-*]\s*\[[ xX]\]", re.MULTILINE)

# "As a X, I want Y, so that Z" in any of its usual punctuations.
_USER_STORY = re.compile(r"\bas an?\s+.{2,60}?[,;]?\s+i want\b", re.IGNORECASE | re.DOTALL)

_DECISION_HEADING = re.compile(
    r"\b(decision|rationale|trade[- ]?offs?|alternatives|why\b|chose|considered)\b",
    re.IGNORECASE,
)
_DECISION_BODY = re.compile(
    r"\b(we (chose|decided|evaluated|rejected)|instead of|the trade-?off|rather than)\b",
    re.IGNORECASE,
)


@dataclass
class Section:
    heading: str
    level: int
    content: str
    type: str = NORMAL


def classify_section(heading: str, content: str) -> str:
    """Type one section.

    Order matters. A checklist is a task list even when it sits under a heading
    about decisions, because the checkboxes are the more specific signal.
    """
    if _CHECKBOX.search(content):
        return TASK
    if _USER_STORY.search(content):
        return USER_STORY
    if _DECISION_HEADING.search(heading) or _DECISION_BODY.search(content):
        return DESIGN_DECISION
    return NORMAL


def split_sections(markdown: str) -> List[Section]:
    """Break a document at its headings.

    Content before the first heading belongs to no section and is dropped from
    this view - the emitter renders the document itself, and this is only used
    to decide what each section *is*.
    """
    sections: List[Section] = []
    heading: Optional[str] = None
    level = 1
    body: List[str] = []

    def flush() -> None:
        if heading is not None:
            content = "\n".join(body).strip()
            sections.append(Section(heading=heading, level=level, content=content, type=classify_section(heading, content)))

    in_fence = False
    fence = ""

    for line in markdown.splitlines():
        stripped = line.strip()

        # Headings inside a code fence are code, not headings.
        fence_match = re.match(r"^(`{3,}|~{3,})", stripped)
        if fence_match:
            if not in_fence:
                in_fence, fence = True, fence_match.group(1)[0]
            elif stripped[0] == fence:
                in_fence = False
            body.append(line)
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.*\S)\s*$", line) if not in_fence else None
        if heading_match:
            flush()
            level = len(heading_match.group(1))
            heading = heading_match.group(2)
            body = []
            continue

        body.append(line)

    flush()
    return sections


def summaries_by_heading(summaries: Optional[Dict[str, str]]) -> Dict[str, str]:
    """Index per-section summaries by a normalised heading.

    The model is asked for summaries keyed by heading text, and it will not
    reproduce punctuation and casing exactly. Matching on a normalised key means
    "Request Flow" still finds "request flow:".
    """
    if not summaries:
        return {}

    return {
        re.sub(r"[^a-z0-9]+", " ", str(key).lower()).strip(): str(value).strip()
        for key, value in summaries.items()
        if str(value).strip()
    }


def summary_for(heading: str, indexed: Dict[str, str]) -> Optional[str]:
    return indexed.get(re.sub(r"[^a-z0-9]+", " ", heading.lower()).strip())


__all__ = [
    "DESIGN_DECISION",
    "NORMAL",
    "TASK",
    "USER_STORY",
    "Section",
    "classify_section",
    "split_sections",
    "summaries_by_heading",
    "summary_for",
]
