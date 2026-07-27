#!/usr/bin/env python3
"""
Copilot Bridge Server

This server runs on the host machine and provides an HTTP API that the Docker
backend can call to communicate with GitHub Copilot in the IDE.

The bridge receives transformation requests from the backend and returns
AI-enhanced results from Copilot.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict, Optional


class CopilotBridgeHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Copilot bridge."""

    def do_POST(self) -> None:
        """Handle POST requests for AI transformation."""
        if self.path == "/transform":
            self._handle_transform()
        elif self.path == "/health":
            self._handle_health()
        else:
            self.send_error(404, "Not Found")

    def do_GET(self) -> None:
        """Handle GET requests."""
        if self.path == "/health":
            self._handle_health()
        else:
            self.send_error(404, "Not Found")

    def _handle_health(self) -> None:
        """Health check endpoint."""
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        response = {"status": "ok", "bridge": "copilot", "version": "1.0.0"}
        self.wfile.write(json.dumps(response).encode())

    def _handle_transform(self) -> None:
        """Handle transformation requests from backend."""
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            request_data = json.loads(body.decode())

            # Extract parameters
            source_path = request_data.get("source_path", "document.md")
            raw_content = request_data.get("raw_content", "")
            artifact_type = request_data.get("artifact_type", "other")
            system_prompt = request_data.get("system_prompt", "")
            user_prompt = request_data.get("user_prompt", "")

            print(f"\n{'='*80}")
            print(f"🤖 Copilot Bridge: Processing transformation request")
            print(f"📄 Source: {source_path}")
            print(f"📝 Type: {artifact_type}")
            print(f"📏 Content length: {len(raw_content)} chars")
            print(f"{'='*80}\n")

            # Try automatic Copilot invocation first
            ai_result = self._invoke_copilot_automatic(system_prompt, user_prompt)
            
            if ai_result:
                print(f"✅ Copilot processed automatically!")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(ai_result).encode())
                return

            # Fallback to manual workflow
            print(f"⚠️  Automatic Copilot invocation unavailable, creating manual workflow...")
            
            # Create workspace and files (existing manual code)
            workspace_dir = Path(os.getenv("COPILOT_BRIDGE_WORKSPACE", tempfile.gettempdir())) / "copilot-bridge"
            workspace_dir.mkdir(parents=True, exist_ok=True)

            md_file = workspace_dir / "transform-request.md"
            md_file.write_text(raw_content, encoding="utf-8")

            prompt_file = workspace_dir / "transform-prompt.txt"
            full_prompt = f"""{system_prompt}

---

{user_prompt}

---

IMPORTANT: Respond with ONLY valid JSON. No markdown code blocks, no explanations.
"""
            prompt_file.write_text(full_prompt, encoding="utf-8")

            meta_file = workspace_dir / "transform-meta.json"
            meta_file.write_text(json.dumps({
                "source_path": source_path,
                "artifact_type": artifact_type,
                "timestamp": time.time(),
                "status": "pending"
            }, indent=2), encoding="utf-8")

            # Check if response file exists (manual workflow)
            response_file = workspace_dir / "transform-response.json"
            if response_file.exists():
                response_data = json.loads(response_file.read_text(encoding="utf-8"))
                print(f"✅ Found existing response file!")
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
            else:
                print(f"⚠️  No automatic or manual response available.")
                
                self.send_response(202)  # Accepted, but processing
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                result = {
                    "status": "pending",
                    "message": "Manual Copilot processing required",
                    "workspace": str(workspace_dir),
                    "response_file": str(response_file)
                }
                self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            print(f"❌ Error processing request: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

    def _invoke_copilot_automatic(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """
        Attempt to automatically invoke AI via available methods.
        
        Tries in order:
        1. GitHub Copilot (via gh CLI if authenticated)
        2. OpenAI API (if OPENAI_API_KEY env var set)
        3. Anthropic API (if ANTHROPIC_API_KEY env var set)
        4. File-based IDE AI (fallback for other IDEs)
        """
        
        # Method 1: Try GitHub Copilot via CLI (AUTOMATIC with GitHub Copilot)
        result = self._try_github_copilot_cli(system_prompt, user_prompt)
        if result:
            return result
        
        # Method 2: Try OpenAI API (if user provided key)
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            result = self._try_openai_api(system_prompt, user_prompt, openai_key)
            if result:
                return result
        
        # Method 3: Try Anthropic Claude API (if user provided key)
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            result = self._try_anthropic_api(system_prompt, user_prompt, anthropic_key)
            if result:
                return result

        # Method 4: Try file-based IDE AI (fallback for other IDEs)
        result = self._try_file_based_ide_ai(system_prompt, user_prompt)
        if result:
            return result
        
        # No automatic method available
        print(f"ℹ️  No AI available. Using rule-based mode.")
        print(f"💡 To enable AI:")
        print(f"   - GitHub Copilot: Authenticate with 'gh auth login'")
        print(f"   - Or set OPENAI_API_KEY or ANTHROPIC_API_KEY")
        return None
    
    def _try_github_copilot_cli(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """
        Try GitHub Copilot via gh CLI.
        This works if user has 'gh' CLI installed and authenticated.
        """
        try:
            import subprocess
            import tempfile
            import os
            
            print(f"🤖 Trying GitHub Copilot via gh CLI...")
            
            # Create a temporary file with the prompt
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
                prompt_content = f"""{system_prompt}

{user_prompt}

IMPORTANT: Respond with ONLY valid JSON in this exact format:
{{
  "tasks": ["task 1", "task 2"],
  "user_stories": ["story 1", "story 2"],
  "design_decisions": ["decision 1", "decision 2"],
  "abstract": "brief summary",
  "metadata": {{"processed_by": "GitHub Copilot"}}
}}

No markdown code blocks, no explanations, just the JSON."""
                f.write(prompt_content)
                temp_file = f.name
            
            try:
                # Use gh CLI to invoke Copilot (use -p/--prompt for non-interactive mode)
                result = subprocess.run(
                    ["gh", "copilot", "-p", prompt_content],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    encoding='utf-8'
                )
                
                if result.returncode == 0:
                    response_text = result.stdout.strip()
                    
                    # Clean up response
                    response_text = response_text.replace('```json', '').replace('```', '').strip()
                    
                    # Try to extract JSON from response
                    try:
                        # Find JSON in response
                        start_idx = response_text.find('{')
                        end_idx = response_text.rfind('}')
                        
                        if start_idx != -1 and end_idx != -1:
                            json_str = response_text[start_idx:end_idx+1]
                            response_json = json.loads(json_str)
                            
                            # Ensure metadata exists
                            if 'metadata' not in response_json:
                                response_json['metadata'] = {}
                            response_json['metadata']['processed_by'] = 'GitHub Copilot'
                            
                            print(f"✅ GitHub Copilot CLI successful!")
                            return response_json
                    except (json.JSONDecodeError, ValueError) as e:
                        print(f"⚠️  Could not parse JSON from Copilot response: {e}")
                else:
                    print(f"⚠️  GitHub Copilot CLI returned error code: {result.returncode}")
                    if "not logged in" in result.stderr.lower() or "not authenticated" in result.stderr.lower():
                        print(f"💡 Run 'gh auth login' to authenticate GitHub CLI")
                
            finally:
                # Clean up temp file
                try:
                    os.unlink(temp_file)
                except:
                    pass
                    
        except FileNotFoundError:
            print(f"ℹ️  GitHub CLI (gh) not found in PATH")
        except subprocess.TimeoutExpired:
            print(f"⚠️  GitHub Copilot CLI timeout")
        except Exception as e:
            print(f"⚠️  GitHub Copilot CLI error: {e}")
        
        return None
    
    def _try_file_based_ide_ai(self, system_prompt: str, user_prompt: str) -> Optional[Dict[str, Any]]:
        """
        File-based communication with IDE's existing AI.
        Works with VS Code Copilot, Kiro Claude, Cursor, etc.
        
        How it works:
        1. Write request to .ai-requests/ in workspace
        2. IDE's AI assistant sees the file (via workspace context)
        3. AI writes response to .ai-responses/
        4. Bridge reads and returns response
        
        Zero setup required - uses whatever AI user has in their IDE!
        """
        try:
            # Get workspace directory (where user's project files are)
            workspace_dir = Path(os.getenv("AI_WORKSPACE_DIR", os.getcwd()))
            
            # Create request/response directories
            request_dir = workspace_dir / ".ai-requests"
            response_dir = workspace_dir / ".ai-responses"
            request_dir.mkdir(parents=True, exist_ok=True)
            response_dir.mkdir(parents=True, exist_ok=True)
            
            # Create unique request ID
            request_id = f"transform-{int(time.time() * 1000)}"
            
            # Write request file (IDE's AI can see this)
            request_file = request_dir / f"{request_id}.md"
            request_content = f"""# AI Transform Request

**Request ID**: {request_id}
**Status**: PENDING
**Timestamp**: {time.strftime('%Y-%m-%d %H:%M:%S')}

---

## Instructions for AI Assistant

{system_prompt}

{user_prompt}

---

## Response Format

Please create a file at: `.ai-responses/{request_id}.json`

With this structure (JSON only, no markdown blocks):

```json
{{
  "tasks": ["Task 1", "Task 2", ...],
  "user_stories": ["As a user...", ...],
  "design_decisions": ["Decision 1", ...],
  "abstract": "Brief summary of the document",
  "metadata": {{
    "processed_by": "Your AI name (e.g., Copilot, Claude)",
    "timestamp": "{time.time()}"
  }}
}}
```

**IMPORTANT**: 
- Create the response file at `.ai-responses/{request_id}.json`
- Use valid JSON only (no markdown blocks)
- Include all requested fields

---

## For IDE Users

If you see this file:
1. Your IDE's AI assistant (Copilot/Claude/etc.) can process it
2. Ask your AI: "Process the transform request in {request_file.name}"
3. Or set up your IDE to auto-process .ai-requests/ files

For automatic processing, create a simple IDE task/hook:
- **VS Code**: Use Tasks or Copilot workspace instructions
- **Kiro**: Use hooks or steering files
- **Other IDEs**: Use similar automation features
"""
            
            request_file.write_text(request_content, encoding="utf-8")
            print(f"📝 Created AI request file: {request_file}")
            print(f"💡 Your IDE's AI can process this automatically!")
            
            # Wait for response file (with timeout)
            response_file = response_dir / f"{request_id}.json"
            timeout = 60  # 60 seconds for manual Copilot processing
            poll_interval = 1  # Check every second
            elapsed = 0
            
            print(f"⏳ Waiting for VS Code Copilot response (max {timeout}s)...")
            print(f"💡 Open Copilot Chat in VS Code and say:")
            print(f"   'Process the AI request in .ai-requests/{request_id}.md'")
            print(f"")
            while elapsed < timeout:
                if response_file.exists():
                    # Response received!
                    response_data = json.loads(response_file.read_text(encoding="utf-8"))
                    
                    # Clean up files
                    request_file.unlink(missing_ok=True)
                    response_file.unlink(missing_ok=True)
                    
                    ai_name = response_data.get("metadata", {}).get("processed_by", "IDE AI")
                    print(f"✅ {ai_name} processed successfully!")
                    
                    return response_data
                
                time.sleep(poll_interval)
                elapsed += poll_interval
            
            # Timeout - clean up request file
            print(f"⏱️  Timeout waiting for IDE AI response")
            request_file.unlink(missing_ok=True)
            return None
            
        except Exception as e:
            print(f"⚠️  File-based IDE AI error: {e}")
            return None
    
    def _try_openai_api(self, system_prompt: str, user_prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        """Try OpenAI API."""
        try:
            import requests
            
            print(f"🔑 Using OpenAI API...")
            
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "gpt-4",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"{user_prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks."}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4000
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_text = result["choices"][0]["message"]["content"].strip()
                ai_text = ai_text.replace('```json', '').replace('```', '').strip()
                
                try:
                    response_json = json.loads(ai_text)
                    print(f"✅ OpenAI API successful!")
                    return response_json
                except json.JSONDecodeError as e:
                    print(f"⚠️  OpenAI response was not valid JSON: {e}")
                    return None
            else:
                print(f"⚠️  OpenAI API error: {response.status_code}")
                return None
                
        except ImportError:
            print(f"⚠️  'requests' module not installed")
        except Exception as e:
            print(f"⚠️  OpenAI API error: {e}")
        
        return None
    
    def _try_anthropic_api(self, system_prompt: str, user_prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        """Try Anthropic Claude API."""
        try:
            import requests
            
            print(f"🔑 Using Anthropic Claude API...")
            
            response = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01"
                },
                json={
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 4000,
                    "system": system_prompt,
                    "messages": [
                        {"role": "user", "content": f"{user_prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks."}
                    ]
                },
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                ai_text = result["content"][0]["text"].strip()
                ai_text = ai_text.replace('```json', '').replace('```', '').strip()
                
                try:
                    response_json = json.loads(ai_text)
                    print(f"✅ Anthropic Claude API successful!")
                    return response_json
                except json.JSONDecodeError as e:
                    print(f"⚠️  Claude response was not valid JSON: {e}")
                    return None
            else:
                print(f"⚠️  Anthropic API error: {response.status_code}")
                return None
                
        except ImportError:
            print(f"⚠️  'requests' module not installed")
        except Exception as e:
            print(f"⚠️  Anthropic API error: {e}")
        
        return None

    def log_message(self, format: str, *args: Any) -> None:
        """Override to customize logging."""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    """Start the Copilot bridge server."""
    host = os.getenv("COPILOT_BRIDGE_HOST", "0.0.0.0")
    port = int(os.getenv("COPILOT_BRIDGE_PORT", "5555"))
    
    server = HTTPServer((host, port), CopilotBridgeHandler)
    
    print(f"\n{'='*80}")
    print(f"🚀 Copilot Bridge Server")
    print(f"{'='*80}")
    print(f"📡 Listening on: http://{host}:{port}")
    print(f"🏥 Health check: http://{host}:{port}/health")
    print(f"🔄 Transform: http://{host}:{port}/transform (POST)")
    print(f"\n💡 Docker backend should use: http://host.docker.internal:{port}")
    print(f"{'='*80}\n")
    print(f"Press Ctrl+C to stop\n")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n\n{'='*80}")
        print(f"🛑 Shutting down Copilot Bridge Server")
        print(f"{'='*80}\n")
        server.shutdown()


if __name__ == "__main__":
    main()
