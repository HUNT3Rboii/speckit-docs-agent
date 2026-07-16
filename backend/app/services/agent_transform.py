from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    import httpx
except Exception:  # pragma: no cover
    httpx = None


class AgentTransformService:
    """An agent-style transformation service that can use a configured AI model and falls back to heuristics."""

    def __init__(self, model_endpoint: Optional[str] = None, model_name: Optional[str] = None) -> None:
        self.model_endpoint = model_endpoint or os.getenv("SPECKIT_MODEL_ENDPOINT")
        self.model_name = model_name or os.getenv("SPECKIT_MODEL_NAME") or "gpt-4.1-mini"

    def transform(self, source_path: str, raw_content: str, artifact_type: str) -> Dict[str, Any]:
        if self._has_model_config():
            model_result = self._call_model(source_path, raw_content, artifact_type)
            if model_result:
                return model_result

        return self._heuristic_transform(source_path, raw_content, artifact_type)

    def _has_model_config(self) -> bool:
        return bool(self.model_endpoint)

    def _call_model(self, source_path: str, raw_content: str, artifact_type: str) -> Optional[Dict[str, Any]]:
        if httpx is None:
            return None

        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a documentation agent. Turn markdown into a polished document plan with title, abstract, and grouped sections.",
                },
                {
                    "role": "user",
                    "content": json.dumps({
                        "source_path": source_path,
                        "artifact_type": artifact_type,
                        "markdown": raw_content,
                        "response_format": {
                            "title": "string",
                            "abstract": "string",
                            "sections": [
                                {"heading": "string", "content": "string", "type": "task|user_story|design_decision|normal"}
                            ],
                        },
                    }),
                },
            ],
        }

        try:
            response = httpx.post(self.model_endpoint, json=payload, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                return None
            parsed = json.loads(content)
            return {
                "title": parsed.get("title") or self._derive_title(source_path, raw_content),
                "abstract": parsed.get("abstract") or self._derive_abstract(raw_content),
                "artifact_type": artifact_type,
                "source_path": source_path,
                "sections": parsed.get("sections") or self._build_sections(raw_content, artifact_type),
                "headings": self._extract_headings(raw_content),
            }
        except Exception:
            return None

    def _heuristic_transform(self, source_path: str, raw_content: str, artifact_type: str) -> Dict[str, Any]:
        headings = self._extract_headings(raw_content)
        sections = self._build_sections(raw_content, artifact_type)
        title = self._derive_title(source_path, raw_content)
        abstract = self._derive_abstract(raw_content)
        return {
            "title": title,
            "abstract": abstract,
            "artifact_type": artifact_type,
            "source_path": source_path,
            "sections": sections,
            "headings": headings,
        }

    def _extract_headings(self, content: str) -> List[str]:
        headings = []
        for line in content.splitlines():
            if line.startswith("#") and line.strip():
                headings.append(line.strip().lstrip("#").strip())
        return headings

    def _derive_title(self, source_path: str, content: str) -> str:
        filename = source_path.split("/")[-1].replace(".md", "")
        first_heading = next((line.strip().lstrip("#").strip() for line in content.splitlines() if line.startswith("#") and line.strip()), None)
        if first_heading:
            return first_heading
        return filename.replace("-", " ").title()

    def _derive_abstract(self, content: str) -> str:
        lines = [line.strip() for line in content.splitlines() if line.strip()]
        for line in lines:
            if not line.startswith("#") and not re.match(r"^- \[[ xX]\]", line):
                return line[:220]
        return "Generated from repository markdown artifacts."

    def _build_sections(self, content: str, artifact_type: str) -> List[Dict[str, Any]]:
        sections: List[Dict[str, Any]] = []
        current_heading: str | None = None
        current_body: List[str] = []

        for line in content.splitlines():
            if line.startswith("#") and line.strip():
                if current_heading is not None:
                    sections.append(self._make_section(current_heading, "\n".join(current_body).strip(), artifact_type))
                current_heading = line.strip().lstrip("#").strip()
                current_body = []
            elif current_heading is not None:
                current_body.append(line)

        if current_heading is not None:
            sections.append(self._make_section(current_heading, "\n".join(current_body).strip(), artifact_type))

        if not sections:
            sections.append(self._make_section("Overview", content.strip() or "No content available.", artifact_type))

        return sections

    def _make_section(self, heading: str, body: str, artifact_type: str) -> Dict[str, Any]:
        section_type = self._infer_section_type(heading, body, artifact_type)
        return {"heading": heading, "content": body, "type": section_type}

    def _infer_section_type(self, heading: str, body: str, artifact_type: str) -> str:
        lower_heading = heading.lower()
        lower_body = body.lower()
        if "task" in lower_heading or re.search(r"^- \[[ xX]\]", body):
            return "task"
        if "story" in lower_heading or "as a" in lower_body and "i want" in lower_body:
            return "user_story"
        if "decision" in lower_heading or "design" in lower_heading:
            return "design_decision"
        if artifact_type == "task":
            return "task"
        return "normal"
