from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    import httpx
except Exception:  # pragma: no cover
    httpx = None

from app.services.agent_integration import AgentIntegrationService


class AgentTransformService:
    """
    Agentic transformation service that uses the active IDE AI agent for intelligent markdown parsing.
    
    Priority:
    1. IDE Agent (Copilot, Claude, Kiro) - uses whatever model you're already using
    2. Fallback to heuristics if agent unavailable
    
    Features:
    - Smart title extraction and improvement
    - Intelligent abstract generation
    - Context-aware section classification
    - Automatic content summarization
    """

    def __init__(self, model_endpoint: Optional[str] = None, model_name: Optional[str] = None, api_key: Optional[str] = None) -> None:
        # IDE Agent Integration (Primary)
        self.agent_integration = AgentIntegrationService()
        
        # External API Configuration (Fallback)
        self.model_endpoint = model_endpoint or os.getenv("SPECKIT_MODEL_ENDPOINT") or "https://api.openai.com/v1/chat/completions"
        self.model_name = model_name or os.getenv("SPECKIT_MODEL_NAME") or "gpt-4o-mini"
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.use_external_api = bool(self.api_key)

    def transform(self, source_path: str, raw_content: str, artifact_type: str) -> Dict[str, Any]:
        """
        Transform raw markdown into structured document using AI-powered analysis.
        
        Pipeline:
        1. Try IDE Agent (Copilot, Claude, Kiro) - uses your current model
        2. Try external API if configured (OpenAI, Azure, etc.)
        3. Fallback to rule-based heuristics
        """
        # Priority 1: Use IDE Agent (leverages user's existing AI model)
        try:
            agent_result = self.agent_integration.transform_markdown(source_path, raw_content, artifact_type)
            if agent_result:
                print(f"✅ AI-enhanced transformation via IDE agent: {source_path}")
                return self._merge_with_heuristics(agent_result, source_path, raw_content, artifact_type)
        except Exception as e:
            print(f"IDE agent transformation failed: {e}")

        # Priority 2: Use external API if configured
        if self.use_external_api and self._has_model_config():
            try:
                model_result = self._call_external_model(source_path, raw_content, artifact_type)
                if model_result:
                    print(f"✅ AI-enhanced transformation via external API: {source_path}")
                    return model_result
            except Exception as e:
                print(f"External API transformation failed: {e}")

        # Priority 3: Fallback to heuristics
        print(f"⚠️  Using rule-based transformation (AI unavailable): {source_path}")
        return self._heuristic_transform(source_path, raw_content, artifact_type)

    def _merge_with_heuristics(self, agent_result: Dict[str, Any], source_path: str, raw_content: str, artifact_type: str) -> Dict[str, Any]:
        """Merge AI results with heuristic fallbacks for missing fields."""
        return {
            "title": agent_result.get("title") or self._derive_title(source_path, raw_content),
            "abstract": agent_result.get("abstract") or self._derive_abstract(raw_content),
            "artifact_type": artifact_type,
            "source_path": source_path,
            "sections": agent_result.get("sections") or self._build_sections(raw_content, artifact_type),
            "headings": self._extract_headings(raw_content),
            "ai_enhanced": agent_result.get("ai_enhanced", True),
            "agent_source": agent_result.get("agent_source", "ide_agent")
        }

    def _has_model_config(self) -> bool:
        return bool(self.model_endpoint and self.api_key)

    def _call_external_model(self, source_path: str, raw_content: str, artifact_type: str) -> Optional[Dict[str, Any]]:
        """
        Use external API (OpenAI, Azure, etc.) to intelligently transform markdown.
        This is a fallback when IDE agent is unavailable.
        """
        if httpx is None:
            return None

        # Build intelligent prompt for AI agent
        system_prompt = """You are an expert documentation agent specializing in technical specification analysis.

Your task is to transform raw markdown documents into well-structured, professional documentation with:

1. **Title**: Extract or generate a clear, descriptive title
   - Use first heading if meaningful
   - Improve generic titles (e.g., "spec" → "Feature Specification")
   - Keep technical accuracy

2. **Abstract**: Create a concise summary (2-3 sentences)
   - Capture document's main purpose
   - Highlight key points or scope
   - Be specific, not generic

3. **Sections**: Intelligently classify each section
   - **task**: Contains action items, todos, or implementation steps
   - **user_story**: User-facing requirements or personas
   - **design_decision**: Architecture, design choices, or technical decisions
   - **normal**: General content, descriptions, or background

4. **Preserve content**: Keep original markdown structure, just enhance metadata

Return valid JSON in this exact format:
{
  "title": "Clear Document Title",
  "abstract": "Brief 2-3 sentence summary of the document's purpose and scope.",
  "sections": [
    {
      "heading": "Section Name",
      "content": "Full section content preserved",
      "type": "task|user_story|design_decision|normal"
    }
  ]
}"""

        user_prompt = f"""Analyze and transform this markdown document:

**Source Path**: {source_path}
**Document Type**: {artifact_type}

**Markdown Content**:
```markdown
{raw_content}
```

Transform this into structured documentation with enhanced title, abstract, and classified sections."""

        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.3,  # Lower temperature for more consistent output
            "response_format": {"type": "json_object"}  # Force JSON response
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            response = httpx.post(
                self.model_endpoint,
                json=payload,
                headers=headers,
                timeout=30.0  # Allow time for AI processing
            )
            response.raise_for_status()
            data = response.json()
            
            # Extract AI response
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                return None
            
            parsed = json.loads(content)
            
            # Validate and enhance AI response
            return {
                "title": parsed.get("title") or self._derive_title(source_path, raw_content),
                "abstract": parsed.get("abstract") or self._derive_abstract(raw_content),
                "artifact_type": artifact_type,
                "source_path": source_path,
                "sections": parsed.get("sections") or self._build_sections(raw_content, artifact_type),
                "headings": self._extract_headings(raw_content),
                "ai_enhanced": True  # Mark as AI-processed
            }
        except Exception as e:
            print(f"AI model call failed: {e}")
            return None

    def _heuristic_transform(self, source_path: str, raw_content: str, artifact_type: str) -> Dict[str, Any]:
        """
        Fallback rule-based transformation when AI is unavailable.
        Uses heuristics and pattern matching for structure extraction.
        """
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
            "ai_enhanced": False  # Mark as rule-based
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
