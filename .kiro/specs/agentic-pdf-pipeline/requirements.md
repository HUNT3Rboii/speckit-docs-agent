# Requirements Document

## Introduction

A zero-config, agentic-generation / deterministic-validation pipeline that transforms markdown into professional PDFs with diagrams, glossaries, and summaries. One AI call (whatever model is already active in the IDE/extension) performs all enrichment, citing evidence for every diagram component and glossary term it produces. A deterministic backend validates that evidence against the source text — never judging the AI's semantic conclusions, only checking that what it claims actually appears in the document. Failures return specific, structured errors; the same agent corrects and resubmits. No separate AI provider, model, or API key is ever configured anywhere in this system.

## Glossary

- **Extension_AI**: Whatever AI provider is already active in the developer's session (Copilot, Claude, Kiro, etc.) — never separately configured by this pipeline
- **Content_Hash**: SHA-256 of raw markdown content, used for dedupe
- **Enriched_JSON**: Single JSON output from Extension_AI containing all enrichments
- **Evidence**: A short, verbatim-or-near-verbatim excerpt from the source document that a diagram component or glossary term claims to be grounded in
- **Backend_Validator**: Deterministic code (no AI, no model call) that checks Enriched_JSON against the source document
- **Diagram_Renderer**: Renders Mermaid_Code to PNG, mmdc primary, Kroki fallback
- **Mermaid_Code**: Diagram definition syntax that will be rendered to PNG
- **Glossary_Entry**: A term-definition pair extracted from document context
- **Section_Summary**: A concise overview of a document section
- **Executive_Summary**: 2-4 sentence overview of entire document
- **HTML_Generator**: Service that produces styled HTML from validated enriched content
- **PDF_Generator**: WeasyPrint-based service that renders final PDF
- **mmdc**: Mermaid CLI tool for local diagram rendering
- **Kroki_API**: External diagram rendering fallback when mmdc fails
- **Fuzzy_Match**: Similarity comparison (e.g. token-sort ratio) used instead of exact string equality, to tolerate paraphrasing/casing/punctuation drift

## Requirements

### Requirement 1: Content Hash Deduplication

**User Story:** As a developer, I want unchanged documents skipped, so nothing is reprocessed unnecessarily — including skipping the AI call entirely.

#### Acceptance Criteria

1. WHEN markdown content is provided, THE System SHALL compute Content_Hash (SHA-256) BEFORE invoking Extension_AI
2. WHEN Content_Hash matches the stored hash for this artifact, THE System SHALL skip all processing (including the AI call) and return the existing doc_version
3. THE System SHALL store Content_Hash with each artifact for future comparison
4. WHEN content changes by any amount, THE System SHALL reprocess fully

### Requirement 2: Single AI Transformation Call

**User Story:** As a developer, I want one fast enrichment call, not several sequential AI calls for different enhancements.

#### Acceptance Criteria

1. THE Extension_AI SHALL receive the full markdown content in a single request
2. THE Extension_AI SHALL return one Enriched_JSON object containing title, abstract, sections, diagrams, glossary, and summaries — all enrichments in one response
3. THE System SHALL NOT make sequential/chained AI calls for different enrichment types
4. THE System SHALL NEVER configure a separate AI provider, model endpoint, or API key anywhere in this pipeline. Extension_AI is always whatever is already active
5. Before returning, THE Extension_AI SHALL self-check: verify every source heading appears in sections, and that every evidence field it is about to submit is an actual excerpt from the source content, not a paraphrase or summary of it — and correct any mismatches found before responding. (This is instructional, not enforced — Requirement 7-9 below are the actual enforcement.)
6. IF Extension_AI fails or is unavailable, THEN THE System SHALL fallback to unenriched processing (structure-only, no diagrams/glossary/summaries) rather than failing the whole document

### Requirement 3: Enriched JSON Schema

**User Story:** As a backend developer, I want a well-defined schema so validation is reliable and mechanical.

#### Acceptance Criteria

1. Enriched_JSON SHALL include: title, abstract, sections[], diagrams[], glossary[], summaries
2. Each section SHALL include heading, level, content, and type (one of: normal, callout, open_question, task, user_story, design_decision)
3. Each diagram SHALL include type, mermaidCode, sectionRef, location, and components[] — where each component has name AND evidence (a short excerpt from the source text supporting that component's inclusion)
4. Each glossary entry SHALL include term, definition, AND evidence (a short excerpt from the source text where the term appears or is implied)
5. summaries SHALL include executiveSummary (string) and optional perSection (object keyed by section heading)
6. THE Backend_Validator SHALL reject Enriched_JSON missing any required field, with a specific error naming the missing field(s) — not a generic failure

### Requirement 4: Diagram Detection and Generation

**User Story:** As a developer, I want diagrams generated automatically where content warrants one, not forced onto content that doesn't need one.

#### Acceptance Criteria

1. THE Extension_AI SHALL generate a diagram only where content has a genuinely diagrammable shape (architecture/components, sequential process, state transitions, or entity relationships) — not for every section
2. THE Extension_AI SHALL choose Mermaid syntax matching the content: graph for architecture, sequenceDiagram for process flow, stateDiagram-v2 for state machines, erDiagram for data models
3. THE Extension_AI SHALL generate between 0 and 10 diagrams per document
4. For every diagram, THE Extension_AI SHALL populate components[] with evidence for each component per Requirement 3.3 — a diagram with no evidence per component is a schema violation, not merely a quality issue

### Requirement 5: Glossary Extraction and Definition

**User Story:** As a reader, I want technical terms defined, grounded in what the document actually says.

#### Acceptance Criteria

1. THE Extension_AI SHALL extract technical terms based on capitalization, acronyms, backtick-quoted identifiers, and domain context
2. THE Extension_AI SHALL generate a 1-2 sentence definition per term
3. THE Extension_AI SHALL limit output to 30 terms, ranked by relevance if more candidates exist
4. For every term, THE Extension_AI SHALL populate evidence per Requirement 3.4
5. This requirement describes instructions to Extension_AI; it is not independently enforceable. Requirement 9 is the actual enforced check

### Requirement 6: Summary Generation

**User Story:** As a reader, I want summaries that reflect real content, not implementation detail.

#### Acceptance Criteria

1. THE Extension_AI SHALL generate an Executive_Summary of 2-4 sentences
2. THE Extension_AI SHALL generate a Section_Summary (1-2 sentences) for any section exceeding 200 words
3. Executive_Summary SHALL exclude implementation detail, focusing on purpose and scope

### Requirement 7: Backend Validation — Heading Coverage

**User Story:** As a developer, I want document structure preserved exactly, with tolerance for trivial rewording.

#### Acceptance Criteria

1. THE Backend_Validator SHALL extract all heading text from the original markdown
2. FOR EACH original heading, THE Backend_Validator SHALL check for a Fuzzy_Match (similarity >= 85) against some section's heading in Enriched_JSON
3. IF any heading has no match >= threshold, THEN THE Backend_Validator SHALL reject with the specific missing heading(s) named in the error
4. THE Backend_Validator SHALL NOT require exact string equality — this is a deterministic check with fuzzy tolerance, not an AI judgment call

### Requirement 8: Backend Validation — Diagram Grounding (Evidence-Based)

**User Story:** As a developer, I want diagrams checked for hallucination without requiring the validator to understand diagram semantics.

#### Acceptance Criteria

1. FOR EACH diagram component, THE Backend_Validator SHALL Fuzzy_Match that component's evidence field against the full source document content (threshold >= 85)
2. THE Backend_Validator SHALL evaluate evidence text, NOT component names — a component may be labeled "Auth Service" while its evidence says "the system checks credentials," and this SHALL pass, since the evidence itself is what's checked against source, not the label
3. IF any component's evidence fails to match, THEN THE Backend_Validator SHALL reject that specific diagram, naming the ungrounded component(s) in the error — not silently drop it, and not reject the whole document over one bad diagram
4. THE Backend_Validator SHALL additionally test-render each diagram's mermaidCode for syntax validity (parse-check, not visual rendering) and reject with the parser error if invalid
5. THE Backend_Validator SHALL NEVER ask an AI model to judge whether a diagram is "accurate" or "well-grounded" — grounding is decided by evidence-matching code only

### Requirement 9: Backend Validation — Glossary Term Grounding (Evidence-Based)

**User Story:** As a reader, I want glossary entries grounded in the actual document.

#### Acceptance Criteria

1. FOR EACH glossary entry, THE Backend_Validator SHALL Fuzzy_Match that entry's evidence field against the source document content (threshold >= 85)
2. IF evidence fails to match, THEN THE Backend_Validator SHALL reject that specific entry, naming it in the error — not the whole glossary
3. THE Backend_Validator SHALL perform matching case-insensitively

### Requirement 10: Retry Loop

**User Story:** As a developer, I want validation failures corrected automatically by the same agent, not silently dropped or hard-failed.

#### Acceptance Criteria

1. WHEN Backend_Validator rejects part or all of Enriched_JSON, THE System SHALL return a structured error listing exactly what failed (missing headings, ungrounded diagram components with their claimed evidence, ungrounded glossary terms, invalid Mermaid syntax with parser message)
2. THE calling Extension_AI session SHALL receive this structured error and correct only the flagged items, then resubmit
3. THE System SHALL allow a maximum of 2 retry attempts
4. IF validation still fails after 2 retries, THEN THE System SHALL proceed with only the validated portions (e.g. render without the still-ungrounded diagram) rather than failing the entire document, and SHALL flag the dropped items in the artifact's status for visibility on the dashboard

### Requirement 11: Local Diagram Rendering

**User Story:** As a developer, I want diagrams rendered locally by default, not sent to third-party services with potentially sensitive project content.

#### Acceptance Criteria

1. THE Diagram_Renderer SHALL use local mmdc (Mermaid CLI) as the primary rendering method
2. THE Diagram_Renderer SHALL set PNG output to 1200x800px, transparent background
3. IF mmdc is unavailable or fails, THEN THE Diagram_Renderer SHALL fallback to Kroki_API — and SHALL surface a one-time warning in setup/status output that this sends content to a third-party service, since project specs may contain sensitive information
4. THE Diagram_Renderer SHALL cache rendered PNGs keyed by Content_Hash of the mermaidCode string, so identical diagrams across documents render once
5. IF both mmdc and Kroki fail, THEN THE Diagram_Renderer SHALL log the error and the PDF SHALL render with a placeholder in that diagram's location, not fail entirely

### Requirement 12: HTML/PDF Rendering

**User Story:** As a reader, I want a polished, navigable PDF.

#### Acceptance Criteria

1. THE System SHALL render validated Enriched_JSON to HTML, then HTML to PDF via WeasyPrint — fully deterministic, no AI involvement at this stage
2. THE System SHALL include: cover page (title, abstract, artifact type, timestamp, source path, commit hash), table of contents (heading levels 1-3, hyperlinked), sections grouped/styled by type (task checklist blocks, user-story cards, design-decision callouts), diagrams embedded inline near their sectionRef with captions, and a glossary appendix (alphabetized, cross-linked from first occurrence)
3. Task-type artifacts SHALL show a completed/pending count summary at the top
4. THE System SHALL apply 1-inch margins and page numbers in footers
5. IF WeasyPrint fails, THEN THE System SHALL log the error and return the HTML as a fallback rather than producing nothing

### Requirement 13: Performance Target

**User Story:** As a developer, I want fast iteration during active writing.

#### Acceptance Criteria

1. THE System SHALL complete end-to-end processing (excluding retries) in under 20 seconds for documents under 5000 words
2. Cached diagram reuse SHALL complete in under 500ms per diagram
3. These are targets to guide implementation, not hard gates that fail a build
