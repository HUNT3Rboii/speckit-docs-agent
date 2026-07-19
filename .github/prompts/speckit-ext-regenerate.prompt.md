---
name: speckit.ext.regenerate
description: Force regenerate a PDF for a specific artifact path
tags: [regenerate, force, docs-agent]
arguments:
  - name: path
    description: Relative path to the markdown artifact to regenerate
    required: true
---

# Force Regenerate Documentation

You are helping force regenerate a PDF document for a specific artifact, bypassing the normal deduplication check.

## Task

Force regenerate a PDF for the specified artifact path:

1. **Get the artifact path** from the user (required argument)
2. **Load configuration** from `.specify/extensions/docs-agent/config.yml`:
   - `api_base_url`
   - `api_key`
3. **Read the markdown file** at the specified path
4. **Transform to structured JSON** (same as `/speckit.ext.docgen`)
5. **Send to backend** with force flag:
   ```
   POST <api_base_url>/api/artifacts/ingest-structured?force=true
   Authorization: Bearer <api_key>
   Content-Type: application/json
   
   {
     "project_id": "<from_config>",
     "source_path": "<user_provided_path>",
     "structured_json": { ... },
     "commit_hash": "<current_git_commit_or_null>"
   }
   ```
6. **Report success** with new version number

## When to Use

This command is useful when:
- The render template or taxonomy has changed
- You want to regenerate even though content hasn't changed
- Previous render had an error and you've fixed it

## Arguments

- `path` (required): Relative path to the artifact
  - Example: `specs/001-feature/spec.md`
  - Must be relative to workspace root
  - File must exist

## Difference from `/speckit.ext.docgen`

- `/speckit.ext.docgen` - Works on active file, respects deduplication
- `/speckit.ext.regenerate` - Works on any file path, forces new version

## Error Handling

- If path is not provided, ask the user for it
- If file doesn't exist, show error with correct path format
- If config missing, tell user to run `/speckit.ext.setup` first
- If backend unreachable, inform user to start services

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
    "version_no": 3,
    "pdf_path": "/app/pdf-output/artifact-1.pdf"
  },
  "forced": true
}
```

## Success Message

```
✓ Successfully regenerated specs/feature/spec.md
  New version: v3
  PDF: artifact-1.pdf
```
