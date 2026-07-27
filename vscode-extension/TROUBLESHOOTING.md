# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Speckit Auto-AI extension.

## Table of Contents

- [Backend Connection Issues](#backend-connection-issues)
- [AI Provider Issues](#ai-provider-issues)
- [File Processing Issues](#file-processing-issues)
- [JSON Parsing Errors](#json-parsing-errors)
- [Performance Issues](#performance-issues)
- [Configuration Issues](#configuration-issues)
- [Debugging Tips](#debugging-tips)

---

## Backend Connection Issues

### Backend Not Available

**Symptoms:**
- "Backend is not available" warning on activation
- Processing fails with backend connection errors
- Health check shows backend as unavailable

**Diagnosis:**
```bash
# Test backend manually
curl http://localhost:8000/health

# Or alternative endpoint
curl http://localhost:8000/api/health
```

**Solutions:**

1. **Verify backend is running**
   - Check backend process is active
   - Verify port 8000 is not blocked
   - Check backend logs for errors

2. **Check backend URL configuration**
   - Open VS Code Settings
   - Search for "speckit.backendUrl"
   - Verify URL matches your backend (e.g., `http://localhost:8000`)

3. **Try Docker bridge URL**
   - If running in Docker, try: `http://host.docker.internal:8000`
   - The extension automatically tries this fallback

4. **Check firewall/network**
   - Ensure localhost traffic is allowed
   - Check if VPN/proxy is interfering
   - Try disabling firewall temporarily

5. **View detailed logs**
   - Command Palette → "Speckit: Show Extension Logs"
   - Look for connection errors
   - Check timeout issues

### Backend Returns Errors

**Symptoms:**
- Processing succeeds but backend returns 4xx/5xx errors
- "Server error" or "Client error" messages

**Solutions:**

1. **Check backend logs** - Most issues are visible in backend logs
2. **Verify request format** - Enable debug logging to see request payload
3. **Check API key** - If authentication is required, verify API key is correct
4. **Backend version** - Ensure backend supports the API endpoints

---

## AI Provider Issues

### No AI Provider Detected

**Symptoms:**
- Notification: "No AI provider detected"
- Logs show "Using Rule-Based (Fallback)"

**Solutions:**

1. **Install an AI extension**
   - [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
   - [Claude extension](https://marketplace.visualstudio.com/items?itemName=Anthropic.claude-dev) (if available)

2. **Verify AI extension is activated**
   - Check extension is enabled in Extensions view
   - Restart VS Code after installation
   - Check AI extension logs for errors

3. **Check Language Model API access**
   - Ensure VS Code version is 1.85.0 or later
   - Verify no workspace policies blocking API access

4. **Accept rule-based fallback**
   - The extension still works with rule-based analysis
   - Quality may be lower than AI-powered analysis

### AI Provider Rate Limits

**Symptoms:**
- "Copilot rate limit exceeded" error
- Processing fails intermittently
- Works after waiting

**Solutions:**

1. **Wait and retry** - Rate limits reset after time
2. **Reduce processing frequency** - Increase debounce delay
3. **Use different provider** - Try Claude or generic provider
4. **Disable auto-processing** - Process files manually as needed

### Document Too Large

**Symptoms:**
- "Document too large for Copilot" error
- Timeout errors with large files

**Solutions:**

1. **Split document** - Break into smaller files
2. **Increase timeout** - Not currently configurable (coming in future release)
3. **Use rule-based provider** - Fallback handles large files better
4. **Remove verbose content** - Trim unnecessary sections

---

## File Processing Issues

### Files Not Being Processed

**Symptoms:**
- Save file but no processing happens
- No notifications or logs

**Diagnosis:**

1. Check auto-processing is enabled:
   ```
   Settings → speckit.autoProcess → should be true
   ```

2. Check file patterns:
   ```
   Settings → speckit.includePatterns → should match your files
   Settings → speckit.excludePatterns → should not match your files
   ```

3. Check logs:
   ```
   Command Palette → Speckit: Show Extension Logs
   ```

**Solutions:**

1. **Enable auto-processing**
   - Command Palette → "Speckit: Toggle Auto-Processing"

2. **Adjust include patterns**
   - Add `"**/*.md"` to include patterns
   - Add specific paths if needed

3. **Check exclude patterns**
   - Ensure your file path doesn't match any exclude pattern
   - Common exclusions: `node_modules`, `.git`, `.vscode`

4. **Try manual processing**
   - Open file
   - Command Palette → "Speckit: Process Current File"
   - Check for specific errors

### Duplicate Processing

**Symptoms:**
- File processed multiple times on single save
- Multiple notifications for same file

**Solutions:**

1. **Increase debounce delay**
   ```
   Settings → speckit.debounceMs → try 1000 or higher
   ```

2. **Check for conflicting extensions**
   - Other extensions may trigger file events
   - Try disabling other markdown extensions temporarily

3. **Check auto-save settings**
   - Aggressive auto-save may trigger multiple events
   - Consider adjusting auto-save delay

### Processing Gets Stuck

**Symptoms:**
- Status bar shows "Processing..." indefinitely
- No success or error notification

**Solutions:**

1. **Check backend is responding**
   - Verify backend isn't overloaded
   - Check backend logs for hanging requests

2. **Reload VS Code**
   - Command Palette → "Developer: Reload Window"

3. **Check concurrent processing limit**
   ```
   Settings → speckit.maxConcurrentProcessing → try reducing to 1
   ```

4. **View logs for timeout**
   - Look for timeout errors in extension logs

---

## JSON Parsing Errors

### "No JSON object found in response"

**Symptoms:**
- AI returns non-JSON response
- Processing fails at parsing stage

**Diagnosis:**
1. Enable debug logging:
   ```
   Settings → speckit.enableDebugLogging → true
   ```

2. Process file and check logs for AI response

**Solutions:**

1. **Check AI response format**
   - View logs to see raw AI output
   - AI should return JSON, not prose

2. **Try different AI provider**
   - Different providers may format responses differently
   - Rule-based provider always returns valid JSON

3. **Report issue**
   - If consistently failing, open GitHub issue
   - Include sanitized AI response from logs

### "JSON validation failed"

**Symptoms:**
- JSON parses but validation fails
- Missing required fields

**Solutions:**

1. **Check error details** - Validation error lists missing fields
2. **Try different provider** - Some providers may omit fields
3. **Use manual processing** - See specific validation errors
4. **Check AI prompt** - May need to adjust prompt for your provider

---

## Performance Issues

### Slow Processing

**Symptoms:**
- Long delay between save and PDF generation
- Status bar shows processing for extended time

**Solutions:**

1. **Check AI provider speed**
   - Copilot is usually fastest
   - Rule-based is instant but lower quality

2. **Reduce concurrent processing**
   ```
   Settings → speckit.maxConcurrentProcessing → set to 1
   ```

3. **Check backend performance**
   - Backend PDF generation may be slow
   - Check backend logs for bottlenecks

4. **Optimize document size**
   - Smaller files process faster
   - Remove unnecessary content

### High Memory Usage

**Symptoms:**
- VS Code becomes sluggish
- System memory usage high

**Solutions:**

1. **Reduce concurrent processing**
   ```
   Settings → speckit.maxConcurrentProcessing → set to 1 or 2
   ```

2. **Clear cache**
   - Reload VS Code window
   - Extension clears cache on reload

3. **Disable auto-processing**
   - Process files manually as needed
   - Reduces background processing load

---

## Configuration Issues

### Settings Not Applied

**Symptoms:**
- Change settings but behavior doesn't change
- Old configuration still in effect

**Solutions:**

1. **Reload VS Code**
   - Command Palette → "Developer: Reload Window"

2. **Check settings scope**
   - User vs Workspace settings
   - Workspace settings override user settings

3. **Check settings syntax**
   - Array settings must be valid JSON arrays
   - Pattern strings must be properly quoted

### API Key Not Working

**Symptoms:**
- Backend returns authentication errors
- 401 Unauthorized responses

**Solutions:**

1. **Verify API key is correct**
   ```
   Settings → speckit.apiKey → check value
   ```

2. **Check backend authentication setup**
   - Backend must be configured to accept API keys
   - Verify key matches backend configuration

3. **Note: Keys stored in plaintext** (for now)
   - Secure storage migration coming in future release
   - Be cautious with API keys in settings

---

## Debugging Tips

### Enable Debug Logging

1. Open Settings
2. Search for "speckit.enableDebugLogging"
3. Enable the option
4. ⚠️ Warning: May log sensitive content

### View Extension Logs

- Command Palette → "Speckit: Show Extension Logs"
- Logs show all extension activity
- Useful for diagnosing issues

### Check Backend Logs

- Backend logs show API requests and PDF generation
- Look for errors or warnings
- Check request/response details

### Test Backend Manually

```bash
# Health check
curl http://localhost:8000/health

# Manual ingestion test
curl -X POST http://localhost:8000/api/agent/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "test",
    "source_path": "test.md",
    "structured_json": {
      "title": "Test",
      "abstract": "Test document",
      "sections": [],
      "source_path": "test.md",
      "ai_enhanced": false
    }
  }'
```

### Isolate the Issue

1. **Test with new file** - Create simple test.md
2. **Disable other extensions** - Rule out conflicts
3. **Test in clean workspace** - Eliminate workspace-specific issues
4. **Try manual processing** - Bypass auto-processing

### Report Issues

When reporting issues, include:

1. **Extension version** - Check in Extensions view
2. **VS Code version** - Help → About
3. **AI provider** - From extension logs
4. **Error message** - Full error text
5. **Logs** - Relevant portions (sanitize sensitive info)
6. **Reproduction steps** - How to reproduce issue

---

## Still Having Issues?

1. **Check GitHub Issues** - Someone may have reported similar issue
2. **Open New Issue** - Provide details above
3. **Community Support** - Discord/forum if available
4. **Documentation** - Re-read README and configuration guide

## Quick Diagnostic Checklist

- [ ] Backend is running and accessible
- [ ] Auto-processing is enabled (if desired)
- [ ] File matches include patterns
- [ ] File doesn't match exclude patterns
- [ ] AI provider is installed and activated
- [ ] Backend URL is correct
- [ ] Logs show no errors
- [ ] VS Code version is 1.85.0+
- [ ] Extension is activated (check logs)

If all checked and still not working, open an issue with full details!
