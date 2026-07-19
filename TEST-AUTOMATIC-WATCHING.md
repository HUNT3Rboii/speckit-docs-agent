# Testing Automatic File Watching

Follow these steps to test the automatic file watching feature.

## Prerequisites

1. Backend services running
2. Extension configured in your workspace

## Test Procedure

### Step 1: Start Backend

```powershell
cd C:\Users\MSI\Desktop\speckit-docs-agent\speckit-docs-agent
.\start.ps1
```

Wait for:
```
✅ Services are running!
```

### Step 2: Start File Watcher

**Open a NEW terminal** (keep backend terminal open):

```powershell
cd C:\Users\MSI\Desktop\speckit-docs-agent\speckit-docs-agent
.\start-watcher.ps1 -WorkspaceRoot "C:\Users\MSI\Desktop\testing"
```

Expected output:
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
```

### Step 3: Test New File Creation

In your workspace (`C:\Users\MSI\Desktop\testing`):

```powershell
# Create a test file
echo "# Test Document" > test-auto-watch.md
echo "" >> test-auto-watch.md
echo "This file was created to test automatic watching." >> test-auto-watch.md
```

**Watch the watcher terminal** - You should see within 2 seconds:
```json
{"path": "test-auto-watch.md", "action": "created", "result": {"status": "ok", "artifact": {...}}}
```

### Step 4: Test File Modification

Modify the same file:

```powershell
echo "" >> test-auto-watch.md
echo "## New Section" >> test-auto-watch.md
echo "This section was added after initial creation." >> test-auto-watch.md
```

**Watch the watcher terminal** - You should see:
```json
{"path": "test-auto-watch.md", "action": "updated", "result": {"status": "ok", "artifact": {...}}}
```

### Step 5: Verify in Status

From Spec Kit (or Copilot chat):

```
/speckit.ext.status
```

Expected output should include:
```
Project: testing

Artifacts:
✓ test-auto-watch.md [other] - rendered (v2)
✓ constitution.md [other] - rendered (v1)
```

Note: `v2` indicates the file was processed twice (created + modified)

### Step 6: Test with Real Spec File

Create a proper spec file:

```powershell
mkdir -p specs/test-feature
```

Create `specs/test-feature/spec.md`:
```markdown
# Test Feature Specification

This is a test feature to verify automatic processing.

## Overview

The automatic file watcher should detect this file immediately after creation.

## Requirements

1. The watcher must detect new files
2. The watcher must detect modifications
3. Files must be processed within 2 seconds

## Acceptance Criteria

- [ ] New files are automatically processed
- [ ] Modified files are re-processed
- [ ] Status shows latest version number
```

**Watch the watcher terminal** for:
```json
{"path": "specs/test-feature/spec.md", "action": "created", "result": {"status": "ok", ...}}
```

### Step 7: Test Modification of Spec File

Edit `specs/test-feature/spec.md` and add:

```markdown

## Design

The system uses filesystem polling every 2 seconds to detect changes.
```

Save the file.

**Watch the watcher terminal** for:
```json
{"path": "specs/test-feature/spec.md", "action": "updated", "result": {"status": "ok", ...}}
```

### Step 8: Verify Multiple Files

Check status again:

```
/speckit.ext.status
```

Expected output:
```
Project: testing

Artifacts:
✓ specs/test-feature/spec.md [spec] - rendered (v2)
✓ test-auto-watch.md [other] - rendered (v2)
✓ constitution.md [other] - rendered (v1)
```

### Step 9: Test Ignored Directories

Create files in ignored directories (should NOT be processed):

```powershell
mkdir -p node_modules
echo "# Ignored" > node_modules/test.md

mkdir -p .venv
echo "# Ignored" > .venv/test.md
```

**Watch the watcher terminal** - Should see NO processing messages for these files.

### Step 10: Stop and Clean Up

1. **Stop watcher:** Press `Ctrl+C` in watcher terminal
2. **Stop backend:** Press `Ctrl+C` in backend terminal
3. **Clean up test files:**
   ```powershell
   rm test-auto-watch.md
   rm -r specs/test-feature
   rm -r node_modules
   rm -r .venv
   ```

## Success Criteria

- ✅ New files detected within 2 seconds
- ✅ Modified files detected within 2 seconds
- ✅ Watcher terminal shows processing results
- ✅ Status command shows all processed files
- ✅ Version numbers increment on modification
- ✅ Ignored directories are skipped
- ✅ PDFs generated for all processed files

## Troubleshooting

### Watcher doesn't detect changes

- **Check polling interval:** Default is 2 seconds, wait a bit longer
- **Verify file saved:** Changes must be written to disk
- **Check file extension:** Must be `.md` files
- **Check ignored directories:** Ensure file not in `.git`, `node_modules`, etc.

### "Backend not reachable" error

```powershell
# Verify backend is running
docker-compose ps

# Check backend logs
docker-compose logs backend

# Restart if needed
docker-compose restart backend
```

### Files processed but PDFs not found

```bash
# Check PDF volume
docker-compose exec backend ls -la /app/pdf-output/

# Copy PDF to local machine
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf .
```

### Watcher crashes or stops

- **Check Python installed:** `python --version`
- **Check watcher logs:** Error messages in terminal
- **Restart watcher:** Stop (Ctrl+C) and run start command again
- **Check disk space:** Ensure enough space for logs and PDFs

## Advanced Testing

### Background Process Test

Start watcher in background:

```powershell
Start-Process pwsh -ArgumentList "-File start-watcher.ps1 -WorkspaceRoot 'C:\Users\MSI\Desktop\testing'" -WindowStyle Hidden
```

Create files normally, verify processing still works.

Stop background process:
```powershell
Get-Process | Where-Object {$_.CommandLine -like "*markdown_watcher*"} | Stop-Process
```

### Load Test

Create multiple files rapidly:

```powershell
for ($i=1; $i -le 10; $i++) {
    echo "# Test $i" > "test-load-$i.md"
    Start-Sleep -Milliseconds 100
}
```

Verify all 10 files are processed.

### Concurrent Modification Test

Have multiple users/processes modifying files simultaneously, verify no race conditions.

## Next Steps

After successful testing:

1. Document any issues found
2. Update configuration if needed
3. Deploy to production workspace
4. Train users on automatic watching workflow

---

**Test Status:** Ready for execution
**Estimated Time:** 15 minutes
**Required Terminals:** 2 (backend + watcher)
