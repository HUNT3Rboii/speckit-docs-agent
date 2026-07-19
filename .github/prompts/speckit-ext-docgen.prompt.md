---
name: speckit.ext.docgen
description: Generate PDF documentation from the active markdown file
tags: [documentation, pdf, generation, docs-agent]
---

# Generate Documentation from Markdown

You are helping generate PDF documentation from a markdown spec file using the Documentation Agent extension.

## Task

Generate a PDF document from the currently active markdown file:

1. **Read the active file** - Get the content of the markdown file currently open in the editor
2. **Extract metadata**:
   - File path (relative to workspace root)
   - File content (full markdown text)
3. **Load configuration** from `.specify/extensions/docs-agent/config.yml`:
   - `api_base_url`
   - `api_key`
4. **Transform the markdown** into structured JSON:
   ```json
   {
     "title": "Extracted from first heading or filename",
     "abstract": "First paragraph of content",
     "artifact_type": "spec|plan|task|other",
     "source_path": "relative/path/to/file.md",
     "sections": [
       {
         "heading": "Section Heading",
         "content": "Section body content",
         "type": "task|user_story|design_decision|normal"
       }
     ]
   }
   ```
5. **Send to backend**:
   ```
   POST <api_base_url>/api/artifacts/ingest-structured
   Authorization: Bearer <api_key>
   Content-Type: application/json
   
   {
     "project_id": "<from_config_or_workspace>",
     "source_path": "relative/path/to/file.md",
     "structured_json": { ... },
     "commit_hash": "<current_git_commit_or_null>"
   }
   ```
6. **Report success** with artifact ID and version number

## Classification Rules

**Artifact Type** (by filename):
- `spec.md` or `requirements.md` → `spec`
- `plan.md` or `design.md` → `plan`  
- `tasks.md` or in `/tasks/` directory → `task`
- Everything else → `other`

**Section Type** (by content):
- Contains `- [ ]` or `- [x]` → `task`
- Contains "As a..., I want..., so that..." → `user_story`
- Heading contains "decision" or "design" → `design_decision`
- Everything else → `normal`

## Error Handling

- If no file is active, ask the user to open a markdown file first
- If config is missing, tell user to run `/speckit.ext.setup` first
- If validation fails, show the specific error from the backend
- If deduplication skips (content unchanged), inform the user

## Expected Response

```json
{
  "status": "ok",
  "artifact": {
    "id": "artifact-1",
    "source_path": "specs/feature/spec.md",
    "status": "rendered"
  },
  "version": {
    "version_no": 1,
    "pdf_path": "/app/pdf-output/artifact-1.pdf"
  }
}
```
