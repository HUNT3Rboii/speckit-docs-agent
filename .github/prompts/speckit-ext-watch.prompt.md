---
name: speckit.ext.watch
description: Start automatic file watcher for markdown files
---

# Start Markdown File Watcher

You are helping the user start the automatic markdown file watcher that monitors for `.md` file changes.

## Task

Start the file watcher process that automatically detects and processes markdown files:

1. **Load configuration** from `.specify/extensions/docs-agent/config.yml`:
   - `api_base_url`
   - `api_key`
2. **Determine workspace root** (current working directory)
3. **Start the watcher script**:
   - On Windows/PowerShell: Run `extension/scripts/powershell/start-watcher.ps1`
   - On Linux/Mac: Run `extension/scripts/bash/start-watcher.sh`
4. **Set environment variables**:
   - `SPECKIT_EXT_ROOT` = workspace root path
   - `SPECKIT_EXT_API_URL` = API base URL from config
   - `SPECKIT_EXT_API_KEY` = API key from config

## Watcher Behavior

The watcher continuously monitors the workspace for markdown files and:
- **Detects new `.md` files** → Automatically processes them
- **Detects changes to existing `.md` files** → Re-processes them
- **Polls every 2 seconds** for changes
- **Ignores** common directories: `.git`, `.venv`, `node_modules`, `__pycache__`, etc.

## Important Notes

- The watcher runs in the **foreground** (blocks the terminal)
- Press **Ctrl+C** to stop the watcher
- Recommend running in a **separate terminal** or as a **background process**
- The backend must be running at the configured API URL

## Starting the Watcher

### Windows PowerShell
```powershell
cd C:\path\to\backend\repository
.\extension\scripts\powershell\start-watcher.ps1 `
  -WorkspaceRoot "C:\Users\MSI\Desktop\testing" `
  -ApiUrl "http://127.0.0.1:8000" `
  -ApiKey "dev-key"
```

### Linux/Mac
```bash
cd /path/to/backend/repository
./extension/scripts/bash/start-watcher.sh \
  "/path/to/workspace" \
  "http://127.0.0.1:8000" \
  "dev-key"
```

## Expected Output

```
Starting Markdown File Watcher...
  Workspace: C:\Users\MSI\Desktop\testing
  API URL: http://127.0.0.1:8000

Watching for .md file changes (Ctrl+C to stop)...

{"path": "constitution.md", "action": "created", "result": {"status": "ok", "artifact": {...}}}
{"path": "specs/feature/spec.md", "action": "updated", "result": {"status": "ok", "artifact": {...}}}
```

## Troubleshooting

- **Backend not running**: Start with `docker-compose up -d` in backend repository
- **Config missing**: Run `/speckit.ext.setup` first
- **Python not found**: Install Python 3.8+ and ensure it's in PATH
- **Permission denied**: Make script executable with `chmod +x` (Linux/Mac)

## Alternative: Background Process

To run watcher in background:

**Windows PowerShell:**
```powershell
Start-Process pwsh -ArgumentList "-File extension\scripts\powershell\start-watcher.ps1" -WindowStyle Hidden
```

**Linux/Mac:**
```bash
nohup ./extension/scripts/bash/start-watcher.sh > watcher.log 2>&1 &
```
