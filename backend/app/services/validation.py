from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


class ValidationError(Exception):
    def __init__(self, message: str, details: Optional[List[str]] = None) -> None:
        super().__init__(message)
        self.details = details or []


class ValidationService:
    def validate(self, source_path: str, structured_json: Dict[str, Any], source_content: Optional[str] = None) -> None:
        sections = structured_json.get("sections", [])
        headings = [section.get("heading") for section in sections if isinstance(section, dict)]
        if not isinstance(sections, list):
            raise ValidationError("sections must be a list", ["sections"])

        source_headings = self._extract_source_headings(source_path)
        if not source_headings and source_content:
            source_headings = self._extract_markdown_headings(source_content)
        if not source_headings:
            raise ValidationError("Missing headings from structured output", [source_path])

        missing = [heading for heading in source_headings if heading not in headings]
        if missing:
            raise ValidationError("Missing headings from structured output", missing)

        misclassified = self._find_misclassified_sections(sections)
        if misclassified:
            raise ValidationError("Misclassified task or user-story content", misclassified)

    def _extract_source_headings(self, source_path: str) -> List[str]:
        if not source_path.endswith(".md"):
            return []
        try:
            with open(source_path, "r", encoding="utf-8") as handle:
                return [line.strip().lstrip("#").strip() for line in handle if line.startswith("#") and line.strip()]
        except FileNotFoundError:
            return []

    def _extract_markdown_headings(self, source_content: str) -> List[str]:
        return [line.strip().lstrip("#").strip() for line in source_content.splitlines() if line.startswith("#") and line.strip()]

    def _find_misclassified_sections(self, sections: List[Dict[str, Any]]) -> List[str]:
        misclassified: List[str] = []
        for section in sections:
            content = str(section.get("content", ""))
            section_type = section.get("type")
            if self._looks_like_task(content) and section_type == "normal":
                misclassified.append(section.get("heading", "<unnamed>"))
            if self._looks_like_user_story(content) and section_type == "normal":
                misclassified.append(section.get("heading", "<unnamed>"))
        return misclassified

    def _looks_like_task(self, content: str) -> bool:
        return bool(re.search(r"^- \[[ xX]\]", content, re.MULTILINE))

    def _looks_like_user_story(self, content: str) -> bool:
        return bool(re.search(r"As a\s+.+?\s+, I want\s+.+?\s+, so that\s+", content, re.IGNORECASE))
