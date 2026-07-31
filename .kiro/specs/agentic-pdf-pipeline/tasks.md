# Implementation Plan: Agentic PDF Pipeline

## Overview

This implementation creates a zero-config, evidence-based validation system that transforms markdown documents into professional PDFs with AI enrichment and deterministic validation. The system uses a single AI call for enrichment, fuzzy matching for validation, and automatic retry loops for self-correction. The architecture consists of a TypeScript VSCode extension (Stage 1) and a Python backend (Stages 2-3).

## Tasks

- [x] 1. Set up project structure and core interfaces
  - Create backend Python package structure (services/, models/, validators/)
  - Create extension TypeScript module structure
  - Define shared data models and interfaces
  - Set up testing frameworks (pytest for backend, Jest for extension)
  - Install core dependencies (rapidfuzz, weasyprint, jsonschema for backend; Node.js crypto for extension)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Implement content hash and caching services
  - [x] 2.1 Create ContentHashService (TypeScript) with SHA-256 computation
    - Implement computeHash() method using Node.js crypto module
    - Implement compareHashes() method for hash comparison
    - _Requirements: 1.1_

  - [ ]* 2.2 Write property test for content hash stability
    - **Property 1: Content Hash Stability**
    - **Validates: Requirements 1.1**

  - [ ]* 2.3 Write property test for content hash uniqueness
    - **Property 2: Content Hash Uniqueness**
    - **Validates: Requirements 1.1, 1.5**

  - [x] 2.4 Create ArtifactCacheService (Python) with storage and lookup
    - Implement check_cache() to lookup artifacts by content hash
    - Implement store_artifact() with hash metadata
    - Implement get_artifact_path() for retrieval
    - Use filesystem with JSON metadata for storage
    - _Requirements: 1.2, 1.3_

  - [ ]* 2.5 Write property test for cache round-trip preservation
    - **Property 3: Cache Round-Trip Preservation**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 2.6 Write property test for single character change detection
    - **Property 4: Single Character Change Triggers Reprocessing**
    - **Validates: Requirements 1.5**

- [x] 3. Checkpoint - Verify caching infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement AI transformation components (Extension)
  - [x] 4.1 Create EnrichmentPromptBuilder (TypeScript)
    - Implement buildPrompt() that includes full JSON schema
    - Specify evidence requirements in prompt (verbatim excerpts)
    - Include self-check instructions per Requirement 2.5
    - Add examples of valid diagram components and glossary entries with evidence
    - _Requirements: 2.1, 2.2, 3.1, 3.3, 3.4_

  - [x] 4.2 Create AIProviderFactory (TypeScript) to detect active AI
    - Detect Copilot/Claude/Kiro from VSCode context
    - Provide unified interface for AI calls
    - _Requirements: 2.4_

  - [x] 4.3 Create SingleCallAITransformer (TypeScript)
    - Implement transform() that calls AI provider with prompt
    - Parse AI response into EnrichedJSON structure
    - Add 15-second timeout per design
    - Validate response contains all required fields before returning
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.4 Implement fallbackTransform() for AI failures
    - Generate structure-only EnrichedJSON (no diagrams/glossary/summaries)
    - Preserve document headings and content
    - _Requirements: 2.6_

  - [ ]* 4.5 Write property test for AI failure fallback
    - **Property 5: AI Failure Triggers Fallback**
    - **Validates: Requirements 2.5**

- [x] 5. Implement schema validation (Backend)
  - [x] 5.1 Create EnrichedJSONValidator (Python)
    - Implement validate_schema() using jsonschema library
    - Check required fields: title, abstract, sections, diagrams, glossary, summaries
    - Validate field types and enum values
    - _Requirements: 3.1_

  - [x] 5.2 Implement validate_evidence_fields()
    - Check each diagram has components[] with name AND evidence
    - Check each glossary entry has term, definition, AND evidence
    - Return specific errors naming missing evidence fields
    - _Requirements: 3.3, 3.4, 3.6_
    - Done: see backend/IMPLEMENTATION_REPORT_TASK_5_2.md; checkbox was stale, code already complete.

  - [ ]* 5.3 Write property test for enriched JSON schema validation
    - **Property 6: Enriched JSON Schema Validation**
    - **Validates: Requirements 3.1, 3.6**

  - [ ]* 5.4 Write property test for section structure validation
    - **Property 7: Section Structure Validation**
    - **Validates: Requirements 3.2**

  - [ ]* 5.5 Write property test for diagram structure validation
    - **Property 8: Diagram Structure Validation**
    - **Validates: Requirements 3.3**

  - [ ]* 5.6 Write property test for glossary structure validation
    - **Property 9: Glossary Structure Validation**
    - **Validates: Requirements 3.4**

  - [ ]* 5.7 Write property test for summary structure validation
    - **Property 10: Summary Structure Validation**
    - **Validates: Requirements 3.5, 6.5**

- [x] 6. Checkpoint - Verify schema validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement fuzzy matching service (Backend)
  - [x] 7.1 Create FuzzyMatchService (Python)
    - Implement fuzzy_match() using rapidfuzz token_sort_ratio
    - Implement similarity_score() returning 0.0-1.0
    - Implement find_best_match() to find best candidate above threshold
    - Set default threshold to 0.85 (85% similarity)
    - Normalize whitespace and handle case-insensitivity
    - _Requirements: 7.4, 8.2, 9.3_

  - [ ]* 7.2 Write unit tests for fuzzy matching edge cases
    - Test with punctuation differences
    - Test with case differences
    - Test with whitespace variations
    - Test threshold boundary conditions
    - _Requirements: 7.4, 8.2, 9.3_

- [x] 8. Implement heading preservation validator (Backend)
  - [x] 8.1 Create HeadingPreservationValidator (Python)
    - Implement extract_markdown_headings() using regex for # through ######
    - Implement extract_json_headings() from sections array
    - Implement validate_preservation() using FuzzyMatchService (≥85%)
    - Return structured error with specific missing headings
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 8.2 Write property test for markdown heading extraction
    - **Property 11: Markdown Heading Extraction Completeness**
    - **Validates: Requirements 7.1**

  - [ ]* 8.3 Write property test for JSON heading extraction
    - **Property 12: JSON Heading Extraction Completeness**
    - **Validates: Requirements 7.2**

  - [ ]* 8.4 Write property test for heading preservation validation
    - **Property 13: Heading Preservation Validation**
    - **Validates: Requirements 7.3, 7.4**

- [x] 9. Implement diagram grounding validator (Backend)
  - [x] 9.1 Create DiagramGroundingValidator (Python)
    - Implement validate_diagram_evidence() that fuzzy matches each component's evidence field against source (≥85%)
    - Validate evidence text only, NOT component names
    - Return structured error naming ungrounded components with their claimed evidence
    - Implement validate_mermaid_syntax() for parse-checking
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 9.2 Implement validate_all_diagrams()
    - Iterate all diagrams and validate each
    - Collect errors per diagram
    - Filter out diagrams that fail validation
    - _Requirements: 8.3, 8.5_

  - [ ]* 9.3 Write property test for diagram grounding validation
    - **Property 15: Diagram Grounding Validation**
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 9.4 Write property test for diagram filtering
    - **Property 16: Diagram Filtering Preserves Valid Diagrams**
    - **Validates: Requirements 8.5**

- [x] 10. Implement glossary term validator (Backend)
  - [x] 10.1 Create GlossaryTermValidator (Python)
    - Implement validate_entry_evidence() that fuzzy matches evidence against source (≥85%)
    - Perform case-insensitive matching
    - Return structured error naming rejected entries
    - _Requirements: 9.1, 9.2_

  - [x] 10.2 Implement validate_all_entries()
    - Iterate all glossary entries
    - Collect validation errors
    - Filter out entries that fail validation
    - _Requirements: 9.3, 9.5, 5.4, 5.5_

  - [ ]* 10.3 Write property test for glossary term existence validation
    - **Property 17: Glossary Term Existence Validation**
    - **Validates: Requirements 9.1, 9.3**

  - [ ]* 10.4 Write property test for glossary filtering
    - **Property 18: Glossary Filtering Removes Non-Existent Terms**
    - **Validates: Requirements 9.2, 9.5, 5.4, 5.5**

- [x] 11. Checkpoint - Verify evidence-based validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement retry loop orchestration (Backend)
  - [x] 12.1 Create RetryLoopOrchestrator (Python)
    - Implement validate_with_retry() coordinating all validators
    - Implement build_structured_error() listing specific failures
    - Implement retry logic (max 2 attempts)
    - Implement proceed_with_validated() for graceful degradation
    - Add callback interface for Extension_AI session
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 12.2 Write integration tests for retry loop
    - Test successful validation after first retry
    - Test exhausted retries leading to partial proceeding
    - Test structured error format
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 13. Implement diagram rendering service (Backend)
  - [x] 13.1 Create DiagramRenderingService (Python)
    - Implement render_with_mmdc() calling mmdc CLI subprocess
    - Set PNG output to 1200x800px, transparent background
    - Implement render_with_kroki() as fallback using requests
    - Implement render_diagram() coordinating primary/fallback
    - Add one-time warning for Kroki privacy concern
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 13.2 Implement diagram caching
    - Implement check_cache() using content hash of mermaidCode
    - Cache rendered PNGs by hash
    - Return cached path on cache hit
    - _Requirements: 11.4_

  - [x] 13.3 Add graceful failure handling
    - Return placeholder path if both mmdc and Kroki fail
    - Log errors without failing entire document
    - _Requirements: 11.5_

  - [ ]* 13.4 Write property test for diagram cache key determinism
    - **Property 19: Diagram Cache Key Determinism**
    - **Validates: Requirements 10.5**

  - [ ]* 13.5 Write property test for diagram cache reuse
    - **Property 20: Diagram Cache Reuse**
    - **Validates: Requirements 10.6**

  - [ ]* 13.6 Write property test for mmdc fallback to Kroki
    - **Property 21: mmdc Fallback to Kroki**
    - **Validates: Requirements 10.4**

- [x] 14. Implement HTML generation service (Backend)
  - [x] 14.1 Create HTMLGeneratorService (Python)
    - Implement generate_cover_page() with title, abstract, metadata
    - Implement generate_table_of_contents() for heading levels 1-3
    - Implement embed_diagrams() at specified locations
    - Implement linkify_glossary_terms() for first occurrence per section
    - Apply professional CSS styling
    - Add page breaks for major sections
    - _Requirements: 12.1, 12.2, 12.4_
    - Fixed: this checkbox was false — generate_html() called generate_cover_page(),
      generate_table_of_contents(), embed_diagrams(), linkify_glossary_terms(), and two private
      helpers, none of which were defined anywhere in the file (confirmed: 458 lines, no matching
      `def`s). Calling generate_html() raised AttributeError. All methods now implemented; see
      backend/tests/unit/test_html_generator.py (new, 14 tests).

  - [x] 14.2 Implement section-specific rendering
    - Render task sections as checklist blocks
    - Render user-story sections as cards
    - Render design-decision sections as callouts
    - Group sections by type
    - _Requirements: 12.3_
    - Fixed alongside 14.1 (same missing-methods issue).

  - [x] 14.3 Implement conditional summary embedding
    - Embed section summaries for sections > 200 words
    - Embed executive summary on cover page
    - _Requirements: 11.1, 11.2_
    - Fixed alongside 14.1 (same missing-methods issue).

  - [ ]* 14.4 Write property test for executive summary on cover page
    - **Property 22: Executive Summary Appears on Cover Page**
    - **Validates: Requirements 11.1, 12.2**

  - [ ]* 14.5 Write property test for section summary embedding
    - **Property 23: Section Summary Conditional Embedding**
    - **Validates: Requirements 11.2**

  - [ ]* 14.6 Write property test for diagram placement
    - **Property 24: Diagram Placement at Specified Locations**
    - **Validates: Requirements 11.3**

  - [ ]* 14.7 Write property test for glossary term linking
    - **Property 25: Glossary Term First Occurrence Linking**
    - **Validates: Requirements 11.4**

  - [ ]* 14.8 Write property test for table of contents coverage
    - **Property 26: Table of Contents Heading Level Coverage**
    - **Validates: Requirements 12.2**

- [x] 15. Implement PDF generation service (Backend)
  - [x] 15.1 Create PDFGeneratorService (Python)
    - Implement generate_pdf() using WeasyPrint
    - Configure 1-inch margins on all sides
    - Generate page numbers in footers
    - Preserve hyperlinks and formatting
    - _Requirements: 12.1, 12.4_

  - [x] 15.2 Add fallback to HTML output
    - Return HTML if WeasyPrint fails
    - Log error without failing document
    - _Requirements: 12.5_

  - [ ]* 15.3 Write unit tests for PDF generation
    - Test margin configuration
    - Test page number generation
    - Test hyperlink preservation
    - _Requirements: 12.4_

- [x] 16. Checkpoint - Verify rendering pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement pipeline orchestration (Extension)
  - [x] 17.1 Create PipelineOrchestrator (TypeScript)
    - Implement process() coordinating all three stages
    - Stage 1: Compute hash, check cache, call AI, parse response
    - Stage 2: Send to backend for validation (with retry loop)
    - Stage 3: Backend rendering returns PDF path
    - Track processing status and timing
    - _Requirements: 1.1, 1.2, 2.1, 2.2_

  - [x] 17.2 Create BackendClient (TypeScript)
    - Implement HTTP client for backend API
    - Send EnrichedJSON with source markdown
    - Handle retry loop responses
    - Receive PDF path on success
    - _Requirements: 10.1, 10.2_

  - [x] 17.3 Implement error handling and user feedback
    - Show progress notifications during processing
    - Display structured errors from validation
    - Show cache hit notifications
    - Report processing time and stage timings
    - _Requirements: 1.3, 10.4_

- [x] 18. Implement backend API endpoints (Backend)
  - [x] 18.1 Create FastAPI application
    - Set up FastAPI app with CORS
    - Add health check endpoint
    - Configure logging
    - _Requirements: All backend communication_

  - [x] 18.2 Create /api/process endpoint
    - Accept EnrichedJSON and source markdown
    - Orchestrate validation pipeline
    - Orchestrate rendering pipeline
    - Return PDF path or structured errors
    - Support retry loop protocol
    - _Requirements: 7.1, 8.1, 9.1, 10.1, 11.1, 12.1_
    - Done: app/api/process_routes.py + app/services/agentic_pipeline_service.py (this checkbox was
      previously false despite being checked — no such endpoint existed; verified by grepping
      app/api/ before implementing). Retry loop is client-driven over HTTP (see design decision in
      this feature's implementation notes), not a synchronous backend callback.

  - [x] 18.3 Create /api/status endpoint
    - Return processing status by artifact ID
    - Include stage timings and cache status
    - _Requirements: 13.1, 13.2_
    - Done: GET /api/status/{artifact_id} in process_routes.py, backed by
      AgenticPipelineService.get_status() and a new ArtifactRepository/PostgresArtifactRepository
      .get_artifact_by_id() (neither repo had a by-id lookup before).

  - [x]* 18.4 Write integration tests for API endpoints
    - Test successful processing flow
    - Test validation failure and retry
    - Test cache hit scenario
    - Test fallback scenarios
    - _Requirements: 1.1, 2.6, 10.1, 11.3, 11.5, 12.5_
    - Done: backend/tests/integration/test_process_endpoint.py (8 tests: happy path, retry_needed,
      exhausted-retry graceful degradation, corrected resubmission, content-hash skip, status
      reporting). Diagram rendering is stubbed so tests don't depend on mmdc/network.

- [x] 19. Implement performance optimizations
  - [x] 19.1 Add performance tracking
    - Track Stage 1 (AI call) timing
    - Track Stage 2 (validation) timing
    - Track Stage 3 (rendering) timing
    - Report total end-to-end time
    - _Requirements: 13.1_

  - [x] 19.2 Optimize diagram rendering
    - Ensure cache lookup before rendering
    - Parallel diagram rendering where possible
    - Target <500ms per cached diagram
    - _Requirements: 13.2_

  - [x] 19.3 Optimize validation pipeline
    - Run independent validators in parallel
    - Target <20 seconds for documents under 5000 words
    - _Requirements: 13.1_

  - [ ]* 19.4 Write performance tests
    - Test end-to-end timing for 5000-word document
    - Test cached diagram reuse timing
    - These are soft targets, not hard gates
    - _Requirements: 13.1, 13.2, 13.3_

- [x] 20. Final integration and wiring
  - [x] 20.1 Wire extension to backend
    - Configure backend URL in extension settings
    - Add connection testing
    - Handle backend unavailability gracefully
    - _Requirements: All_
    - Done: TransformPipeline now calls backendClient.process() (/api/process) instead of the
      legacy ingest() path, with the AI providers sending an EnrichedJSON payload via
      EnrichmentPromptBuilder. Connection testing/unavailability handling already existed and was
      untouched.

  - [x] 20.2 Add artifact status tracking
    - Track validation failures and recoveries
    - Track dropped diagrams/glossary entries
    - Expose status via dashboard API
    - _Requirements: 10.4_
    - Done: this checkbox was previously false — nothing tracked dropped items anywhere. Now
      recorded in the artifact's existing `metadata` JSON column and exposed via GET
      /api/status/{artifact_id}. No frontend UI change (API only, per plan scope).

  - [x] 20.3 Add configuration validation
    - Check mmdc CLI availability on backend startup
    - Warn if Kroki will be primary method
    - Validate WeasyPrint installation
    - _Requirements: 11.1, 11.3, 12.5_
    - Done: this checkbox was previously false — no startup check existed. Added a FastAPI
      lifespan handler in app/main.py (shutil.which("mmdc"), weasyprint import check, both
      warn-only/non-fatal). Also added mmdc + Node.js to backend/Dockerfile so mmdc is actually
      installed in the container (previously absent entirely, meaning Kroki was the only real
      option in Docker) — NOT verified via an actual `docker build` in this session (Docker
      Desktop wasn't running here); worth confirming before relying on it.

  - [x]* 20.4 Write end-to-end integration tests
    - Test complete flow from markdown to PDF
    - Test retry loop with validation failures
    - Test cache deduplication
    - Test fallback scenarios
    - _Requirements: 1.1, 1.2, 2.6, 10.1, 11.5, 12.5_
    - Done: covered by test_process_endpoint.py (backend) — see 18.4. Extension-side end-to-end
      (actual Extension Development Host + real backend) was not run in this session; the new
      Jest unit suite covers the client-side logic (prompt building, schema validation,
      rule-based fallback shape) but not a live VS Code + backend round trip.

- [x] 21. Final checkpoint - Complete system validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical breakpoints
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- The retry loop (Requirement 10) is critical for self-correction and should be tested thoroughly
- Fuzzy matching (≥85% threshold) is used throughout validation to tolerate trivial rewording
- Evidence-based validation never judges AI's semantic accuracy, only checks claimed excerpts exist in source

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1", "2.1"]
    },
    {
      "id": 1,
      "tasks": ["2.2", "2.3", "2.4"]
    },
    {
      "id": 2,
      "tasks": ["2.5", "2.6", "4.1", "4.2"]
    },
    {
      "id": 3,
      "tasks": ["4.3", "4.4", "5.1"]
    },
    {
      "id": 4,
      "tasks": ["4.5", "5.2"]
    },
    {
      "id": 5,
      "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7", "7.1"]
    },
    {
      "id": 6,
      "tasks": ["7.2", "8.1"]
    },
    {
      "id": 7,
      "tasks": ["8.2", "8.3", "8.4", "9.1"]
    },
    {
      "id": 8,
      "tasks": ["9.2", "10.1"]
    },
    {
      "id": 9,
      "tasks": ["9.3", "9.4", "10.2"]
    },
    {
      "id": 10,
      "tasks": ["10.3", "10.4", "12.1"]
    },
    {
      "id": 11,
      "tasks": ["12.2", "13.1"]
    },
    {
      "id": 12,
      "tasks": ["13.2", "13.3"]
    },
    {
      "id": 13,
      "tasks": ["13.4", "13.5", "13.6", "14.1"]
    },
    {
      "id": 14,
      "tasks": ["14.2", "14.3"]
    },
    {
      "id": 15,
      "tasks": ["14.4", "14.5", "14.6", "14.7", "14.8", "15.1"]
    },
    {
      "id": 16,
      "tasks": ["15.2", "15.3", "17.1"]
    },
    {
      "id": 17,
      "tasks": ["17.2", "17.3", "18.1"]
    },
    {
      "id": 18,
      "tasks": ["18.2", "18.3"]
    },
    {
      "id": 19,
      "tasks": ["18.4", "19.1", "19.2", "19.3"]
    },
    {
      "id": 20,
      "tasks": ["19.4", "20.1", "20.2", "20.3"]
    },
    {
      "id": 21,
      "tasks": ["20.4"]
    }
  ]
}
```
