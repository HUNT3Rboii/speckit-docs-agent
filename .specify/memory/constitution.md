# Documentation Agent Constitution

<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.0.0
- Modified principles: none (new constitution)
- Added sections: Scope and Deliverables, Review and Validation
- Removed sections: none
- Templates requiring updates: ✅ .specify/templates/plan-template.md, ✅ .specify/templates/spec-template.md, ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: none
-->

## Core Principles

### I. Spec Kit Scope Discipline
This project MUST remain within the Spec Kit-side Documentation Agent scope defined in the feature spec. Work MUST target the extension package, backend/API, markdown-to-PDF pipeline, and Docker/Postgres setup; it MUST NOT scaffold frontend code, add unrelated product features, or expand into ticket-board/Kanban functionality. Rationale: This feature is explicitly a two-phase effort with a separate handoff, and scope drift would break the intended architecture and delivery plan.

### II. Zero-Config Agent-Native Execution
The primary documentation-generation path MUST use the existing agent session that is already driving the developer's Spec Kit workflow. The extension MUST NOT require a separate AI provider, model selection, or API key for that path; it may only rely on the current agent context and the configured backend URL. Rationale: The zero-config requirement is a product promise and a core compatibility constraint.

### III. Non-Goal Boundary Enforcement
The implementation MUST NOT violate the explicit non-goals from the feature spec. That means no support for Markdown sources outside the repository's Spec Kit artifact directories, no modification of core Spec Kit command templates or prompt files, no multi-user authentication system beyond a single shared extension-to-backend API key, and no addition of separate AI-provider configuration for the primary path. Rationale: These exclusions protect compatibility, reduce implementation risk, and keep the feature focused on its intended purpose.

## Scope and Deliverables
All implementation work for this repository MUST produce or support the Spec Kit extension, the backend ingestion/rendering flow, and the documentation pipeline artifacts needed for PDF generation and storage. The work MUST preserve the agent-native trigger and the fallback path defined by the feature spec, and it MUST keep frontend implementation and unrelated product features out of this session's scope. Any proposal that broadens the feature beyond the Spec Kit-side backend and pipeline work is a constitution violation unless the constitution is amended first.

## Review and Validation
Every plan, spec, and task list MUST explicitly confirm that it respects the three principles above before implementation begins. Reviews MUST check for scope creep, provider-configuration drift, and violations of the explicit non-goals. If a requirement cannot be satisfied within these constraints, the implementation plan MUST document the tradeoff and seek a constitution change rather than silently expanding scope.

## Governance
This constitution supersedes ad-hoc scope expansion and convenience-driven shortcuts. Amendments require a documented change to this file, a version bump, and a review that confirms the new rule still fits the project's Spec Kit-only scope. Compliance is reviewed at the plan, spec, and task-generation stages; violations MUST be corrected or explicitly accepted as a documented exception before work proceeds.

**Version**: 1.0.0 | **Ratified**: 2026-07-16 | **Last Amended**: 2026-07-16
