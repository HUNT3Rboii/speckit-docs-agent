# Speckit Auto-AI - Documentation Generation System

Automatically generate polished PDF documentation from markdown files using AI-powered transformation, with diagrams, a glossary, and evidence-grounded validation - all driven by a native VS Code extension.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

## 🚀 Features

- ✨ **Fully Automatic** - VS Code extension monitors and processes markdown files on save
- 🤖 **AI-Powered** - Uses GitHub Copilot, Claude, or other AI models already active in your IDE (zero separate config)
- 📊 **Diagrams & Glossary** - Generates Mermaid diagrams and a glossary, each backed by a verbatim quote from your source document
- 🔍 **Evidence-Grounded Validation** - A deterministic backend checks every diagram/glossary claim against the source text (fuzzy match, ≥85%) before it ever reaches the PDF
- 🔁 **Self-Correcting** - If validation fails, the same AI session is asked to fix only the flagged items and resubmit (up to 2 retries), then gracefully degrades rather than failing outright
- 📄 **Professional PDFs** - Cover page, table of contents, grouped sections, embedded diagrams, glossary appendix
- 🔄 **Smart Fallback** - Works with or without AI using deterministic rule-based parsing
- 🗄️ **Version Tracking** - Maintains complete history in PostgreSQL (or SQLite for local/dev)

## ⚡ Quick Start

### Step 1: Start Everything

Pick one:

**Docker** (matches production, includes local mmdc diagram rendering):
```powershell
.\START-EVERYTHING.ps1
```
Starts FastAPI + PostgreSQL on `http://localhost:8000` and the frontend dashboard on `http://localhost:5173` (installing frontend dependencies first if this is a fresh clone). Rebuilds the backend image every time (`--build`), since the Dockerfile installs Node.js + mmdc for diagram rendering.

**Local / fast dev loop, backend only** (no Docker, SQLite, diagrams fall back to the Kroki API since mmdc isn't installed locally):
```powershell
cd backend
$env:DOC_AGENT_DB_PATH="$PWD\doc_agent.sqlite3"
$env:DOC_OUTPUT_DIR="$PWD\pdf-output"
$env:SPECKIT_EXT_API_KEY="dev-key"
$env:USE_POSTGRES="false"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Either way, confirm it's up:
```powershell
curl http://localhost:8000/health
```

### Step 2: Install the VS Code Extension

```powershell
.\INSTALL-EXTENSION.ps1
```

This uninstalls any existing copy, installs dependencies, compiles, runs the unit test suite, lints, packages, and reinstalls the extension - all in one step. Then reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window").

**That's it!** Save any `.md` file in VS Code and the extension will:
1. Detect the change (built-in file watcher - no separate process to start)
2. Transform it with whatever AI is active in your IDE (or rule-based fallback), producing sections, diagrams, glossary, and summaries with evidence citations
3. Submit it to the backend, which validates every diagram/glossary claim against your source text
4. If something isn't grounded, the extension gets a structured error back and asks the AI to fix just that item (up to 2 retries) - you won't see this happen, it's automatic
5. Generate a professional PDF and notify you with a link to open it

## 🧪 Testing the Full Pipeline

A step-by-step walkthrough to confirm everything (backend, extension, evidence validation, diagrams, glossary) actually works end to end.

### 1. Confirm the backend is healthy

```powershell
curl http://localhost:8000/health
# {"status":"ok","service":"speckit-backend"}
```

### 2. Confirm the extension is installed and active

- `Ctrl+Shift+P` → "Speckit: Check Backend Status" → should report the backend is available
- `Ctrl+Shift+P` → "Speckit: Show Extension Logs" → keep this panel open, you'll watch requests flow through it

### 3. Create a test document with diagrammable + glossary-worthy content

Diagrams and glossary entries only get generated where the content actually warrants them, so a file that's just prose won't produce either. Create `test-doc.md` in your workspace:

```markdown
# Authentication Service Design

## Overview

This document describes the authentication system for the customer portal.

## Architecture

The Frontend sends login requests to the API Gateway, which forwards them to
the Auth Service. The Auth Service validates credentials against the User
Database and, on success, issues a JWT for the session.

## Glossary Terms

JWT stands for JSON Web Token, a compact, URL-safe token format used here to
represent an authenticated session without server-side session storage.
```

### 4. Save it and watch what happens

Save the file (`Ctrl+S`). In the extension logs you should see, in order: reading the file → transforming with AI (or rule-based) → validating JSON → sending to backend. Within a few seconds, a success notification appears with an **Open PDF** action.

### 5. Check the result

Open the generated PDF and confirm:
- Cover page with title/abstract and an executive summary
- Table of contents linking to each section
- An **Architecture** diagram (Mermaid-rendered) showing Frontend → API Gateway → Auth Service → User Database
- A **Glossary** appendix defining **JWT**, linked from its first mention in the body

### 6. (Optional) See the graceful-degradation path

Check the artifact's status directly - dropped diagrams/glossary entries (if any survived validation only partially) show up here:

```powershell
curl -H "Authorization: Bearer dev-key" http://localhost:8000/api/status/<artifact_id>
```

The `artifact_id` is in the extension's success notification/logs, or in `GET /api/projects/{project_id}/artifacts`.

### 7. Confirm dedup works

Save the same file again without changing it - the extension/backend should recognize the content hash is unchanged and skip reprocessing (logged as "skipped").

## 📖 How It Works

```
Save .md file in VS Code
    ↓
Built-in file watcher detects the change (debounced)
    ↓
AI transforms markdown into title/abstract/sections/diagrams/glossary/summaries,
each diagram component and glossary term citing a verbatim source excerpt
    ↓
POST /api/process: backend fuzzy-matches every citation against the source (≥85%)
    ↓
   ├─ all grounded → render PDF
   ├─ some ungrounded, retries left → structured error back to the AI → corrected resubmission
   └─ retries exhausted → render PDF anyway, dropping only the ungrounded items
    ↓
Diagrams rendered (mmdc locally, Kroki as fallback) → HTML → PDF (WeasyPrint)
    ↓
Notification with PDF link (or a partial-success warning naming what was dropped)
```

## 📚 What You Get

### Backend
- **FastAPI server** - `/api/process` (agentic pipeline: validate → render) and `/api/status/{id}` (dropped-item visibility), plus the original `/api/artifacts/ingest-*` endpoints
- **PostgreSQL or SQLite** - version tracking and artifact storage
- **Evidence-grounding validators** - fuzzy-match every diagram component/glossary term against the source markdown
- **PDF generator** - WeasyPrint (falls back to raw HTML if rendering fails)
- **Diagram renderer** - mmdc (local) → Kroki (external fallback, with a one-time privacy warning) → cached by content hash

### VS Code Extension
- **Automatic file monitoring** - built-in, no separate process
- **AI provider support** - GitHub Copilot, Claude, Kiro, or any other registered VS Code language model
- **Rule-based fallback** - works without AI, still schema-valid (empty diagrams/glossary, still passes validation)
- **Client-driven retry loop** - corrects and resubmits based on the backend's structured validation errors
- **User notifications** - success, partial-success (with dropped items named), and error states
- **Command palette** - manual processing and configuration

## 🎯 VS Code Extension Commands

Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Speckit: Process Current File` | Manually process active markdown file |
| `Speckit: Show Extension Logs` | View detailed processing logs |
| `Speckit: Check Backend Status` | Verify backend connection |
| `Speckit: Toggle Auto-Processing` | Enable/disable automatic processing |

## ⚙️ Configuration

VS Code Settings (`Ctrl+,` or `Cmd+,` → search "Speckit"):

| Setting | Default | Description |
|---------|---------|-------------|
| `speckit.backendUrl` | `http://localhost:8000` | Backend API URL |
| `speckit.autoProcess` | `true` | Auto-process on save |
| `speckit.includePatterns` | `["**/*.md"]` | Files to process |
| `speckit.excludePatterns` | `[...]` | Files to ignore |
| `speckit.debounceMs` | `500` | Debounce delay (ms) |
| `speckit.maxConcurrentProcessing` | `3` | Max concurrent files |
| `speckit.enableDebugLogging` | `false` | Verbose logging |

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────┐
│         VS Code Extension               │
│  ┌─────────────────────────────────┐   │
│  │  File Watcher (automatic)       │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  AI Providers (fallback chain)  │   │
│  │  • Copilot → Claude → Kiro →    │   │
│  │    Generic → Rule-based         │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  JSON Parser & Schema Validator  │   │
│  └──────────────┬──────────────────┘   │
└─────────────────┼────────────────────────┘
                  ↓ POST /api/process (retry loop across requests)
┌─────────────────────────────────────────┐
│      Backend API                        │
│  ┌─────────────────────────────────┐   │
│  │  Evidence-Grounding Validators  │   │
│  │  (headings/diagrams/glossary)   │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  Diagram Renderer + HTML/PDF    │   │
│  └──────────────┬──────────────────┘   │
└─────────────────┼────────────────────────┘
                  ↓
              PDF Output
```

### Data Flow

1. **Save** → Extension detects markdown file change
2. **Transform** → AI produces sections/diagrams/glossary/summaries with evidence citations (or rule-based fallback)
3. **Validate** → Backend fuzzy-matches every citation against the source
4. **Correct** (if needed) → Structured error back to the AI, corrected resubmission, up to 2 retries, then graceful degradation
5. **Render** → Diagrams rendered, HTML built, PDF generated
6. **Store** → Saved to database + file volume, dropped items (if any) recorded for `/api/status`
7. **Notify** → User gets a notification with the PDF link (or a partial-success warning)

---

## 🔧 Project Structure

```
.
├── vscode-extension/        # VS Code Extension
│   ├── src/
│   │   ├── extension.ts              # Entry point
│   │   ├── services/
│   │   │   ├── config.ts            # Configuration
│   │   │   ├── fileWatcher.ts       # File monitoring
│   │   │   ├── aiProviderFactory.ts # AI detection/fallback
│   │   │   ├── enrichmentPromptBuilder.ts # Evidence-citation prompt
│   │   │   ├── jsonParser.ts        # Parsing/schema validation
│   │   │   ├── backendClient.ts     # API client (process/ingest)
│   │   │   ├── notificationService.ts # User feedback
│   │   │   └── transformPipeline.ts  # Orchestration + retry loop
│   │   ├── providers/                # AI providers
│   │   │   ├── copilotProvider.ts
│   │   │   ├── claudeProvider.ts
│   │   │   ├── kiroProvider.ts
│   │   │   ├── genericProvider.ts
│   │   │   └── ruleBasedProvider.ts
│   │   └── types/
│   ├── jest.config.js                # Pure-logic unit tests (npm run test:unit)
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── process_routes.py   # /api/process, /api/status
│   │   │   └── routes.py           # legacy /api/artifacts/ingest-*
│   │   ├── services/
│   │   │   ├── agentic_pipeline_service.py
│   │   │   ├── html_generator.py
│   │   │   ├── pdf_generator.py
│   │   │   └── diagram_rendering_service.py
│   │   ├── validators/              # evidence-grounding validators
│   │   ├── repositories/            # SQLite / Postgres
│   │   └── models/
│   ├── tests/
│   ├── Dockerfile                   # includes Node.js + mmdc
│   └── requirements.txt
│
├── infra/
│   └── docker-compose.yml
│
├── START-EVERYTHING.ps1     # Build + start Docker backend + frontend
├── INSTALL-EXTENSION.ps1    # Uninstall, rebuild, test, reinstall extension
└── README.md
```

## 🧪 Development Testing

### Backend

```powershell
cd backend
pytest tests/
```

### Extension - unit tests (pure logic, no VS Code needed)

```powershell
cd vscode-extension
npm run test:unit
```

### Extension - integration tests (VS Code Extension Development Host)

1. Open `vscode-extension/` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new VS Code window: open a workspace with markdown files, save one, check notifications and logs

---

## 📋 Prerequisites

- **Docker** & Docker Compose (for the Docker path), or Python 3.11+ (for local/dev)
- **Node.js** 20+ (for extension development)
- **VS Code** 1.85.0 or later
- **GitHub Copilot** or **Claude** extension (optional - rule-based fallback works without any AI provider)

---

## 🐛 Troubleshooting

### Extension Not Activating

1. Check VS Code version: Help → About (must be 1.85.0+)
2. View extension logs: Ctrl+Shift+P → "Speckit: Show Extension Logs"
3. Reload window: Ctrl+Shift+P → "Developer: Reload Window"

### Backend Not Available

1. Docker: `docker ps` (should see the backend container) and `docker logs infra-backend-1`
2. Local: check the terminal running `uvicorn` for errors
3. Verify URL: `curl http://localhost:8000/health`
4. Try extension command: "Speckit: Check Backend Status"

### No AI Provider Detected

Extension will use rule-based fallback automatically (still produces a valid, if unenriched, PDF). For AI features:
1. Install GitHub Copilot or Claude extension
2. Reload VS Code window
3. Check logs for provider detection

### Diagrams Always Falling Back to Kroki

`mmdc` (Mermaid CLI) isn't installed/on PATH. The Docker image installs it automatically; for a local (non-Docker) backend, install it with `npm install -g @mermaid-js/mermaid-cli`. Kroki is a working fallback either way, just an external network call.

### A Diagram or Glossary Term Is Missing From the PDF

That's the evidence-grounding validator working as intended - it drops any diagram/glossary entry whose cited evidence didn't fuzzy-match the source text after retries were exhausted. Check `GET /api/status/{artifact_id}` for what was dropped and why.

### Files Not Processing

1. Check auto-process setting: `speckit.autoProcess` (should be `true`)
2. Check file patterns: `speckit.includePatterns` and `excludePatterns`
3. View logs: "Speckit: Show Extension Logs"
4. Try manual: "Speckit: Process Current File"

### More Help

See `vscode-extension/TROUBLESHOOTING.md` for detailed debugging guide.

---
