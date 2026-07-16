# Feature Spec: Spec Kit Documentation Agent

**Scope of this document:** This spec covers ONLY the Documentation Agent / PDF pipeline
feature (Spec Kit extension "Weeks 1-2" scope). The Kanban/ticket-board feature is
explicitly OUT OF SCOPE here and must not be designed, scaffolded, or referenced by any
agent working from this file. A separate spec will be provided for it later.

---

## 0. Multi-Tool Build Plan — READ THIS FIRST

This project is built across **two different spec-driven frameworks in sequence**, not
one. This file is handed to both. Identify which framework you are and jump to your
scope before generating anything.

**0.1 — Phase order**
1. **Spec Kit** builds the backend, the `.md`→PDF pipeline, and the Docker setup.
2. **Kiro** builds/refines the React frontend, using Spec Kit's finished output as input
   context (not from a blank slate).

**0.2 — If you are Spec Kit:**
Your scope is §1–§8 and §10 of this document, EXCEPT §9 (React Frontend Requirements),
which is out of scope for you — do not scaffold or generate frontend code. Build:
extension package (§7), backend/API (§8), pipeline (§6), Docker/Postgres setup (§2, §5).
When you finish, your `spec.md`, `plan.md`, `tasks/*.md`, and any `data-model.md` /
`contracts/*.md` you produced under `specs/**` are the exact context that gets handed to
Kiro in Phase 2 — write them as if a second, different AI system will need to read them
cold, with no access to this conversation.

**0.3 — If you are Kiro:**
Your scope is §9 (React Frontend Requirements) only. Before generating a
`requirements.md`/`design.md`/`tasks.md` spec of your own, you MUST be given, as input
context alongside this file:
- Spec Kit's finished `specs/**/plan.md` and `specs/**/data-model.md` (or equivalent) —
  the real backend API surface and schema, not an assumed one
- The exact API table in §8 of this document
- The exact TypeScript interface fields implied by §5 (Data Model) and §6.3 (section
  taxonomy: `task` / `user_story` / `design_decision` / `callout` / `open_question` /
  `normal`)

Do NOT invent alternate endpoint names, alternate response shapes, or alternate section
types. Your `requirements.md`/`design.md` must reference the concrete API from §8
directly rather than re-deriving a frontend contract from first principles. Known risk
for you specifically (documented in prior reviews of this tool): a tendency toward
over-engineering — more files, more generated tests, and more abstraction than the task
needs. For this feature's scope (§9's requirements are deliberately small — 3 routes, no
Redux, no design system), resist expanding scope beyond what §9 actually asks for.

**0.4 — Cross-tool artifact discovery (applies to the Documentation Agent being built,
not to the two frameworks' own operation):**
The Documentation Agent must discover and ingest `.md` files from BOTH frameworks' spec
directories — `specs/**` (Spec Kit) AND `.kiro/specs/**` (Kiro) — not just one. This is
now a hard requirement, not optional; see the updated §5 and §6.2 for the schema and
classification rules this implies. The whole point of this feature is documenting the
agentic process that built the project — silently ignoring half of that process because
it came from a second tool would defeat the purpose.

---

## 1. Purpose

Build a Spec Kit **extension** that automatically converts the Markdown artifacts Spec
Kit produces — `spec.md`, `plan.md`, `tasks/*.md`, and any other `.md` file Spec Kit or
its extensions generate under a project's `specs/` tree (e.g. `constitution.md`,
`research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md`, or files added by
other installed extensions) — **as well as the equivalent files Kiro produces under
`.kiro/specs/**` (see §0.4)** — into well-organized, versioned PDF documentation, stored
in PostgreSQL and browsable through a React dashboard.

The set of artifact types is **not a fixed enum** — the extension must discover and
ingest any `.md` file under `specs/**` or `.kiro/specs/**` regardless of filename,
classifying it by type where recognized (see §5, §6.2) and falling back to a generic
`"other"` type for anything unrecognized, rather than ignoring it.

The documentation must be **organized by structure, not just concatenated**: tasks and
user stories in particular must render as their own clearly delineated section type (not
folded into generic prose), so a reader can scan a document and immediately tell "this is
a task," "this is a user story," "this is a design decision," apart from ordinary
narrative content. See §6.2 for the type taxonomy this requires.

The extension must not modify, intercept, or block Spec Kit's core commands
(`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`). It only
reacts to their completion via Spec Kit's hook system, or is invoked explicitly by the
developer's own coding agent via a provided slash command.

**Zero-config model requirement:** the documentation-generation step MUST automatically
use whichever AI model/agent is already driving the developer's Spec Kit session (Claude
Code, GitHub Copilot, Gemini CLI, or any of Spec Kit's other 30+ supported agents) — no
separate model selection, API key, or provider configuration for this feature. A
developer who has Spec Kit working at all must be able to install this extension and run
`/speckit.ext.docgen` with zero additional setup beyond the extension's own
`api_base_url` (i.e., pointing it at their local backend). See §4 for how this
constrains the trigger design, and §7 for what `config-template.yml` may and may not
contain as a result.

---

## 2. Tech Stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **React** (not Angular) | Vite + TypeScript, functional components + hooks only |
| Database | PostgreSQL | Single schema, this feature only needs 3 tables (see §5) |
| Backend/API | FastAPI (Python) | Async, matches Spec Kit's own Python/uv tooling |
| PDF rendering | WeasyPrint (Markdown → HTML → PDF) | Deterministic, no LLM involvement at render time |
| Extension packaging | Spec Kit extension format | `extension.yml` manifest, hooks, one slash command |

---

## 3. Non-Goals (explicit exclusions)

- No ticket/board/Kanban functionality of any kind
- No user-facing authentication system beyond a single shared API key for the extension → backend call (multi-user auth is a later concern, not this spec)
- No support for Markdown sources outside `specs/**` and `.kiro/specs/**` (see §0.4) — e.g. a developer's personal notes elsewhere in the repo are out of scope
- No editing of Spec Kit's own core prompt templates or command files, and no editing of Kiro's own spec engine or hooks either
- No separate AI provider/model configuration for the primary (agent-native) path — see §1's zero-config requirement. The only credential this feature manages is the extension→backend API key, which is not an AI provider key.

---

## 4. Architecture Overview

```
Spec Kit agent session (any coding agent: Claude Code, Copilot, Gemini, etc.)
        │
        │  developer runs  /speckit.ext.docgen           (agent-native path — PRIMARY)
        │  OR: hook fires automatically on after_tasks / after_plan   (background path)
        ▼
extension/  (published Spec Kit extension — thin, no DB/LLM deps of its own)
        │  HTTP call to backend, either:
        │   (a) POSTs already-structured JSON (agent-native path — agent did the parsing)
        │   (b) POSTs raw file_path + triggers backend-side LLM parsing (hook path, fallback only)
        ▼
FastAPI backend  ───────────────►  PostgreSQL
        │  validate → render (WeasyPrint) → persist → version
        ▼
React dashboard  ── REST polling ──►  renders projects / artifacts / doc versions / PDF preview
```

**Two trigger paths — both must be implemented:**

1. **Agent-native (primary):** extension ships `commands/docgen.md`. When the developer's
   own agent runs `/speckit.ext.docgen`, THAT agent (whatever model/tool the developer is
   already using, automatically — no model selection or provider setup by the extension)
   reads the raw `.md`, produces the structured JSON per the schema in
   §6.3, and POSTs it directly to `/api/artifacts/ingest-structured`. This is what makes
   the zero-config requirement in §1 possible: the extension never chooses or configures
   a model itself, it simply asks whichever agent is already running to do the work.

2. **Hook-driven fallback (for edits made outside an agent turn):** a `post-commit` git
   hook (registered by the extension) fires when `.md` files under `specs/**` change
   without going through an agent command. This path has no active agent session to lean
   on, so it does NOT call an LLM. It POSTs raw file content to
   `/api/artifacts/ingest-raw`, which stores the artifact as **stale/needs-regeneration**
   and does NOT auto-render a PDF. The dashboard must show a clear "regenerate needed"
   state for these. This is an intentional design choice — do not implement a second LLM
   integration to auto-fill this gap.

---

## 5. Data Model (PostgreSQL)

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    repo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_path TEXT NOT NULL,              -- e.g. specs/003-docs-agent/plan.md
                                             -- or .kiro/specs/frontend/design.md
    source_tool TEXT NOT NULL DEFAULT 'speckit' CHECK (source_tool IN ('speckit','kiro')),
        -- which framework produced this file — derived from path prefix in §6.2,
        -- not user-supplied. Required so the dashboard can show which tool built what
        -- (directly useful for the project's own benchmarking narrative).
    artifact_type TEXT NOT NULL DEFAULT 'other',
        -- recognized values: 'spec' | 'plan' | 'task' | 'constitution' | 'research'
        -- | 'data-model' | 'contract' | 'quickstart' | 'other'
        -- NOT a DB-enforced CHECK enum — new types must be addable without a migration.
        -- Classification logic lives in application code (see §6.2), keyed off filename
        -- patterns with a fallback to 'other' for anything unrecognized.
    content_hash TEXT NOT NULL,             -- sha256 of raw .md content
    status TEXT NOT NULL DEFAULT 'pending'  -- pending | rendered | stale
        CHECK (status IN ('pending','rendered','stale')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, source_path)
);

CREATE TABLE doc_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    pdf_path TEXT NOT NULL,                 -- storage path/URL
    structured_json JSONB NOT NULL,         -- cached agent output, see §6.3
    commit_hash TEXT,
    generated_by TEXT NOT NULL DEFAULT 'agent' CHECK (generated_by IN ('agent','system')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (artifact_id, version_no)
);
```

---

## 6. Pipeline Detail

### 6.1 Trigger → Fetch → Dedupe (both paths)
1. Compute `sha256(raw .md content)`.
2. Query `artifacts` for an existing row with this `project_id` + `source_path`.
3. If `content_hash` unchanged since the latest `doc_versions` entry → no-op, return 200
   with the existing version. **This check must happen before any LLM call is made** on
   either path.

### 6.2 Discovery + Classification (both paths)
Before structure extraction, every `.md` file found under **both** `specs/**` (Spec Kit)
**and** `.kiro/specs/**` (Kiro) must be discovered and classified — see §0.4. Two steps:

```
source_tool(source_path) -> 'speckit' | 'kiro'
  - path starts with 'specs/'        -> 'speckit'
  - path starts with '.kiro/specs/'  -> 'kiro'

classify(source_path, content, source_tool) -> artifact_type
  # Spec Kit filenames
  - filename == 'spec.md'          -> 'spec'
  - filename == 'plan.md'          -> 'plan'
  - path contains '/tasks/'        -> 'task'
  - filename == 'constitution.md'  -> 'constitution'
  - filename == 'research.md'      -> 'research'
  - filename == 'data-model.md'    -> 'data-model'
  - path contains '/contracts/'    -> 'contract'
  - filename == 'quickstart.md'    -> 'quickstart'
  # Kiro filenames (semantically equivalent roles, mapped to the same type taxonomy
  # so the dashboard can group by role across tools, not just by source)
  - filename == 'requirements.md'  -> 'spec'
  - filename == 'design.md'        -> 'plan'
  - filename == 'tasks.md' (under .kiro/specs/) -> 'task'
  # fallback, either tool
  - anything else                  -> 'other'   (still ingested, never dropped)
```
This must run for hook-fallback ingestion too (not just agent-native), since a
`post-commit` hook has no filename assumptions baked in — it should walk both `specs/**`
and `.kiro/specs/**` for any changed `.md`, not a hardcoded list of files or a single
directory.

### 6.3 Structure Extraction (agent-native path only)
The developer's agent, running `/speckit.ext.docgen`, must produce JSON matching exactly
this schema before POSTing:

```json
{
  "title": "string",
  "abstract": "string, 1-3 sentences",
  "sections": [
    {
      "heading": "string",
      "level": 1,
      "content": "string, markdown-safe",
      "type": "normal | callout | open_question | task | user_story | design_decision"
    }
  ]
}
```

**Type taxonomy — this is what makes the output "organized," not just converted:**
- `task` — a discrete unit of work (typically from a `tasks/*.md` file, or a task-like
  subsection inside `plan.md`). Must preserve any task ID present in the source.
- `user_story` — content phrased as "As a &lt;role&gt;, I want &lt;goal&gt;, so that
  &lt;benefit&gt;" or explicitly labeled as a user story in the source spec.
- `design_decision` — architecture/technical-decision content (common in `plan.md` /
  `data-model.md` / `research.md`).
- `callout` / `open_question` — as before.
- `normal` — anything not matching the above; this is the fallback, never the default
  assumption for spec/plan/task content specifically.

**Hard requirement:** every H1/H2/H3 heading present in the source `.md` MUST map to
exactly one entry in `sections[]`, AND task/user-story content must not be classified as
`normal` if the source clearly marks it as such (checkbox syntax `- [ ]` / `- [x]` for
tasks, "As a ... I want ... so that" phrasing for user stories) — this is checked in
validation, not left to agent judgment alone.

### 6.4 Validation (backend, deterministic code — no LLM)
- Reject if any source heading is missing from `sections[]`.
- Reject if content matching task-checkbox syntax or user-story phrasing was classified
  as `type: "normal"` — this is a mechanical regex/pattern check, not re-run through an
  LLM to verify.
- On rejection: respond with the specific missing headings or misclassified sections so
  the calling agent can retry; do not silently accept partial or miscategorized output.

### 6.5 Render (backend, deterministic — WeasyPrint)
- `structured_json` → HTML template → PDF.
- Same `structured_json` in must always produce a byte-identical PDF out.
- Template: cover page (title, abstract, project name, artifact_type badge) → table of
  contents → sections **grouped and visually distinguished by type** (tasks in a
  checklist-style block, user stories in a bordered card format, design decisions in a
  labeled callout, open questions highlighted) → footer on every page with `source_path`
  + `commit_hash` for traceability.
- Documents classified as `artifact_type: 'task'` get an additional summary block at the
  top: total tasks, completed vs. pending (parsed from checkbox state), so a task
  document's PDF is scannable as a mini status report, not just prose.

### 6.6 Persist
- Store PDF file (local disk under a configurable path for local/dev; document the
  interface so object storage can be swapped in later — do not hardcode local disk
  assumptions into business logic).
- Insert `doc_versions` row: `version_no = previous + 1`.
- Update `artifacts.status = 'rendered'`.

---

## 7. Extension Package Requirements

### 7.1 Command Set

| Command | When run | What it does |
|---|---|---|
| `/speckit.ext.setup` | Once, right after installing the extension | One-time backend connection setup ONLY — see below. Never prompts for or stores an AI provider/model key (§1, §3). |
| `/speckit.ext.docgen` | Manually, or chained after `/speckit.tasks`/`/speckit.plan` | Main trigger (§4, §6). Reads the target `.md`, produces structured JSON per §6.3, POSTs to `/api/artifacts/ingest-structured`. |
| `/speckit.ext.status` | Anytime | Read-only. Calls `GET /api/projects/{id}/artifacts` and prints each artifact's `status` (`pending`/`rendered`/`stale`), so a developer can see what needs a `docgen` run without opening the dashboard. |
| `/speckit.ext.regenerate <path>` | Rarely, manual override | Forces a re-render, bypassing the §6.1 content-hash dedupe check — needed when the render template/taxonomy changes but the source `.md` didn't, so the normal skip-if-unchanged logic would otherwise suppress a refresh. |

**`/speckit.ext.setup` behavior, explicitly:**
1. Prompt for `api_base_url` only (default: `http://localhost:8000`, matching the
   docker-compose stack in §2).
2. Generate or accept a backend API key (this authenticates extension→FastAPI calls; it
   is unrelated to and must never be confused with an AI provider credential).
3. Write both to `.specify/extensions/docs-and-board/config.yml` (git-ignored for the
   key, see example below).
4. Call `POST /api/projects` (idempotent — if the project already exists for this repo,
   confirm rather than duplicate) to register the current repo.
5. Report success/failure in plain terms; on failure, tell the developer exactly what's
   unreachable (e.g. "backend not responding at http://localhost:8000 — is
   `docker compose up` running?") rather than a generic error.

```yaml
# .specify/extensions/docs-and-board/config.yml  (written by /speckit.ext.setup)
api_base_url: "http://localhost:8000"
api_key: "${SPECKIT_EXT_API_KEY}"   # value lives in env/.env, never committed
# NOTE: this file must never contain a model name, AI provider, or model API key.
# If a future change adds one, it violates the §1 zero-config requirement.
```

### 7.2 Package Layout

```
extension/
├── extension.yml               -- id, name, version, requires.speckit_version,
│                                   provides.commands=[setup, docgen, status, regenerate],
│                                   hooks=[post-commit]
├── commands/
│   ├── setup.md                 -- one-time backend connection config (§7.1)
│   ├── docgen.md                -- instructs the calling agent: read this artifact,
│   │                                produce JSON per §6.3, POST to ingest-structured
│   ├── status.md                -- read-only artifact status listing
│   └── regenerate.md            -- forced re-render, bypasses dedupe
├── scripts/
│   └── python/
│       └── post_commit_hook.py  -- implements §4 path 2 + §6.2 discovery (raw ingest, no LLM)
├── config-template.yml          -- api_base_url, api_key placeholders ONLY —
│                                   no AI provider/model config of any kind (§1, §3)
├── README.md
└── LICENSE
```

`extension.yml` must declare `speckit_version` compatibility explicitly and must NOT
declare any hook or command that touches Spec Kit's own core command files.
`config-template.yml` must never grow an AI-provider field — if a future contributor
adds one, that's a violation of the zero-config requirement in §1, not a valid feature.

---

## 8. Backend API Surface (FastAPI)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/projects` | Register/confirm a project — called by `/speckit.ext.setup` (§7.1) |
| POST | `/api/artifacts/ingest-structured` | Agent-native path: accepts pre-structured JSON (§6.3), runs §6.4-§6.6 |
| POST | `/api/artifacts/ingest-raw` | Hook fallback path: stores as `stale`, no render |
| GET | `/api/projects` | List projects |
| GET | `/api/projects/{id}/artifacts` | List artifacts for a project — also used by `/speckit.ext.status` |
| GET | `/api/artifacts/{id}/versions` | Version history for one artifact |
| GET | `/api/doc-versions/{id}/pdf` | Stream/download the rendered PDF |

All write endpoints require a bearer API key (single shared key for this spec's scope —
see §3 non-goals).

---

## 9. React Frontend Requirements

- Vite + TypeScript, functional components, React Query (or equivalent) for data fetching — no Redux needed at this scope.
- Routes: `/` (project list) → `/projects/:id` (artifact list) → `/artifacts/:id` (version history + inline PDF preview via `<iframe>` or a PDF.js viewer component).
- Artifact list must group/filter by `artifact_type`, and must render an "other" group for unrecognized types rather than hiding them — the list should never silently omit a discovered `.md` file.
- Artifact list must also show `source_tool` per artifact (a small "Spec Kit" / "Kiro" badge is sufficient) so it's visible at a glance which framework produced which document — see §0.4.
- Status chip per artifact: `pending` / `rendered` / `stale` (stale = hook-fallback path, needs `/speckit.ext.docgen` re-run — link out to instructions, don't try to trigger it from the UI, since the UI cannot invoke the developer's agent session).
- Version detail view should visually distinguish section types matching §6.3's taxonomy (task / user_story / design_decision / callout / open_question / normal) — mirror the PDF's visual grouping in the web view, don't just dump `structured_json` as flat text.
- **UI components must use shadcn/ui** (Radix primitives + Tailwind, installed via the shadcn CLI into the project — not a runtime npm package). Use its components for anything matching a standard pattern: `Table`/`DataTable` for the artifact list, `Badge` for status chips and `source_tool`/`artifact_type` labels, `Card` for user-story/design-decision blocks, `Tabs` or `Accordion` for the version history view, `Dialog` for the PDF preview if not using a dedicated viewer. Do not hand-roll a component shadcn already provides. Custom components (the checklist-style task block, the PDF preview itself) are fine where no shadcn equivalent exists — build those with Tailwind directly, still matching shadcn's visual language (same spacing/radius/color tokens) rather than introducing a second, inconsistent style.

---

## 10. Definition of Done (this feature only)

- [ ] `docker compose up` starts Postgres + FastAPI + React locally with one command
- [ ] Running `/speckit.ext.docgen` inside a real Spec Kit project produces a valid PDF end-to-end
- [ ] Editing the same `.md` twice without changing content does NOT trigger a second render (dedupe verified)
- [ ] Editing a `.md` file directly via git commit (no agent session) results in `status = 'stale'`, not a crash and not a silent skip
- [ ] Every heading in a real `plan.md` from an existing project (e.g. CourseHub) appears in the rendered PDF
- [ ] A `.md` file with a name not in the recognized list (e.g. a file added by another installed extension) is still discovered, ingested, and classified `artifact_type = 'other'` — not skipped
- [ ] A real Kiro-generated `requirements.md` or `design.md` under `.kiro/specs/**` is discovered, correctly classified (`source_tool = 'kiro'`, `artifact_type = 'spec'`/`'plan'`), and rendered to PDF exactly like a Spec Kit file would be — this is the concrete test of §0.4
- [ ] A real `tasks/*.md` file's checkbox items render as `type: "task"` sections in both the PDF and the React version view, with a completed/pending summary count
- [ ] A user story written as "As a ... I want ... so that ..." in a real `spec.md` renders as `type: "user_story"`, not `normal`
- [ ] Extension installs cleanly via `specify extension add ./extension` in a clean Spec Kit project
- [ ] `/speckit.ext.setup` run against a stopped backend fails with a clear, specific error, not a stack trace or silent hang
- [ ] `/speckit.ext.setup` run twice on the same project does not create a duplicate `projects` row
- [ ] `/speckit.ext.status` lists all artifacts with correct state without requiring the dashboard to be open
- [ ] `/speckit.ext.regenerate <path>` produces a new `doc_versions` row even when `content_hash` is unchanged from the last version
- [ ] `/speckit.ext.docgen` produces a correct, valid PDF when run under at least two different coding agents (e.g. Claude Code and one other Spec Kit-supported agent) with zero changes to the extension's own configuration between runs — this is the concrete test of the §1 zero-config requirement
