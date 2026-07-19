# GitHub Copilot Commands for Documentation Agent

This directory contains GitHub Copilot-compatible slash commands for the Documentation Agent extension.

## Available Commands

### `/speckit.ext.setup`
Configure the backend connection for the Documentation Agent extension.

**Usage:** Type `/speckit.ext.setup` in the Copilot chat

**What it does:**
- Prompts for API base URL (default: `http://localhost:8000`)
- Prompts for API key (default: `dev-key`)
- Saves configuration to `.specify/extensions/docs-agent/config.yml`
- Registers your project with the backend

---

### `/speckit.ext.docgen`
Generate PDF documentation from the currently active markdown file.

**Usage:** 
1. Open a markdown spec file in the editor
2. Type `/speckit.ext.docgen` in Copilot chat

**What it does:**
- Reads the active markdown file
- Transforms it into structured JSON
- Sends to backend for PDF generation
- Reports success with artifact ID

---

### `/speckit.ext.status`
View the status of all processed artifacts.

**Usage:** Type `/speckit.ext.status` in Copilot chat

**What it does:**
- Fetches all artifacts from the backend
- Displays their current status (rendered, stale, pending)
- Shows version numbers for completed documents

---

### `/speckit.ext.regenerate <path>`
Force regenerate a PDF, bypassing deduplication.

**Usage:** `/speckit.ext.regenerate specs/001-feature/spec.md`

**What it does:**
- Forces a new PDF generation for the specified file
- Bypasses the "unchanged content" check
- Useful when templates or taxonomy change

---

### `/speckit.ext.watch`
Start automatic file watcher for markdown files.

**Usage:** Type `/speckit.ext.watch` in Copilot chat

**What it does:**
- Starts a background process that monitors your workspace
- Automatically detects new `.md` files and processes them
- Automatically detects changes to existing `.md` files and re-processes them
- Polls every 2 seconds for changes
- Ignores common directories (`.git`, `node_modules`, etc.)

**Important:** The watcher runs in the foreground and blocks the terminal. Recommend running in a separate terminal window or as a background process.

---

## Prerequisites

Before using these commands:

1. **Start the backend services:**
   ```bash
   cd path/to/speckit-docs-agent
   ./start.ps1  # or ./start.sh
   ```

2. **Configure the extension:**
   ```
   /speckit.ext.setup
   ```

3. **Verify backend is running:**
   - Backend API: http://localhost:8000
   - PostgreSQL: localhost:5432

---

## File Structure

```
.github/prompts/
├── README.md                           # This file
├── speckit-ext-setup.prompt.md        # Setup command
├── speckit-ext-docgen.prompt.md       # Generate PDF command
├── speckit-ext-status.prompt.md       # Status command
├── speckit-ext-regenerate.prompt.md   # Force regenerate command
└── speckit-ext-watch.prompt.md        # Start file watcher command
```

---

## How It Works

When you type a slash command in GitHub Copilot chat:

1. Copilot reads the corresponding `.prompt.md` file
2. The frontmatter defines the command name and parameters
3. The markdown content provides instructions for Copilot
4. Copilot executes the instructions and interacts with your backend

---

## Troubleshooting

### Commands don't appear in autocomplete

- Ensure files are in `.github/prompts/` directory
- Restart VSCode
- Update GitHub Copilot extension

### "Backend not reachable" error

```bash
# Check if services are running
cd infra
docker-compose ps

# Start if not running
docker-compose up -d
```

### "Config not found" error

Run the setup command first:
```
/speckit.ext.setup
```

---

## Comparison: Copilot vs Claude Code

| Feature | GitHub Copilot | Claude Code (Kiro) |
|---------|---------------|-------------------|
| Command Location | `.github/prompts/*.prompt.md` | `extension/commands/*.md` |
| Frontmatter | Required | Not required |
| Auto-discovery | Yes | Yes |
| Execution | Via Copilot chat | Native slash commands |

Both formats are supported in this extension!

---

## Additional Resources

- [USER-GUIDE.md](../../USER-GUIDE.md) - Complete user documentation
- [QUICKSTART-USER.md](../../QUICKSTART-USER.md) - 5-minute quick start
- [SETUP-GUIDE.md](../../SETUP-GUIDE.md) - Detailed setup guide
