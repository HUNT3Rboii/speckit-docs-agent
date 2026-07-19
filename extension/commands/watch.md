# Start Markdown File Watcher

Start the automatic markdown file watcher that monitors for `.md` file changes and automatically processes them.

## Steps

1. Load configuration from `.specify/extensions/docs-agent/config.yml`
2. Determine workspace root directory
3. Start the watcher script with environment variables:
   - `SPECKIT_EXT_ROOT` = workspace root
   - `SPECKIT_EXT_API_URL` = from config
   - `SPECKIT_EXT_API_KEY` = from config

## Platform-Specific Commands

### Windows
```powershell
.\extension\scripts\powershell\start-watcher.ps1 -WorkspaceRoot "<workspace>" -ApiUrl "<api_url>" -ApiKey "<api_key>"
```

### Linux/Mac
```bash
./extension/scripts/bash/start-watcher.sh "<workspace>" "<api_url>" "<api_key>"
```

## Behavior

- Polls every 2 seconds for markdown file changes
- Automatically processes new and modified `.md` files
- Ignores: `.git`, `.venv`, `node_modules`, `__pycache__`, etc.
- Runs in foreground (Ctrl+C to stop)

## Notes

- Backend must be running first
- Watcher blocks the terminal - recommend separate terminal window
- All processed files appear in `/speckit.ext.status`
