# Tasks: Documentation Agent Pipeline

**Input**: Design documents from `/specs/001-documentation-agent/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included for the core backend validation and ingestion flows because the feature specification explicitly calls for validation and deduplication behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Constitutional constraints**: Tasks stay within the Spec Kit-side extension/backend/pipeline/Docker/Postgres scope, preserve the zero-config agent-native path, and avoid frontend, Kanban, or other non-goal work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the extension package, backend skeleton, and local container wiring.

- [ ] T001 Create the extension package structure at extension/, extension/commands/, extension/scripts/python/, and extension/config-template.yml
- [ ] T002 Initialize the FastAPI backend skeleton under backend/app/ with main entrypoint, API route modules, and dependency scaffolding
- [ ] T003 [P] Create the PostgreSQL container and local development wiring in infra/docker-compose.yml
- [ ] T004 [P] Create the initial test structure under backend/tests/contract/, backend/tests/integration/, and backend/tests/unit/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared ingestion, persistence, validation, and rendering foundations used by all stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 Create the PostgreSQL schema for projects, artifacts, and doc_versions in backend/app/models/schemas.py and the associated repository layer in backend/app/repositories/artifact_repo.py
- [ ] T006 Implement the project registration and artifact persistence flow for the backend API in backend/app/api/routes.py
- [ ] T007 Implement artifact discovery and classification logic for both specs/** and .kiro/specs/** in backend/app/services/ingestion.py
- [ ] T008 Implement content-hash deduplication before any AI-driven or render-related work in backend/app/services/ingestion.py
- [ ] T009 Implement deterministic validation logic for missing headings and misclassified task/user-story content in backend/app/services/validation.py
- [ ] T010 Implement the render pipeline entrypoint and PDF generation integration in backend/app/services/rendering.py
- [ ] T011 Configure environment and configuration handling for API base URL, API key, and output storage path in backend/app/api/deps.py and backend/app/main.py

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Generate documentation from repository artifacts (Priority: P1) 🎯 MVP

**Goal**: Discover markdown artifacts, classify them, and create initial renderable documentation records.

**Independent Test**: A developer can trigger the workflow for a supported markdown artifact and receive a documented artifact record and render output.

### Tests for User Story 1

- [ ] T012 [P] [US1] Add contract tests for the structured ingestion endpoint in backend/tests/contract/test_ingest_structured.py
- [ ] T013 [P] [US1] Add integration tests for artifact discovery and classification in backend/tests/integration/test_ingestion_flow.py

### Implementation for User Story 1

- [ ] T014 [P] [US1] Implement the structured ingestion endpoint for POST /api/artifacts/ingest-structured in backend/app/api/routes.py
- [ ] T015 [US1] Wire the ingestion service to classify artifacts and create or update artifact records in backend/app/services/ingestion.py
- [ ] T016 [US1] Connect validation and render orchestration to the structured path in backend/app/services/validation.py and backend/app/services/rendering.py
- [ ] T017 [US1] Persist versioned PDF and structured JSON output in backend/app/services/persistence.py

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Avoid duplicate work and preserve version history (Priority: P2)

**Goal**: Skip unchanged content safely and keep a clear version history for each artifact.

**Independent Test**: Re-submitting unchanged content produces no new version, while changed content produces a fresh version.

### Tests for User Story 2

- [ ] T018 [P] [US2] Add unit tests for deduplication behavior in backend/tests/unit/test_deduplication.py
- [ ] T019 [P] [US2] Add integration tests for version creation and skipping unchanged content in backend/tests/integration/test_versioning.py

### Implementation for User Story 2

- [ ] T020 [P] [US2] Implement the content-hash lookup and no-op return path in backend/app/services/ingestion.py
- [ ] T021 [US2] Implement version increment and persisted doc_versions creation in backend/app/services/persistence.py
- [ ] T022 [US2] Ensure artifacts.status is set to rendered for successful renders and stale for fallback-only ingestion in backend/app/services/persistence.py

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Maintain readable, structured documentation output (Priority: P2)

**Goal**: Ensure rendered output is organized by section type and preserves the required structure taxonomy.

**Independent Test**: Rendered output clearly distinguishes task, user story, design decision, and normal sections in the generated document.

### Tests for User Story 3

- [ ] T023 [P] [US3] Add unit tests for render structure grouping in backend/tests/unit/test_rendering.py
- [ ] T024 [P] [US3] Add integration tests for task and user-story section classification in backend/tests/integration/test_render_structure.py

### Implementation for User Story 3

- [ ] T025 [P] [US3] Implement task, user story, design decision, and fallback section rendering in backend/app/services/rendering.py
- [ ] T026 [US3] Implement the task-summary block for artifact_type task documents in backend/app/services/rendering.py
- [ ] T027 [US3] Ensure the render output includes the required cover page, table of contents, section grouping, and footer metadata in backend/app/services/rendering.py

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Extension and Hook Support

**Purpose**: Expose the extension commands and wire the fallback ingestion path for post-commit changes.

- [ ] T028 Create the extension command documents at extension/commands/setup.md, extension/commands/docgen.md, extension/commands/status.md, and extension/commands/regenerate.md
- [ ] T029 Implement the post-commit hook script at extension/scripts/python/post_commit_hook.py for raw ingestion and stale-state handling
- [ ] T030 Implement the extension configuration template at extension/config-template.yml with API base URL and API key placeholders only
- [ ] T031 [P] Add extension manifest metadata in extension/extension.yml for commands, hooks, and compatibility requirements

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, documentation, and hardening for the pipeline.

- [ ] T032 [P] Add quickstart and usage guidance in specs/001-documentation-agent/quickstart.md and extension/README.md
- [ ] T033 [P] Add error handling and clear failure messaging for setup and validation failures in backend/app/api/routes.py and extension/commands/
- [ ] T034 Run the backend test suite and verify the documented end-to-end behaviors for discovery, validation, dedupe, and rendering

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-5)**: All depend on Foundational completion
- **Extension and Hook Support (Phase 6)**: Depends on Foundational completion and the core API endpoints
- **Polish (Phase 7)**: Depends on all desired user stories and extension support being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Parallel Opportunities

- Setup tasks T003 and T004 can run in parallel
- Foundational tasks T007 and T008 can progress in parallel once the schema and route skeleton exist
- User story implementation tasks marked [P] can be completed in parallel where file boundaries do not overlap
- Extension and hook tasks T029 and T031 can be completed in parallel once the foundational API exists

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 tests and verify a successful render path
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Validate independently
3. Add User Story 2 → Validate independently
4. Add User Story 3 → Validate independently
5. Add extension and hook support → Validate integration
