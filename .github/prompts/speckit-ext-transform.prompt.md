---
name: speckit.ext.transform
description: AI-powered markdown transformation (internal use)
---

# AI-Powered Markdown Transformation

This is an internal command used by the Documentation Agent backend to leverage your IDE's AI model for intelligent document analysis.

## Input Format

You will receive a JSON request with:
- `source_path`: Path to the markdown file
- `artifact_type`: Type of document (spec, plan, task, etc.)
- `raw_content`: Full markdown content

## Your Task

Analyze the markdown and return structured JSON with:

1. **Title**: Extract or improve the document title
   - Use first # heading if meaningful
   - Improve generic titles (e.g., "spec.md" → "Feature Specification")
   
2. **Abstract**: Create 2-3 sentence summary
   - What is this document about?
   - What's the main purpose or scope?

3. **Sections**: Classify each section by analyzing content
   - `task`: Action items, implementation steps, todos
   - `user_story`: User requirements, personas
   - `design_decision`: Architecture, design choices
   - `normal`: Everything else

## Output Format

Return ONLY this JSON structure (no markdown, no explanations):

```json
{
  "title": "Clear Descriptive Title",
  "abstract": "2-3 sentence summary of the document",
  "sections": [
    {
      "heading": "Section Heading",
      "content": "Full preserved content",
      "type": "task|user_story|design_decision|normal"
    }
  ]
}
```

## Example

**Input:**
```markdown
# User Authentication

This spec defines the authentication system.

## Requirements

- [ ] Implement login endpoint
- [ ] Add JWT tokens
- [ ] Session management

## Design

We'll use OAuth 2.0 with refresh tokens.
```

**Output:**
```json
{
  "title": "User Authentication Specification",
  "abstract": "This specification defines the authentication system including login endpoints, JWT token handling, and session management using OAuth 2.0.",
  "sections": [
    {
      "heading": "Requirements",
      "content": "- [ ] Implement login endpoint\n- [ ] Add JWT tokens\n- [ ] Session management",
      "type": "task"
    },
    {
      "heading": "Design",
      "content": "We'll use OAuth 2.0 with refresh tokens.",
      "type": "design_decision"
    }
  ]
}
```
