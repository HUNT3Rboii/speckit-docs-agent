# Quick Start: Automatic File Watching

This guide shows you how to enable automatic processing of markdown files.

## What is the File Watcher?

The file watcher is a background script that continuously monitors your workspace for markdown file changes and automatically processes them into PDFs.

**It detects:**
- ✅ New `.md` files created
- ✅ Existing `.md` files modified
- ✅ Changes saved to disk

**It ignores:**
- `.git`, `.venv`, `node_modules`, `__pycache__`, `.pytest_cache`, `tmp`

## Prerequisites

1. **Backend services running**
   ```powershell
   cd C:\Users\MSI\Desktop\speckit-docs-agent\speckit-docs-agent
   .\start.ps1
   ```

2. **Extension configured** (run once)
   ```
   /speckit.ext.setup
   ```

## Start the Watcher

### Method 1: Quick Start Script (Recommended)

**From the backend repository directory:**

```powershell
# Windows
cd C:\Users\MSI\Desktop\speckit-docs-agent\speckit-docs-agent
.\start-watcher.ps1 -WorkspaceRoot "C:\Users\MSI\Desktop\testing"

# Linux/Mac
cd /path/to/speckit-docs-agent
./start-watcher.sh "/path/to/workspace"
```

### Method 2: Using Copilot Command

**From within your workspace:**

```
/speckit.ext.watch
```

Copilot will start the watcher for you.

## What You'll See

```
==================================
Documentation Agent File Watcher
==================================

Checking backend connection...
Backend is running!

Starting watcher...
  Workspace: C:\Users\MSI\Desktop\testing
  API URL: http://127.0.0.1:8000

Press Ctrl+C to stop

Starting markdown watcher for C:\Users\MSI\Desktop\testing
{"path": "constitution.md", "action": "created", "result": {"status": "ok", "artifact": {...}}}
{"path": "specs/feature/spec.md", "action": "updated", "result": {"status": "ok", "artifact": {...}}}
```

## Usage Workflow

1. **Open a separate terminal** and start the watcher
2. **Work normally** in your Spec Kit workspace:
   - Create new `.md` files
   - Edit existing spec files
   - Save your changes
3. **Files are automatically processed** within 2 seconds
4. **Check status anytime:**
   ```
   /speckit.ext.status
   ```

## Stop the Watcher

Press **Ctrl+C** in the terminal where the watcher is running.

## Running in Background (Optional)

### Windows PowerShell
```powershell
Start-Process pwsh -ArgumentList "-File start-watcher.ps1 -WorkspaceRoot 'C:\Users\MSI\Desktop\testing'" -WindowStyle Hidden
```

### Linux/Mac
```bash
nohup ./start-watcher.sh "/path/to/workspace" > watcher.log 2>&1 &

# To stop later:
ps aux | grep markdown_watcher
kill <PID>
```

## Troubleshooting

### "Backend not reachable"

Start the backend first:
```powershell
cd C:\Users\MSI\Desktop\speckit-docs-agent\speckit-docs-agent
.\start.ps1
```

### "Python not found"

Install Python 3.8+ and ensure it's in your PATH:
```powershell
python --version
```

### Files not being detected

- Check the watcher terminal for errors
- Verify the workspace path is correct
- Ensure files have `.md` extension
- Files must be **saved to disk** to trigger processing

### Watcher crashes

- Check backend logs: `docker-compose logs backend`
- Restart the watcher
- Verify API key and URL in config

## Comparison: Three Processing Methods

| Method | Trigger | Use Case |
|--------|---------|----------|
| **File Watcher** | Automatic on save | Active development, continuous workflow |
| **Manual Command** | `/speckit.ext.docgen` | On-demand processing of specific files |
| **Git Hook** | On commit | Version-controlled documentation |

## Example Session

```powershell
# Terminal 1: Start backend
PS C:\...\speckit-docs-agent> .\start.ps1
✅ Services are running!

# Terminal 2: Start watcher
PS C:\...\speckit-docs-agent> .\start-watcher.ps1 -WorkspaceRoot "C:\Users\MSI\Desktop\testing"
Starting watcher...
  Workspace: C:\Users\MSI\Desktop\testing

# Terminal 3: Work in your IDE
# Create specs/new-feature/spec.md
# Save file → Watcher automatically processes it

# Check status
PS C:\...\testing> /speckit.ext.status
✓ specs/new-feature/spec.md [spec] - rendered (v1)
✓ constitution.md [other] - rendered (v2)
```

## Next Steps

- View generated PDFs: See [SETUP-GUIDE.md](SETUP-GUIDE.md#accessing-pdfs)
- Configure settings: See [USER-GUIDE.md](USER-GUIDE.md#configuration)
- Understand workflows: See [README.md](README.md#architecture)

---

**You're all set!** The watcher will now automatically process all markdown files in your workspace. 🎉
