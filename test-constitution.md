<!--Sync Impact Report
Version: 0.0.0 → 1.0.0
Modified principles:
- project name placeholder → Documentation Agent Extension
- principle 1 name placeholder → I. Configuration-Driven Commands
- principle 2 name placeholder → II. Workspace-Relative IO
- principle 3 name placeholder → III. Backend Contract Fidelity
- principle 4 name placeholder → IV. Secret Safety and Idempotence
- principle 5 name placeholder → V. Observable, Re-runnable Operations

Added sections:
- Security and Configuration
- Execution and Quality Gates

Removed sections:
- Placeholder template comments and tokens

Templates requiring updates:
- ✅ updated: .specify/templates/plan-template.md
- ⚠ pending: .specify/templates/spec-template.md (reviewed, no changes needed)
- ⚠ pending: .specify/templates/tasks-template.md (reviewed, no changes needed)
- ⚠ pending: .github/prompts/README.md (reviewed, no changes needed)

Follow-up TODOs:
- None
-->

# Documentation Agent Extension Constitution

## Core Principles

### I. Configuration-Driven Commands

Every command, script, and prompt that talks to the backend MUST load its
runtime settings from .specify/extensions/docs-agent/config.yml. The default
values in the setup prompt are the only implicit defaults; after setup, the
config file is the source of truth for API base URL, API key, and any future
backend-specific settings. This keeps command behavior stable across terminals
and prevents hard-coded endpoints from drifting.

### II. Workspace-Relative IO

Commands MUST treat the workspace root as the boundary for file discovery,
source_path values, and generated artifact references. Inputs and outputs should
use relative paths when they describe workspace content, and commands must
refuse to invent paths outside the workspace. This makes document processing
reproducible and keeps backend records portable across machines.

### III. Backend Contract Fidelity

All requests to the Documentation Agent backend MUST follow the documented API
contracts exactly, including endpoints, headers, payload shapes, and response
handling. Commands MUST register the project before claiming success, and they
MUST surface backend validation or authentication failures with the specific
problem so the user can correct the backend or credentials.

### IV. Secret Safety and Idempotence

API keys and other credentials MUST be handled as secrets: they may be written
to the extension config file when required, but they MUST NOT be echoed in
status output, logs, prompts, or generated artifacts. Setup and regeneration
flows MUST be safe to repeat; if the backend already has the project or
artifact, the command should confirm the existing connection instead of failing
on duplicate state.

### V. Observable, Re-runnable Operations

Each slash command MUST have a narrow, predictable responsibility and emit
actionable progress or failure information. Long-running or repeatable tasks,
such as the watcher, MUST remain recoverable and must clearly state what they
are monitoring or changing. If a command cannot complete, the user MUST be told
what to do next without hidden side effects.

## Security and Configuration

- The extension config lives at .specify/extensions/docs-agent/config.yml and
MUST be readable by setup, docgen, status, regenerate, and watch flows.
- The setup command SHOULD use http://localhost:8000 and dev-key as defaults,
but those defaults are only starting values; the saved config is authoritative
after setup finishes.
- Backend requests MUST use Bearer authentication and Content-Type:
application/json.
- Sensitive values MUST be kept out of user-facing summaries unless a command
explicitly requires them for execution context.
- Project registration is part of setup and MUST be treated as a required step,
not a best-effort add-on.

## Execution and Quality Gates

- Documentation and command prompts MUST align with the backend contract and
the workspace file layout they describe.
- Any change that alters command behavior, config structure, or backend payloads
MUST be validated against the affected command path before it is considered
complete.
- Missing configuration MUST fail fast with a direct instruction to run
/speckit.ext.setup.
- Repeated runs of setup, docgen, regenerate, and watch MUST not require
manual cleanup between executions.
- When behavior depends on the active markdown file, the command MUST say so
plainly and avoid guessing the intended source file.

## Governance

This constitution supersedes informal guidance, README notes, and prompt-level
defaults when they conflict. Amendments require an explicit rationale, a
version bump, and a review of any dependent prompt or template files whose
behavior or validation rules change. Compliance is expected for all extension
commands, scripts, and generated artifacts; deviations MUST be justified in the
plan or task documentation before implementation.

**Version**: 1.0.0 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-07-21
