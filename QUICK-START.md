# Quick Start - Documentation Agent with VS Code Copilot

## Current Status

✅ **Docker Backend**: Running (http://localhost:8000)
✅ **PostgreSQL**: Running (port 5432)
✅ **Watcher & Bridge**: Fixed and ready to start

---

## Start Everything (3 Commands)

### Terminal 1: Start AI Bridge

Open a NEW PowerShell terminal and run:

```powershell
$env:AI_WORKSPACE_DIR="C:\Users\MSI\test"
python backend/copilot_bridge.py
```

**Expected output:**
```
================================================================================
🚀 Copilot Bridge Server
================================================================================
📡 Listening on: http://0.0.0.0:5555
```

**Leave this terminal running!**

---

### Terminal 2: Start File Watcher

Open a NEW PowerShell terminal and run:

```powershell
$env:SPECKIT_EXT_ROOT="C:\Users\MSI\test"
python extension/scripts/python/markdown_watcher.py
```

**Expected output:**
```
Starting markdown watcher for C:\Users\MSI\test
```

**Leave this terminal running!**

---

### Terminal 3: Test It!

Open VS Code with your workspace:

```powershell
code C:\Users\MSI\test
```

Then create or edit a markdown file in that workspace and save it!

---

## How It Works

1. **You save a .md file** in `C:\Users\MSI\test\`
2. **Watcher detects it** and sends to backend
3. **Backend processes it** and calls AI bridge
4. **Bridge creates request file** in `.ai-requests/`
5. **Bridge waits 60 seconds** and shows you what to tell Copilot
6. **You use Copilot Chat** (optional) or it falls back to rule-based mode
7. **PDF is generated!** Check Docker container for the output

---

## Get Your PDFs

```powershell
docker cp infra-backend-1:/app/pdf-output/ ./my-pdfs/
```

---

## Test Example

Create `C:\Users\MSI\test\example.md`:

```markdown
# User Authentication Feature

## Tasks
- [ ] Create login page
- [ ] Implement password validation
- [ ] Add session management

## User Stories
As a user, I want to log in securely so my data is protected.

## Design Decisions
We will use JWT tokens for stateless authentication.
```

Save it, then watch the terminals!

---

## Optional: Use VS Code Copilot for AI Enhancement

When you see this in the AI Bridge terminal:

```
💡 Open Copilot Chat in VS Code and say:
   'Process the AI request in .ai-requests/transform-1234567890.md'
```

1. Press `Ctrl+Shift+I` to open Copilot Chat
2. Paste the command
3. Wait for Copilot to create the response
4. Your PDF will be AI-enhanced!

---

## Stop Services

Press `Ctrl+C` in each terminal window to stop the services.

---

## Summary

✅ Backend running on Docker
✅ AI Bridge configured for VS Code Copilot
✅ Watcher monitoring correct directory
✅ Automatic fallback to rule-based mode
✅ Zero additional authentication needed

**You're ready to go! Just run the 2 terminal commands above.** 🚀
