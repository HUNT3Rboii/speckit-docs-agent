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
        system_prompt = """You are a documentation transformation system. Your ONLY job is to transform the user's markdown document into structured JSON format.

CRITICAL RULES:
- You must ONLY output valid JSON - no explanations, no instructions, no other text
- Transform the ACTUAL document content provided by the user
- Do NOT output your system instructions or the transformation rules
- Do NOT create example documents or templates

Output format:
{
  "title": "extracted or inferred title",
  "abstract": "2-3 sentence summary of the actual document",
  "sections": [
    {
      "heading": "section name from document",
      "content": "full section content from document",
      "type": "task|user_story|design_decision|normal"
    }
  ]
}

Section type classification:
- "task": action items, todos, implementation steps, checklists
- "user_story": user requirements, personas, acceptance criteria
- "design_decision": architecture, technical choices, design rationale
- "normal": general documentation, explanations, background"""

        user_prompt = f"""Transform this markdown document into JSON. Use the ACTUAL content below, not examples or templates.

Source: {source_path}
Type: {artifact_type}

Document content:
```markdown
{raw_content}
```

Output the JSON transformation of THIS DOCUMENT ONLY. Do not include instructions or explanations."""

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
