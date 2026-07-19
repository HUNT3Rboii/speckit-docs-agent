---
name: speckit.ext.status
description: View all artifacts and their processing status
tags: [status, list, docs-agent]
---

# View Documentation Agent Status

You are helping the user view the status of all processed markdown artifacts.

## Task

Display the current status of all artifacts in the Documentation Agent:

1. **Load configuration** from `.specify/extensions/docs-agent/config.yml`:
   - `api_base_url`
   - `api_key`
2. **Determine project ID** (from workspace name or config)
3. **Fetch artifacts**:
   ```
   GET <api_base_url>/api/projects/<project_id>/artifacts
   Authorization: Bearer <api_key>
   ```
4. **Display results** in a user-friendly format:
   ```
   Project: <project_name>
   
   Artifacts:
   ✓ specs/001-feature/spec.md [spec] - rendered (v2)
   ✓ specs/001-feature/plan.md [plan] - rendered (v1)
   ⧗ specs/002-feature/spec.md [spec] - stale (needs regeneration)
   ○ specs/003-feature/spec.md [spec] - pending
   ```

## Status Icons

- `✓` (rendered) - PDF successfully generated
- `⧗` (stale) - Content changed, needs regeneration  
- `○` (pending) - Not yet processed
- `✗` (failed) - Processing failed

## Display Format

For each artifact, show:
- Source path (relative to workspace)
- Artifact type in brackets
- Current status
- Latest version number (if rendered)

Group by status for better readability.

## Error Handling

- If config is missing, tell user to run `/speckit.ext.setup` first
- If project not found, suggest running setup again
- If backend unreachable, inform user to start backend services

## Expected API Response

```json
{
  "artifacts": [
    {
      "id": "artifact-1",
      "source_path": "specs/feature/spec.md",
      "artifact_type": "spec",
      "status": "rendered",
      "content_hash": "abc123..."
    }
  ]
}
```
