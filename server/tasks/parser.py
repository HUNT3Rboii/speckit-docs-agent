"""
Parses a Speckit/Kiro tasks.md file (see .specify/templates/tasks-template.md
for the authoritative format) into individual task records for the Kanban
board.

Format: `- [ ] T001 [P?] [Story] Description` under a `## Phase N: ...`
heading. Sub-headings (### Tests for User Story 1, etc.) don't start a new
phase - only the enclosing "## Phase ..." heading does, matching how the
tasks file itself groups work.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Exactly two leading '#' (not three - "### Tests for ..." sub-headings must
# not be treated as their own phase).
_PHASE_HEADING_RE = re.compile(r"^##(?!#)\s+(.+?)\s*$")
_TASK_LINE_RE = re.compile(r"^-\s*\[(?P<checkbox>[ xX])\]\s*(?P<task_key>T\d+)\s*(?P<rest>.*)$")
_PARALLEL_TAG_RE = re.compile(r"^\[P\]\s*(.*)$")
_STORY_TAG_RE = re.compile(r"^\[([A-Za-z0-9_-]+)\]\s*(.*)$")


def parse_tasks_markdown(markdown: str) -> List[Dict[str, Any]]:
    """
    Returns one dict per task, in file order:
    {task_key, phase, phase_order, parallel, story, description, checkbox_done}
    """
    tasks: List[Dict[str, Any]] = []
    current_phase: Optional[str] = None
    phase_order = -1

    for raw_line in markdown.split("\n"):
        heading_match = _PHASE_HEADING_RE.match(raw_line)
        if heading_match:
            current_phase = heading_match.group(1)
            phase_order += 1
            continue

        task_match = _TASK_LINE_RE.match(raw_line.strip())
        if not task_match:
            continue

        checkbox_done = task_match.group("checkbox").lower() == "x"
        task_key = task_match.group("task_key")
        rest = task_match.group("rest").strip()

        parallel = False
        parallel_match = _PARALLEL_TAG_RE.match(rest)
        if parallel_match:
            parallel = True
            rest = parallel_match.group(1).strip()

        story: Optional[str] = None
        story_match = _STORY_TAG_RE.match(rest)
        if story_match:
            story = story_match.group(1)
            rest = story_match.group(2).strip()

        tasks.append(
            {
                "task_key": task_key,
                "phase": current_phase or "Uncategorized",
                "phase_order": max(phase_order, 0),
                "parallel": parallel,
                "story": story,
                "description": rest,
                "checkbox_done": checkbox_done,
            }
        )

    return tasks
