---
name: speckit.ext.toggle-mode
description: Toggle between AI-powered and rule-based transformation modes
---

# Toggle Transformation Mode

Switch between AI-powered (agentic) and rule-based (classic) transformation modes for the Documentation Agent.

## Task

Toggle the transformation mode by updating the backend configuration:

1. **Load current configuration** from `.specify/extensions/docs-agent/config.yml`
2. **Determine current mode** (check if `use_ai_transform` is set)
3. **Prompt user** to choose mode:
   - **AI-Powered Mode** (agentic) - Uses your IDE's AI model for intelligent parsing
   - **Rule-Based Mode** (classic) - Uses pattern matching and heuristics
4. **Update backend** environment variable via API call
5. **Confirm** mode change to user

## API Endpoint

```
POST {api_base_url}/api/config/transformation-mode
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "mode": "ai|rule-based"
}
```

## Mode Descriptions

### AI-Powered Mode (Recommended)
**Benefits:**
- Professional titles and abstracts
- Context-aware section classification
- 95% accuracy
- Uses your existing IDE AI (Copilot, Claude, Kiro)

**Drawbacks:**
- 2-3 seconds processing time
- Requires AI availability

### Rule-Based Mode (Classic)
**Benefits:**
- Instant processing (<100ms)
- Works offline
- No dependencies
- Predictable output

**Drawbacks:**
- Basic title extraction
- Simple pattern matching
- 70% accuracy

## User Interaction

Present options clearly:

```
Current Mode: AI-Powered ✨

Choose transformation mode:

1. AI-Powered (agentic) ✨
   • Professional titles & abstracts
   • Context-aware classification
   • Uses your IDE's AI model
   • Processing: 2-3 seconds
   
2. Rule-Based (classic) ⚡
   • Fast processing (<100ms)
   • Pattern matching
   • Works offline
   • Basic quality

Enter choice (1 or 2):
```

## Response Format

After mode change:

```
✅ Transformation mode updated!

Mode: AI-Powered ✨
Processing: Future markdown files will use AI for enhanced quality
Speed: 2-3 seconds per file
Fallback: Rule-based mode available if AI fails

To switch modes anytime, run: /speckit.ext.toggle-mode
```

## Configuration Update

Update the backend configuration file or environment:

```yaml
# .specify/extensions/docs-agent/config.yml
api_base_url: http://localhost:8000
api_key: dev-key
transformation_mode: ai  # or "rule-based"
```

## Error Handling

- If backend unreachable: Inform user to start backend services
- If invalid mode: Show available options
- If API fails: Display error and current mode

## Implementation Notes

The backend should support this via environment variable:
- `USE_AI_TRANSFORM=true` → AI-powered mode
- `USE_AI_TRANSFORM=false` → Rule-based mode

Send API request to update runtime configuration without restarting backend.
