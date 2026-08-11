# Development Guide

Internals, configuration reference, and how to work on the code. If you just want to *use* Speckit Auto-AI, the [README](README.md) is all you need.

## Contents

- [Running the backend without Docker](#running-the-backend-without-docker)
- [Environment variables](#environment-variables)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Testing](#testing)
- [End-to-end pipeline walkthrough](#end-to-end-pipeline-walkthrough)

---

## Running the backend without Docker

Faster edit-reload loop, at the cost of SQLite instead of PostgreSQL and Kroki instead of local diagram rendering.

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

Two things the Docker image handles for you and this path does not:

- **PostgreSQL.** `requirements.txt` deliberately omits `psycopg2-binary`. Setting `USE_POSTGRES=true` without `pip install psycopg2-binary` logs a connection error and falls back to SQLite rather than failing.
- **WeasyPrint's native libraries.** It needs GTK/Pango. On Windows you may need [the GTK runtime](https://weasyprint.readthedocs.io/en/stable/install.html#windows); without it PDF rendering degrades to raw HTML output.
- **Local diagram rendering.** `mmdc` isn't installed, so diagrams go to the Kroki API instead. Install it with `npm install -g @mermaid-js/mermaid-cli` if you want local rendering.

## Environment variables

All backend variables are optional — each has a working default, and `infra/docker-compose.yml` sets the first three explicitly. Copy `.env.example` to `.env` at the repo root to override them; `START-EVERYTHING.ps1` passes that file to Compose.

| Variable | Default | Description |
|----------|---------|-------------|
| `SPECKIT_EXT_API_KEY` | `dev-key` | Shared secret for the extension and dashboard. Must match `speckit.apiKey` and `VITE_API_KEY` |
| `DOC_OUTPUT_DIR` | `/tmp/doc-output` | PDF output dir inside the container — bind-mounted to `pdf-output/` at the repo root |
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

Frontend (`frontend/.env.development`, gitignored — copy from `frontend/.env.example`, or let `START-EVERYTHING.ps1` create it):

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL |
| `VITE_API_KEY` | `dev-key` | Must match `SPECKIT_EXT_API_KEY` |

Both have the same values hardcoded as fallbacks in `frontend/src/config/env.ts`, so the dashboard works with no env file at all.

**Compose only auto-loads a `.env` sitting next to the compose file** (`infra/.env`). The repo-root `.env` has to be passed explicitly — `START-EVERYTHING.ps1` does it for you; by hand it's `cd infra; docker compose --env-file ../.env up -d --build`. A repo-root `.env` that appears to be ignored is almost always this.

**A 401 from the backend** means the extension's `speckit.apiKey` doesn't match `SPECKIT_EXT_API_KEY`. Both default to `dev-key`; change one and you must change the other, plus `VITE_API_KEY` in `frontend/.env.development` for the dashboard.

## How it works

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

### Backend

- **FastAPI server** — `/api/process` (agentic pipeline: validate → render) and `/api/status/{id}` (dropped-item visibility), plus the original `/api/artifacts/ingest-*` endpoints
- **PostgreSQL or SQLite** — version tracking and artifact storage
- **Evidence-grounding validators** — fuzzy-match every diagram component/glossary term against the source markdown
- **PDF generator** — WeasyPrint (falls back to raw HTML if rendering fails)
- **Diagram renderer** — mmdc (local) → Kroki (external fallback, with a one-time privacy warning) → cached by content hash

### VS Code extension

- **Automatic file monitoring** — built-in, no separate process
- **AI provider support** — GitHub Copilot, Claude, Kiro, any other registered VS Code language model, or a custom OpenAI-compatible endpoint
- **Rule-based fallback** — works without AI, still schema-valid (empty diagrams/glossary, still passes validation); opt-in via `speckit.allowRuleBasedFallback`
- **Client-driven retry loop** — corrects and resubmits based on the backend's structured validation errors
- **User notifications** — success, partial-success (naming the dropped items), and error states

## Architecture

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
│  │    Generic → Custom → Rule-based│   │
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

### Data flow

1. **Save** → Extension detects markdown file change
2. **Transform** → AI produces sections/diagrams/glossary/summaries with evidence citations (or rule-based fallback)
3. **Validate** → Backend fuzzy-matches every citation against the source
4. **Correct** (if needed) → Structured error back to the AI, corrected resubmission, up to 2 retries, then graceful degradation
5. **Render** → Diagrams rendered, HTML built, PDF generated
6. **Store** → Saved to database + file volume, dropped items (if any) recorded for `/api/status`
7. **Notify** → User gets a notification with the PDF link (or a partial-success warning)

Step 1 is skipped when the project is in manual mode (the dashboard's per-project **Auto transform** switch, stored on the `projects` row). The extension reads the current mode off the poll it already runs against `GET /api/projects/{name}/retry-requests`, so a change on the dashboard takes effect within one 15s tick without a reload.

### Dashboard-initiated runs

The backend has no filesystem access to your workspace and no AI provider of its own, so it can never start a run — it can only record that one was asked for, and the extension acts on it:

- The extension pushes its complete markdown inventory to `POST /api/projects/{name}/files/sync` on activation and (debounced) on every watcher event. This is what the Context Files page lists — files with no artifact row yet have no other way to be known about.
- `POST /api/projects/{project_id}/files/transform` flags one of those files. The same poll that carries retry requests carries these back as `transform_requests`, and the extension runs each with `force: true`.
- The flag is cleared as soon as client-side work arrives (`/api/processing-status` or `/api/process`), not on completion — a run that dies halfway must not leave a request the extension re-picks-up forever.

## Project structure

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
│   │   │   ├── pdfDownloadService.ts # Fetches generated PDFs by version id
│   │   │   ├── partialResult.ts     # Interprets the partial-success signal
│   │   │   ├── notificationService.ts # User feedback
│   │   │   └── transformPipeline.ts  # Orchestration + retry loop
│   │   ├── providers/                # AI providers
│   │   │   ├── copilotProvider.ts
│   │   │   ├── claudeProvider.ts
│   │   │   ├── kiroProvider.ts
│   │   │   ├── genericProvider.ts
│   │   │   ├── customModelProvider.ts
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
├── frontend/                # Dashboard (Vite + React)
├── infra/
│   └── docker-compose.yml
│
├── START-EVERYTHING.ps1     # Build + start Docker backend + frontend
├── INSTALL-EXTENSION.ps1    # Uninstall, rebuild, test, reinstall extension
└── README.md
```

## Testing

Everything below also runs on push and pull request via [`.github/workflows/ci.yml`](.github/workflows/ci.yml), in three independent jobs (backend, extension, dashboard). [CONTRIBUTING.md](CONTRIBUTING.md) has the short version.

### Backend

```powershell
cd backend
pytest tests/
```

`reportlab` and WeasyPrint's native GTK/Pango libraries both have to be present or a handful of rendering tests fail on import — `pip install -r requirements.txt` covers the former, [WeasyPrint's install docs](https://weasyprint.readthedocs.io/en/stable/install.html) the latter.

### Dashboard

```powershell
cd frontend
npm run test
```

### Extension — unit tests (pure logic, no VS Code needed)

```powershell
cd vscode-extension
npm run test:unit
```

### Extension — integration (Extension Development Host)

1. Open the `vscode-extension/` folder in VS Code (its own window — the launch config is scoped to that folder)
2. Run `npm install` once
3. Press `F5` to launch the Extension Development Host (uses `vscode-extension/.vscode/launch.json`, which compiles first)
4. In the new window: open a workspace with markdown files, save one, check notifications and logs

Note that installing a new build does not replace an already-running extension host. After `INSTALL-EXTENSION.ps1`, run `Developer: Reload Window` in every window you process files from, or you'll keep testing the old build.

## End-to-end pipeline walkthrough

A step-by-step check that backend, extension, evidence validation, diagrams, and glossary all work together.

### 1. Confirm the backend is healthy

```powershell
curl http://localhost:8000/health
# {"status":"ok","service":"speckit-backend"}
```

### 2. Confirm the extension is installed and active

- `Ctrl+Shift+P` → "Speckit: Check Backend Status" → should report the backend is available
- `Ctrl+Shift+P` → "Speckit: Show Extension Logs" → keep this panel open to watch requests flow through

### 3. Create a document with diagrammable and glossary-worthy content

Diagrams and glossary entries are only generated where the content warrants them, so a file that's pure prose produces neither. Create `test-doc.md`:

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

### 4. Save it and watch

In the logs you should see, in order: reading the file → transforming with AI → validating JSON → sending to backend. Within a few seconds a success notification appears with an **Open PDF** action.

### 5. Check the result

- Cover page with title/abstract and an executive summary
- Table of contents linking to each section
- An **Architecture** diagram (Mermaid-rendered) showing Frontend → API Gateway → Auth Service → User Database
- A **Glossary** appendix defining **JWT**, linked from its first mention in the body

### 6. Inspect what was dropped, if anything

```powershell
curl -H "Authorization: Bearer dev-key" http://localhost:8000/api/status/<artifact_id>
```

The `artifact_id` is in the extension's success notification and logs, or in `GET /api/projects/{project_id}/artifacts`.

### 7. Confirm dedup works

Save the same file again without changing it. The content hash is unchanged, so the run is skipped (logged as "skipped") rather than reprocessed.
