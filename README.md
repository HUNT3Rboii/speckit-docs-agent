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
- 🔄 **Smart Fallback** - A deterministic rule-based transform can stand in when no AI provider is available (opt-in via `speckit.allowRuleBasedFallback`)
- 🗄️ **Version Tracking** - Maintains complete history in PostgreSQL (or SQLite for local/dev)

## ⚡ Quick Start

Everything below is the complete path from a fresh `git clone` to a generated PDF. **No configuration is required** - the defaults in `infra/docker-compose.yml` and the extension's settings already agree with each other, and the AI comes from whatever provider is already active in your IDE.

### Step 0: Install the prerequisites

| Tool | Version | Needed for |
|------|---------|-----------|
| [Docker Desktop](https://docs.docker.com/desktop/) | any current | Backend + PostgreSQL (recommended path) |
| [Node.js](https://nodejs.org/) | 20+ | Frontend dashboard and building the extension |
| [VS Code](https://code.visualstudio.com/) | 1.85.0+ | The extension itself |
| [Python](https://www.python.org/downloads/) | 3.11+ | Only for the no-Docker backend path |
| GitHub Copilot / Claude / any VS Code language model | - | Optional - rule-based fallback works with no AI at all |

### Step 1: Clone

```powershell
git clone <your-repo-url> speckit-docs-agent
cd speckit-docs-agent
```

### Step 2: (Optional) environment overrides

Skip this unless you want to change the API key, the database choice, or give the *backend* its own OpenAI key. See [Environment Variables](#-environment-variables) for what each one does.

```powershell
Copy-Item .env.example .env   # then edit
```

`START-EVERYTHING.ps1` passes this file to Docker Compose automatically when it exists.

### Step 3: Start the backend and dashboard

Pick one:

**Docker** (recommended - matches production, includes local mmdc diagram rendering):
```powershell
.\START-EVERYTHING.ps1
```
Checks prerequisites, then starts FastAPI + PostgreSQL on `http://localhost:8000` and the frontend dashboard on `http://localhost:5173` (running `npm install` first if this is a fresh clone). Rebuilds the backend image every time (`--build`), since the Dockerfile installs Node.js + mmdc for diagram rendering. Generated PDFs land in `pdf-output/` at the repo root.

**Local / fast dev loop, backend only** (no Docker, SQLite instead of PostgreSQL, diagrams fall back to the Kroki API since mmdc isn't installed locally):
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

$env:DOC_AGENT_DB_PATH="$PWD\doc_agent.sqlite3"
$env:DOC_OUTPUT_DIR="$PWD\pdf-output"
$env:SPECKIT_EXT_API_KEY="dev-key"
$env:USE_POSTGRES="false"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

> `requirements.txt` deliberately omits `psycopg2-binary` (the Docker image installs it separately), so a local backend uses SQLite. Setting `USE_POSTGRES=true` locally without `pip install psycopg2-binary` logs a connection error and falls back to SQLite rather than failing.

> WeasyPrint needs the GTK/Pango native libraries, which the Docker image installs for you. On a local Windows backend you may need [the GTK runtime](https://weasyprint.readthedocs.io/en/stable/install.html#windows) as well - without it PDF rendering degrades to raw HTML output. This is the main reason the Docker path is recommended.

Either way, confirm it's up:
```powershell
curl http://localhost:8000/health
# {"status":"ok","service":"speckit-backend"}
```

### Step 4: Install the VS Code Extension

```powershell
.\INSTALL-EXTENSION.ps1
```

This uninstalls any existing copy, installs dependencies, compiles, runs the unit test suite, lints, packages, and reinstalls the extension - all in one step. Then reload VS Code (`Ctrl+Shift+P` → "Developer: Reload Window").

Requires the `code` command on your PATH (`Ctrl+Shift+P` → "Shell Command: Install 'code' command in PATH" if it isn't).

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
| `speckit.apiKey` | `dev-key` | Sent as `Authorization: Bearer <key>`. Must match the backend's `SPECKIT_EXT_API_KEY` |
| `speckit.autoProcess` | `true` | Auto-process on save |
| `speckit.includePatterns` | `["**/*.md"]` | Files to process |
| `speckit.excludePatterns` | `[...]` | Files to ignore |
| `speckit.debounceMs` | `500` | Debounce delay (ms) |
| `speckit.maxConcurrentProcessing` | `3` | Max concurrent files |
| `speckit.allowRuleBasedFallback` | `false` | Allow the no-AI deterministic transform. **Off by default**: with no AI provider available, processing fails with an explanatory error instead of silently producing an unenriched PDF. Turn it on if you want output regardless |
| `speckit.providerPriority` | `["copilot","claude","kiro","generic","custom"]` | Order AI providers are tried in |
| `speckit.customModels` | `[]` | Custom OpenAI-compatible endpoints (Ollama, etc). Edit via "Speckit: Manage AI Providers" |
| `speckit.preferredModelId` | `""` | Pin a specific VS Code language model id |
| `speckit.enableCopilotProgressTracking` | `true` | Inject task-progress tracking into Copilot instructions |
| `speckit.enableDebugLogging` | `false` | Verbose logging |

The defaults are self-consistent: `speckit.apiKey` (`dev-key`) already matches `SPECKIT_EXT_API_KEY` in `infra/docker-compose.yml`, so a fresh clone needs no setting changes. Change one and you must change the other.

## 🔑 Environment Variables

All backend variables are optional - each has a working default (the compose file sets the first three explicitly). Copy `.env.example` to `.env` at the repo root to override them; `START-EVERYTHING.ps1` passes that file to Compose.

| Variable | Default | Description |
|----------|---------|-------------|
| `SPECKIT_EXT_API_KEY` | `dev-key` | Shared secret for the extension and dashboard. Must match `speckit.apiKey` and `VITE_API_KEY` |
| `DOC_OUTPUT_DIR` | `/tmp/doc-output` | PDF output dir inside the container - bind-mounted to `pdf-output/` at the repo root |
| `USE_POSTGRES` | `true` | `false` uses SQLite. If Postgres can't be reached the backend logs the error and falls back to SQLite anyway |
| `POSTGRES_HOST` / `_PORT` / `_DB` / `_USER` / `_PASSWORD` | `db` / `5432` / `docsagent` / `docsagent` / `docsagent` | Only read when `USE_POSTGRES=true` |
| `DOC_AGENT_DB_PATH` | `./doc_agent.sqlite3` | SQLite file location when `USE_POSTGRES=false` |
| `OPENAI_API_KEY` | *(unset)* | Optional, **server-side only**. The normal flow uses your IDE's AI via the extension and never needs this |
| `SPECKIT_MODEL_ENDPOINT` | `https://api.openai.com/v1/chat/completions` | Server-side AI endpoint |
| `SPECKIT_MODEL_NAME` | `gpt-4o-mini` | Server-side AI model |
| `USE_AI_TRANSFORM` | `true` | `false` forces deterministic server-side parsing |
| `ARTIFACT_CACHE_DIR` | `./artifact_cache` | Where processed-artifact cache entries are written |
| `DIAGRAM_CACHE_ENABLED` | `true` | Cache rendered diagrams by content hash |
| `MMDC_PUPPETEER_CONFIG` | *(set in the image)* | Puppeteer config for mmdc; leave unset outside containers |

Frontend (`frontend/.env.development`, gitignored - copy from `frontend/.env.example`, or let `START-EVERYTHING.ps1` create it):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL |
| `VITE_API_KEY` | `dev-key` | Must match `SPECKIT_EXT_API_KEY` |

Both have the same values hardcoded as fallbacks in `frontend/src/config/env.ts`, so the dashboard works with no env file at all.

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

1. Open the `vscode-extension/` folder in VS Code (its own window - the launch config is scoped to that folder)
2. Run `npm install` once
3. Press `F5` to launch the Extension Development Host (uses `vscode-extension/.vscode/launch.json`, which compiles first)
4. In the new VS Code window: open a workspace with markdown files, save one, check notifications and logs

---

## 📋 Prerequisites

Same list as [Step 0](#step-0-install-the-prerequisites) above:

- **Docker** & Docker Compose (for the Docker path), or Python 3.11+ (for local/dev)
- **Node.js** 20+ (for the dashboard and extension development)
- **VS Code** 1.85.0 or later
- **GitHub Copilot**, **Claude**, or any other registered VS Code language model - or a custom OpenAI-compatible endpoint (Ollama, etc) added via "Speckit: Manage AI Providers". Without one, enable `speckit.allowRuleBasedFallback` to get unenriched but valid PDFs

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

By default (`speckit.allowRuleBasedFallback: false`) processing fails with an explicit error rather than quietly producing an unenriched PDF. Either:
1. Install the GitHub Copilot or Claude extension (or add a custom OpenAI-compatible endpoint via "Speckit: Manage AI Providers"), reload the window, and check the logs for provider detection; **or**
2. Set `speckit.allowRuleBasedFallback` to `true` to accept the deterministic no-AI transform (valid PDF, empty diagrams/glossary)

### 401 Unauthorized From the Backend

The extension's `speckit.apiKey` doesn't match the backend's `SPECKIT_EXT_API_KEY`. Both default to `dev-key`; if you set one in `.env`, set the other in VS Code settings (and `VITE_API_KEY` in `frontend/.env.development` for the dashboard).

### `.env` Seems To Be Ignored

Docker Compose only auto-loads a `.env` sitting next to the compose file (`infra/.env`). The repo-root `.env` has to be passed explicitly - `START-EVERYTHING.ps1` does it for you; by hand it's `cd infra; docker compose --env-file ../.env up -d --build`.

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
