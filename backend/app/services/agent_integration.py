from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional


class AgentIntegrationService:
    """
    Integration with the active AI agent (Copilot, Claude, Kiro, etc.)
    
    This service delegates AI tasks to whatever model the user is currently using
    in their IDE, avoiding the need for separate API keys or endpoints.
    """

    def __init__(self) -> None:
        self.workspace_root = os.getenv("SPECKIT_WORKSPACE_ROOT")
        self.bridge_url = os.getenv("COPILOT_BRIDGE_URL", "http://host.docker.internal:5555")
        self.agent_available = self._check_agent_available()

    def _check_agent_available(self) -> bool:
        """Check if we can access the IDE agent via bridge."""
        try:
            import urllib.request
            req = urllib.request.Request(f"{self.bridge_url}/health", method="GET")
            with urllib.request.urlopen(req, timeout=2) as response:
                return response.status == 200
        except Exception:
            return False

    def call_agent(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """
        Call the active AI agent with a prompt.
        
        This uses the IDE's agent API to send prompts and get responses,
        leveraging whatever model the user has configured (Copilot, Claude, etc.)
        """
        if not self.agent_available:
            return None

        try:
            # Create a temporary prompt file for the agent
            prompt_content = f"""SYSTEM:
{system_prompt}

USER:
{user_prompt}

Respond with valid JSON only. No markdown code blocks, no explanations."""

            # For Spec Kit integration, we'll use the agent's context
            # This is a placeholder - actual implementation depends on IDE
            result = self._invoke_via_extension(prompt_content)
            return result
        except Exception as e:
            print(f"Agent call failed: {e}")
            return None

    def _invoke_via_extension(self, prompt: str) -> Optional[str]:
        """
        Invoke the AI agent via the bridge server with automatic Copilot invocation.
        
        The bridge server runs on the host machine and automatically triggers
        the IDE agent without manual intervention.
        """
        try:
            import urllib.request
            import urllib.parse
            
            # This will be populated by transform_markdown
            request_data = getattr(self, '_current_request', {})
            
            # Add automatic invocation flag
            request_data['auto_invoke'] = True
            
            data = json.dumps(request_data).encode('utf-8')
            req = urllib.request.Request(
                f"{self.bridge_url}/transform",
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=60) as response:  # Longer timeout for AI processing
                result = json.loads(response.read().decode('utf-8'))
                
                if result.get('status') == 'pending':
                    # Manual workflow - return None to fallback
                    print(f"⚠️  Copilot bridge requires manual processing")
                    print(f"   Workspace: {result.get('workspace')}")
                    print(f"   Instructions: {result.get('instructions')}")
                    return None
                
                if result.get('status') == 'success':
                    # Automatic invocation succeeded
                    print(f"✅ AI transformation completed automatically")
                    return json.dumps(result.get('data', result))
                
                return json.dumps(result)
                
        except Exception as e:
            print(f"Bridge invocation failed: {e}")
            return None

    def transform_markdown(self, source_path: str, raw_content: str, artifact_type: str) -> Optional[Dict[str, Any]]:
        """
        Use the active AI agent to transform markdown into structured document.
        """
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

        # Store request data for bridge invocation
        self._current_request = {
            "source_path": source_path,
            "raw_content": raw_content,
            "artifact_type": artifact_type,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt
        }

        response = self.call_agent(system_prompt, user_prompt)
        if not response:
            return None

        try:
            # Parse AI response
            # Remove markdown code blocks if present
            cleaned = response.strip()
            if cleaned.startswith("```"):
                lines = cleaned.split("\n")
                cleaned = "\n".join(lines[1:-1])
            
            parsed = json.loads(cleaned)
            return {
                "title": parsed.get("title"),
                "abstract": parsed.get("abstract"),
                "sections": parsed.get("sections"),
                "ai_enhanced": True,
                "agent_source": "ide_agent"
            }
        except Exception as e:
            print(f"Failed to parse agent response: {e}")
            return None
