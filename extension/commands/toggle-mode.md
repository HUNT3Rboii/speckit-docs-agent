# Toggle Transformation Mode

Switch between AI-powered (agentic) and rule-based (classic) transformation modes.

## Current Options

### AI-Powered Mode ✨ (Default)
- Uses your IDE's AI model (Copilot, Claude, Kiro)
- Professional titles and abstracts
- Context-aware section classification
- 95% accuracy
- Processing: 2-3 seconds per file

### Rule-Based Mode ⚡ (Classic)
- Pattern matching and heuristics
- Fast processing (<100ms)
- Works offline
- No AI dependencies
- 70% accuracy

## Steps

1. Load configuration from `.specify/extensions/docs-agent/config.yml`
2. Get API base URL and key
3. Prompt user to choose mode
4. Send mode update to backend:
   ```
   POST {api_base_url}/api/config/transformation-mode
   Authorization: Bearer {api_key}
   
   {"mode": "ai" or "rule-based"}
   ```
5. Confirm change to user

## User Prompt

```
Current Mode: AI-Powered ✨

Choose transformation mode:

[1] AI-Powered ✨
    • Professional output
    • Uses IDE AI
    • 2-3 sec/file
    
[2] Rule-Based ⚡
    • Fast processing
    • Works offline
    • Basic quality

Enter 1 or 2:
```

## Response

```
✅ Mode updated to: AI-Powered ✨

All future markdown files will use this mode.
Run /speckit.ext.toggle-mode to switch anytime.
```
