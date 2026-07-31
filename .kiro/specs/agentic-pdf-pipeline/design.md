# Design Document: Agentic PDF Pipeline

## Overview

The Agentic PDF Pipeline is a zero-configuration, evidence-based validation system that transforms markdown documents into professional PDFs. One AI call (whatever model is already active in the IDE) performs all enrichment while citing evidence for every diagram component and glossary term. A deterministic backend validates that evidence against source text using fuzzy matching — never judging the AI's semantic conclusions, only checking that claimed evidence actually appears in the document. Failures return structured errors; the same agent corrects and resubmits (max 2 retries).

### Key Design Goals

1. **Single AI Call**: One transformation that produces all enrichments with evidence citations
2. **Zero Configuration**: Use whatever AI provider is already active (Copilot/Claude/Kiro) — never configure separately
3. **Evidence-Based Validation**: Check that AI's claimed evidence excerpts exist in source, not semantic accuracy
4. **Fuzzy Matching**: Tolerate trivial rewording/punctuation/casing (≥85% similarity threshold)
5. **Automatic Retry Loop**: Structured errors → AI corrects flagged items → resubmits (max 2 attempts)
6. **Content Hash Deduplication**: Skip processing (including AI call) for unchanged documents
7. **Local-First Rendering**: Use mmdc CLI for diagrams, Kroki fallback with privacy warning
8. **Performance Target**: Complete end-to-end in under 20 seconds (excluding retries) for documents under 5000 words

### Design Principles

- **Evidence Over Semantics**: Validate what AI claims exists, not whether its conclusions are "correct"
- **Fuzzy Not Brittle**: Use similarity thresholds, not exact string matching
- **Self-Correcting**: Let AI fix its own validation failures via structured error feedback
- **Fail Gracefully**: After retry exhaustion, proceed with validated portions rather than hard-fail
- **Privacy-Conscious**: Local rendering primary; warn if falling back to external services

## Architecture

### System Context

```
┌─────────────────┐
│   VSCode IDE    │
│                 │
│  ┌───────────┐  │
│  │ Extension │  │──── Single AI Call ───┐
│  │   (Stage  │  │                       │
│  │     1)    │  │                       ▼
│  └───────────┘  │              ┌─────────────────┐
└─────────────────┘              │  Extension AI   │
                                 │  (Copilot/      │
                                 │   Claude/etc)   │
                                 └─────────────────┘
                                         │
                                         │ Enriched JSON
                                         ▼
┌──────────────────────────────────────────────────┐
│              Backend Server                      │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │          Stage 2: Validation             │   │
│  │  ┌────────────┐  ┌────────────────┐     │   │
│  │  │  Heading   │  │  Diagram       │     │   │
│  │  │  Validator │  │  Grounding     │     │   │
│  │  └────────────┘  └────────────────┘     │   │
│  │  ┌────────────┐                         │   │
│  │  │  Glossary  │                         │   │
│  │  │  Validator │                         │   │
│  │  └────────────┘                         │   │
│  └──────────────────────────────────────────┘   │
│                     │                            │
│                     ▼                            │
│  ┌──────────────────────────────────────────┐   │
│  │    Stage 3: Rendering & Generation       │   │
│  │  ┌────────────┐  ┌────────────────┐     │   │
│  │  │  Diagram   │  │  HTML          │     │   │
│  │  │  Renderer  │  │  Generator     │     │   │
│  │  │  (mmdc)    │  │  with CSS      │     │   │
│  │  └────────────┘  └────────────────┘     │   │
│  │  ┌────────────┐                         │   │
│  │  │  PDF       │                         │   │
│  │  │  Generator │                         │   │
│  │  │(WeasyPrint)│                         │   │
│  │  └────────────┘                         │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
                     │
                     ▼
               ┌──────────┐
               │  PDF     │
               │  Output  │
               └──────────┘
```

### Pipeline Stages

**Stage 1: AI Transformation (VSCode Extension)**
- Compute content hash from markdown
- Check cache for existing artifact
- Send single AI prompt requesting all enrichments
- Parse AI response into Enriched JSON
- Send to backend

**Stage 2: Backend Validation (Backend Server)**
- Validate Enriched JSON schema compliance (including evidence fields)
- Use fuzzy matching (≥85% similarity) to check heading preservation
- Validate diagram component evidence against source (fuzzy match)
- Validate glossary term evidence against source (fuzzy match)
- Return structured errors for validation failures
- Support retry loop (up to 2 attempts)

**Stage 3: Rendering & Generation (Backend Server)**
- Render diagrams using mmdc CLI (fallback to Kroki with warning)
- Generate HTML with embedded diagrams and CSS
- Convert HTML to PDF using WeasyPrint
- Store with content hash for deduplication


## Components and Interfaces

### Extension Components

#### ContentHashService

Computes SHA-256 hashes for markdown content to enable deduplication.

**Interface:**
```typescript
interface ContentHashService {
  computeHash(content: string): string;
  compareHashes(hash1: string, hash2: string): boolean;
}
```

**Responsibilities:**
- Compute SHA-256 digest from markdown string
- Provide consistent hashing across pipeline runs
- Enable cache lookups

**Dependencies:** None (uses Node.js crypto module)

#### EnrichmentPromptBuilder

Constructs the single AI prompt that requests all enrichments.

**Interface:**
```typescript
interface EnrichmentPromptBuilder {
  buildPrompt(markdown: string, documentType: string): string;
}
```

**Responsibilities:**
- Generate comprehensive prompt requesting diagrams, glossary, and summaries
- Include JSON schema in prompt for structured output
- Specify grounding requirements and constraints

**Dependencies:** None


#### SingleCallAITransformer

Executes the single AI call and parses the response.

**Interface:**
```typescript
interface SingleCallAITransformer {
  transform(markdown: string, prompt: string): Promise<EnrichedJSON>;
  fallbackTransform(markdown: string): EnrichedJSON;
}
```

**Responsibilities:**
- Call VSCode AI provider with enrichment prompt
- Parse AI response into EnrichedJSON structure
- Handle AI failures with rule-based fallback
- Timeout after 15 seconds

**Dependencies:** AIProviderFactory, EnrichmentPromptBuilder, JSONParser

#### PipelineOrchestrator

Orchestrates the three pipeline stages.

**Interface:**
```typescript
interface PipelineOrchestrator {
  process(markdownUri: Uri): Promise<PipelineResult>;
  checkCache(contentHash: string): Promise<boolean>;
}
```

**Responsibilities:**
- Coordinate Stage 1 (AI transformation)
- Send enriched JSON to backend (Stages 2 & 3)
- Handle errors and provide user feedback
- Track processing status

**Dependencies:** ContentHashService, SingleCallAITransformer, BackendClient, NotificationService


### Backend Components

#### FuzzyMatchService

Provides fuzzy string matching for validation (tolerates rewording/punctuation/casing).

**Interface:**
```python
class FuzzyMatchService:
    def fuzzy_match(self, text1: str, text2: str, threshold: float = 0.85) -> bool:
        """Check if two texts are similar above threshold (0.0-1.0)"""
        pass
    
    def similarity_score(self, text1: str, text2: str) -> float:
        """Return similarity score using token-sort ratio"""
        pass
    
    def find_best_match(self, target: str, candidates: List[str], threshold: float = 0.85) -> Optional[str]:
        """Find best matching candidate above threshold"""
        pass
```

**Responsibilities:**
- Use token-sort ratio algorithm (from fuzzywuzzy/rapidfuzz)
- Normalize whitespace and handle case-insensitivity
- Return scores from 0.0 (no match) to 1.0 (identical)
- Default threshold: 0.85 (85% similarity)

**Dependencies:** rapidfuzz library

#### EnrichedJSONValidator

Validates that AI output conforms to the expected schema, including evidence fields.

**Interface:**
```python
class EnrichedJSONValidator:
    def validate_schema(self, enriched_json: dict) -> ValidationResult:
        """Validate required fields, types, and evidence fields"""
        pass
    
    def validate_evidence_fields(self, enriched_json: dict) -> ValidationResult:
        """Ensure all diagrams have components[] with evidence, all glossary entries have evidence"""
        pass
    
    def get_validation_errors(self) -> List[str]:
        """Return specific field-level errors"""
        pass
```

**Responsibilities:**
- Check presence of required fields (title, abstract, sections, diagrams, glossary, summaries)
- Validate that each diagram has components[] array
- Validate that each component has name AND evidence fields
- Validate that each glossary entry has term, definition, AND evidence fields
- Return specific error messages naming missing fields
- Reject with schema violation if evidence fields are missing

**Dependencies:** jsonschema library

#### HeadingPreservationValidator

Ensures all original markdown headings appear in enriched sections using fuzzy matching.

**Interface:**
```python
class HeadingPreservationValidator:
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        self.fuzzy_matcher = fuzzy_matcher
    
    def extract_markdown_headings(self, markdown: str) -> List[str]:
        """Extract all headings from original markdown"""
        pass
    
    def extract_json_headings(self, enriched_json: dict) -> List[str]:
        """Extract all section headings from enriched JSON"""
        pass
    
    def validate_preservation(self, original: List[str], enriched: List[str]) -> ValidationResult:
        """Check all original headings match enriched (fuzzy ≥85%)"""
        pass
```

**Responsibilities:**
- Parse markdown for heading text (# to ######)
- Extract section headings from enriched JSON
- Use fuzzy matching (≥85% similarity) for each original heading
- Identify headings with no match above threshold
- Return structured error with specific missing headings
- NOT case-sensitive exact matching — uses FuzzyMatchService

**Dependencies:** FuzzyMatchService


#### DiagramGroundingValidator

Validates diagram component evidence against source using fuzzy matching. **DOES NOT parse component names from Mermaid code** — validates the evidence field the AI provided.

**Interface:**
```python
class DiagramGroundingValidator:
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        self.fuzzy_matcher = fuzzy_matcher
    
    def validate_diagram_evidence(self, diagram: dict, source_markdown: str) -> ValidationResult:
        """Check each component's evidence field against source (fuzzy ≥85%)"""
        pass
    
    def validate_all_diagrams(self, diagrams: List[dict], markdown: str) -> ValidationResult:
        """Validate evidence for all diagram components"""
        pass
    
    def validate_mermaid_syntax(self, mermaid_code: str) -> ValidationResult:
        """Parse-check Mermaid syntax for validity"""
        pass
```

**Responsibilities:**
- For each diagram, iterate components[] array
- For each component, fuzzy match component.evidence against full source markdown (≥85%)
- Evaluate evidence text ONLY — not component names
- Reject specific diagram if any component's evidence fails to match
- Return structured error naming ungrounded components with their claimed evidence
- Additionally test-render mermaidCode for syntax validity (parse check)
- NEVER extract component names from Mermaid syntax — that's the old approach

**Dependencies:** FuzzyMatchService, mermaid syntax validator

#### GlossaryTermValidator

Validates glossary entry evidence against source using fuzzy matching.

**Interface:**
```python
class GlossaryTermValidator:
    def __init__(self, fuzzy_matcher: FuzzyMatchService):
        self.fuzzy_matcher = fuzzy_matcher
    
    def validate_entry_evidence(self, entry: dict, markdown: str) -> ValidationResult:
        """Check if entry's evidence field matches source (fuzzy ≥85%, case-insensitive)"""
        pass
    
    def validate_all_entries(self, glossary: List[dict], markdown: str) -> ValidationResult:
        """Validate evidence for all glossary entries"""
        pass
```

**Responsibilities:**
- For each glossary entry, fuzzy match entry.evidence against source markdown (≥85%)
- Perform case-insensitive matching
- Reject specific entry if evidence fails to match
- Return structured error naming rejected entries
- NOT checking term existence — checking evidence field validity

**Dependencies:** FuzzyMatchService

#### RetryLoopOrchestrator

Manages the validation retry loop: structured errors → AI corrects → resubmits (max 2 attempts).

**Interface:**
```python
class RetryLoopOrchestrator:
    def __init__(self, validators: List[Validator], max_retries: int = 2):
        self.validators = validators
        self.max_retries = max_retries
    
    def validate_with_retry(self, enriched_json: dict, source_markdown: str, 
                           ai_session_callback: Callable) -> ValidationResult:
        """Validate, return errors to AI for correction, retry up to max_retries"""
        pass
    
    def build_structured_error(self, validation_results: List[ValidationResult]) -> dict:
        """Create structured error with specific failures (missing headings, ungrounded components, etc.)"""
        pass
    
    def proceed_with_validated(self, enriched_json: dict, validation_results: List[ValidationResult]) -> dict:
        """After exhausting retries, return only validated portions"""
        pass
```

**Responsibilities:**
- Run all validators (schema, heading, diagram, glossary)
- If validation fails, build structured error listing:
  - Missing headings with fuzzy match scores
  - Ungrounded diagram components with their claimed evidence
  - Ungrounded glossary terms with their claimed evidence
  - Invalid Mermaid syntax with parser messages
- Send structured error to Extension_AI session via callback
- Receive corrected Enriched_JSON and retry validation
- Allow maximum 2 retry attempts
- After retry exhaustion, proceed with validated portions only
- Flag dropped items in artifact status for dashboard visibility

**Dependencies:** All validators, AI session callback interface

#### DiagramRenderingService

Renders Mermaid diagrams to PNG using local mmdc CLI.

**Interface:**
```python
class DiagramRenderingService:
    def render_diagram(self, mermaid_code: str, diagram_id: str) -> RenderResult:
        """Render diagram using mmdc, fallback to Kroki if needed"""
        pass
    
    def render_with_mmdc(self, mermaid_code: str, output_path: str) -> bool:
        """Execute mmdc CLI to render diagram"""
        pass
    
    def render_with_kroki(self, mermaid_code: str, output_path: str) -> bool:
        """Fallback: call Kroki API for rendering"""
        pass
    
    def check_cache(self, diagram_hash: str) -> Optional[str]:
        """Check if diagram already rendered"""
        pass
```

**Responsibilities:**
- Execute mmdc CLI with mermaid code input
- Set PNG dimensions (1200x800) and transparent background
- Cache rendered diagrams using content hash
- Fallback to Kroki API if mmdc unavailable
- Handle rendering failures gracefully

**Dependencies:** subprocess (for mmdc), requests (for Kroki), hashlib


#### HTMLGeneratorService

Generates styled HTML with embedded diagrams and enhancements.

**Interface:**
```python
class HTMLGeneratorService:
    def generate_html(self, enriched_json: dict, rendered_diagrams: dict) -> str:
        """Generate complete HTML document"""
        pass
    
    def generate_cover_page(self, title: str, summary: str, metadata: dict) -> str:
        """Generate cover page HTML"""
        pass
    
    def generate_table_of_contents(self, sections: List[dict]) -> str:
        """Generate TOC with links"""
        pass
    
    def embed_diagrams(self, html: str, diagrams: dict) -> str:
        """Embed diagram images at specified locations"""
        pass
    
    def linkify_glossary_terms(self, html: str, glossary: List[dict]) -> str:
        """Create hyperlinks for first occurrence of glossary terms"""
        pass
```

**Responsibilities:**
- Generate cover page with title, summary, metadata
- Create table of contents with heading levels 1-3
- Embed section summaries at section start
- Insert diagram images at specified locations
- Create glossary term hyperlinks (first occurrence per section)
- Apply professional CSS styling
- Add page breaks for major sections

**Dependencies:** None (uses Jinja2 templates or string formatting)


#### PDFGeneratorService

Converts HTML to PDF using WeasyPrint.

**Interface:**
```python
class PDFGeneratorService:
    def generate_pdf(self, html: str, output_path: str) -> bool:
        """Convert HTML to PDF using WeasyPrint"""
        pass
    
    def configure_page_layout(self) -> dict:
        """Return page layout configuration (margins, size)"""
        pass
```

**Responsibilities:**
- Convert HTML to PDF using WeasyPrint
- Apply 1-inch margins on all sides
- Generate page numbers in footers
- Preserve hyperlinks and formatting
- Handle WeasyPrint failures with fallback to HTML output

**Dependencies:** weasyprint

#### ArtifactCacheService

Manages artifact storage and content hash lookups.

**Interface:**
```python
class ArtifactCacheService:
    def check_cache(self, content_hash: str) -> Optional[str]:
        """Check if artifact with hash exists"""
        pass
    
    def store_artifact(self, content_hash: str, pdf_path: str, metadata: dict) -> str:
        """Store artifact with hash"""
        pass
    
    def get_artifact_path(self, artifact_id: str) -> Optional[str]:
        """Retrieve artifact path by ID"""
        pass
```

**Responsibilities:**
- Store PDFs with content hash metadata
- Lookup existing artifacts by content hash
- Prevent duplicate processing
- Return artifact ID for cached documents

**Dependencies:** Database or filesystem with JSON metadata


## Data Models

### EnrichedJSON Schema

The single JSON output from the AI transformation call. **Critical: All diagram components and glossary entries MUST include evidence fields.**

```typescript
interface EnrichedJSON {
  title: string;                    // Document title
  abstract: string;                 // Brief document description
  sections: Section[];              // Document sections
  diagrams: Diagram[];              // AI-generated diagrams with evidence
  glossary: GlossaryEntry[];        // Term definitions with evidence
  summaries: Summaries;             // Executive and section summaries
}

interface Section {
  heading: string;                  // Section heading text
  content: string;                  // Section content (markdown)
  type: SectionType;                // Section classification
  level: number;                    // Heading level (1-6)
}

type SectionType = 
  | "normal" 
  | "callout"
  | "open_question"
  | "task" 
  | "user_story" 
  | "design_decision";

interface Diagram {
  type: DiagramType;                // Diagram type
  mermaidCode: string;              // Mermaid syntax
  sectionRef: string;               // Section reference
  location: DiagramLocation;        // Where to place diagram
  components: DiagramComponent[];   // REQUIRED: Components with evidence
  title?: string;                   // Optional diagram title
}

interface DiagramComponent {
  name: string;                     // Component label (e.g., "Auth Service")
  evidence: string;                 // REQUIRED: Verbatim excerpt from source
}

type DiagramType = 
  | "architecture" 
  | "sequence" 
  | "state" 
  | "data_model" 
  | "flowchart";

type DiagramLocation = 
  | `after-section-${number}`       // After section N
  | `inline-section-${number}-paragraph-${number}`; // Within section

interface GlossaryEntry {
  term: string;                     // Technical term
  definition: string;               // 1-2 sentence definition
  evidence: string;                 // REQUIRED: Verbatim excerpt from source
}

interface Summaries {
  executiveSummary: string;         // 2-4 sentence overview
  perSection?: Record<string, string>; // Optional per-section summaries
}
```


### ValidationResult

Result of backend validation checks.

```python
@dataclass
class ValidationResult:
    valid: bool
    errors: List[str]
    warnings: List[str]
    filtered_data: Optional[dict]  # Data after filtering invalid entries
```

### RenderResult

Result of diagram rendering.

```python
@dataclass
class RenderResult:
    success: bool
    image_path: Optional[str]
    error_message: Optional[str]
    rendering_method: str  # "mmdc", "kroki", or "failed"
    cache_hit: bool
```

### PipelineResult

Result of complete pipeline execution.

```typescript
interface PipelineResult {
  success: boolean;
  skipped: boolean;              // True if content hash matched cache
  artifactId?: string;           // Artifact ID if successful
  pdfPath?: string;              // Path to generated PDF
  stage?: number;                // Stage where failure occurred (1-3)
  error?: string;                // Error message if failed
  processingTimeMs: number;      // Total processing time
  stageTimings: {                // Time spent in each stage
    stage1_ai_ms?: number;
    stage2_validation_ms?: number;
    stage3_rendering_ms?: number;
  };
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:

1. **Properties 3.1 and 3.6** (schema validation) can be combined into a single comprehensive property about required field validation
2. **Properties 5.4 and 5.5** (glossary term existence) are the same requirement stated differently
3. **Properties 7.3 and 7.4** (heading preservation and rejection) can be combined
4. **Properties 8.2 and 8.3** (grounding check and filtering) can be combined
5. **Properties 9.1 and 9.2** (term verification and removal) can be combined
6. **Properties 11.1 and 12.2** (executive summary on cover page) are duplicates
7. **Properties 1.2 and 1.3** (cache storage and lookup) are complementary and should be tested together

After eliminating redundancy, here are the essential properties for property-based testing:


### Property 1: Content Hash Stability

*For any* markdown string, computing the SHA-256 hash twice SHALL produce identical results.

**Validates: Requirements 1.1**

### Property 2: Content Hash Uniqueness

*For any* two different markdown strings, the SHA-256 hashes SHALL be different (except for cryptographic collision, probability < 2^-128).

**Validates: Requirements 1.1, 1.5**

### Property 3: Cache Round-Trip Preservation

*For any* artifact stored with a content hash, retrieving by that hash SHALL return the same artifact ID and metadata.

**Validates: Requirements 1.2, 1.3**

### Property 4: Single Character Change Triggers Reprocessing

*For any* markdown string, modifying exactly one character SHALL produce a different content hash and trigger reprocessing (not cache hit).

**Validates: Requirements 1.5**


### Property 5: AI Failure Triggers Fallback

*For any* markdown input, when the AI provider fails or times out, the system SHALL invoke rule-based fallback processing.

**Validates: Requirements 2.5**

### Property 6: Enriched JSON Schema Validation

*For any* JSON object, validation SHALL succeed if and only if it contains all required fields (title, abstract, sections, diagrams, glossary, summaries) with correct types, and SHALL fail otherwise.

**Validates: Requirements 3.1, 3.6**

### Property 7: Section Structure Validation

*For any* section array in enriched JSON, every section element SHALL contain heading (string), content (string), type (enum), and level (number) fields.

**Validates: Requirements 3.2**

### Property 8: Diagram Structure Validation

*For any* diagram array in enriched JSON, every diagram element SHALL contain type (enum), mermaidCode (string), and location (string) fields.

**Validates: Requirements 3.3**

### Property 9: Glossary Structure Validation

*For any* glossary array in enriched JSON, every entry SHALL contain term (string) and definition (string) fields.

**Validates: Requirements 3.4**

### Property 10: Summary Structure Validation

*For any* summaries object in enriched JSON, it SHALL contain an executiveSummary (string) field.

**Validates: Requirements 3.5, 6.5**


### Property 11: Markdown Heading Extraction Completeness

*For any* markdown string containing heading syntax (# through ######), the heading extraction function SHALL return all heading texts in document order.

**Validates: Requirements 7.1**

### Property 12: JSON Heading Extraction Completeness

*For any* enriched JSON sections array, the heading extraction function SHALL return all section heading values in array order.

**Validates: Requirements 7.2**

### Property 13: Heading Preservation Validation

*For any* pair of heading lists (original and enriched), validation SHALL succeed if and only if every original heading appears in the enriched list (case-sensitive).

**Validates: Requirements 7.3, 7.4**

### Property 14: Mermaid Component Extraction

*For any* Mermaid diagram code, the component extraction function SHALL return all node names, state names, and entity names appearing in the syntax.

**Validates: Requirements 8.1**

### Property 15: Diagram Grounding Validation

*For any* diagram with extracted components and source markdown, the grounding percentage SHALL be between 0.0 and 1.0, and diagrams with percentage < 0.5 SHALL be filtered out.

**Validates: Requirements 8.2, 8.3**

### Property 16: Diagram Filtering Preserves Valid Diagrams

*For any* array of diagrams with mixed grounding scores, filtering SHALL remove only diagrams below 50% grounding while preserving all diagrams at or above 50%.

**Validates: Requirements 8.5**


### Property 17: Glossary Term Existence Validation

*For any* glossary entry and markdown content, the term existence check SHALL return true if and only if the term appears in the markdown (case-insensitive matching).

**Validates: Requirements 9.1, 9.3**

### Property 18: Glossary Filtering Removes Non-Existent Terms

*For any* glossary array and markdown content, filtering SHALL remove exactly those entries whose terms do not appear in the markdown, preserving all entries whose terms do appear.

**Validates: Requirements 9.2, 9.5, 5.4, 5.5**

### Property 19: Diagram Cache Key Determinism

*For any* Mermaid code string, the cache key (content hash) SHALL be identical across multiple computations and SHALL differ for different Mermaid code strings.

**Validates: Requirements 10.5**

### Property 20: Diagram Cache Reuse

*For any* Mermaid code rendered successfully, rendering the same code again SHALL return the cached image path without re-rendering (cache hit).

**Validates: Requirements 10.6**

### Property 21: mmdc Fallback to Kroki

*For any* Mermaid code, when mmdc rendering fails (process error, timeout, or unavailable), the system SHALL attempt Kroki API rendering as fallback.

**Validates: Requirements 10.4**


### Property 22: Executive Summary Appears on Cover Page

*For any* enriched JSON with an executiveSummary field, the generated HTML SHALL contain that summary text within the cover page section.

**Validates: Requirements 11.1, 12.2**

### Property 23: Section Summary Conditional Embedding

*For any* section with content exceeding 200 words and a corresponding summary in enriched JSON, the generated HTML SHALL embed that summary at the beginning of the section.

**Validates: Requirements 11.2**

### Property 24: Diagram Placement at Specified Locations

*For any* diagram with a location specification (after-section-N or inline-section-N-paragraph-M) and rendered image path, the generated HTML SHALL contain the image at the specified location.

**Validates: Requirements 11.3**

### Property 25: Glossary Term First Occurrence Linking

*For any* glossary term appearing in section content, the first occurrence of that term in each section SHALL be wrapped in a hyperlink to the glossary definition.

**Validates: Requirements 11.4**

### Property 26: Table of Contents Heading Level Coverage

*For any* sections array with heading levels 1-6, the generated table of contents SHALL include all headings with levels 1-3 and SHALL exclude headings with levels 4-6.

**Validates: Requirements 11.5**

### Property 27: Cover Page Required Elements

*For any* document metadata (title, artifact type, timestamp), the generated cover page SHALL contain all provided metadata elements.

**Validates: Requirements 12.1, 12.3**


## Error Handling

### Stage 1: AI Transformation Errors

**AI Provider Timeout (> 15 seconds)**
- Action: Cancel AI request
- Fallback: Invoke rule-based transformation without enrichments
- User Notification: "AI transformation timed out, using basic processing"
- Logging: Warn level with timeout duration

**AI Provider Rate Limit**
- Action: Do not retry immediately
- Fallback: Queue for retry after 60 seconds OR use rule-based fallback
- User Notification: "AI rate limit reached, will retry shortly"
- Logging: Warn level with retry timestamp

**AI Response Invalid JSON**
- Action: Attempt to extract JSON from markdown code blocks
- Fallback: If extraction fails, use rule-based transformation
- User Notification: "AI response parsing failed, using basic processing"
- Logging: Error level with raw response (if debug enabled)

**Extension Offline/Unavailable**
- Action: Skip AI transformation
- Fallback: Use rule-based transformation immediately
- User Notification: None (silent fallback)
- Logging: Info level


### Stage 2: Validation Errors

**Schema Validation Failure (Missing Evidence Fields)**
- Action: Build structured error naming missing fields (components[], evidence)
- Fallback: Enter retry loop (max 2 attempts)
- User Notification: None during retry; "Validation failed after 2 retries" if exhausted
- Logging: Warn level with specific missing fields
- Recovery: After retry exhaustion, proceed with validated portions

**Heading Preservation Failure (Fuzzy Match < 85%)**
- Action: Build structured error with missing headings and their best match scores
- Fallback: Enter retry loop
- User Notification: None during retry; "Document structure incomplete" if exhausted
- Logging: Warn level with fuzzy match scores
- Recovery: After retry exhaustion, proceed with partial structure

**Diagram Component Evidence Failure (Fuzzy Match < 85%)**
- Action: Build structured error naming diagram index, component name, and claimed evidence
- Fallback: Enter retry loop
- User Notification: None during retry; "Some diagrams excluded" if exhausted
- Logging: Warn level with ungrounded evidence excerpts
- Recovery: Remove specific diagram, continue with remaining diagrams

**Glossary Entry Evidence Failure (Fuzzy Match < 85%)**
- Action: Build structured error naming term and claimed evidence
- Fallback: Enter retry loop
- User Notification: None during retry; "Some glossary terms excluded" if exhausted
- Logging: Warn level with ungrounded evidence
- Recovery: Remove specific entry, continue with remaining glossary

**Mermaid Syntax Invalid**
- Action: Build structured error with parser message
- Fallback: Enter retry loop
- User Notification: None during retry; "Diagram syntax errors" if exhausted
- Logging: Error level with mermaidCode excerpt
- Recovery: Remove invalid diagram


### Stage 3: Rendering Errors

**mmdc CLI Not Found**
- Action: Skip mmdc rendering attempt
- Fallback: Immediately use Kroki API
- User Notification: None (transparent fallback)
- Logging: Debug level

**mmdc Rendering Failure**
- Action: Retry with Kroki API
- Fallback: If Kroki also fails, continue without diagram
- User Notification: "Some diagrams could not be rendered"
- Logging: Warn level with Mermaid code excerpt

**Kroki API Unavailable**
- Action: Skip diagram rendering
- Fallback: Continue with text-only content
- User Notification: "Diagram rendering service unavailable"
- Logging: Warn level

**WeasyPrint Rendering Failure**
- Action: Do not retry
- Fallback: Return generated HTML file instead
- User Notification: "PDF generation failed, HTML output provided"
- Logging: Error level with WeasyPrint error message
- Recovery: User can manually convert HTML to PDF

**File System Write Failure**
- Action: Retry with temporary directory
- Fallback: Return in-memory content to extension
- User Notification: "Storage error, check permissions"
- Logging: Error level with path and error
- Recovery: Extension should prompt user for output location


### Error Recovery Strategies

**Retry Logic**
- AI transformation: No automatic retry (fallback instead)
- Backend validation: YES — structured error → AI corrects → resubmits (max 2 attempts via RetryLoopOrchestrator)
- Diagram rendering: One retry with alternative method (mmdc → Kroki)
- PDF generation: No retry (fallback to HTML)

**Graceful Degradation After Retry Exhaustion**
1. Full enrichment (all validation passed)
2. Partial enrichment (some diagrams/glossary entries excluded)
3. Structure-only (headings preserved, no AI enhancements)
4. Fallback HTML output (if PDF generation fails)

**Structured Error Format**
```json
{
  "validation_failures": {
    "schema": ["Missing 'evidence' field in glossary[3]"],
    "headings": [
      {"original": "User Authentication", "best_match": "Auth System", "score": 0.72}
    ],
    "diagrams": [
      {
        "diagram_index": 2,
        "component": "Auth Service",
        "claimed_evidence": "the system checks credentials",
        "fuzzy_score": 0.65
      }
    ],
    "glossary": [
      {
        "term": "JWT",
        "claimed_evidence": "authentication tokens",
        "fuzzy_score": 0.50
      }
    ],
    "mermaid_syntax": [
      {"diagram_index": 1, "error": "Unexpected token at line 5"}
    ]
  },
  "retry_count": 1,
  "max_retries": 2
}
```

**User Communication**
- During retries: No notification (internal correction loop)
- Success: Show completion notification with PDF link
- Partial Success (after retry exhaustion): Show warning with excluded items
- Failure: Show error with actionable guidance
- All notifications include option to view logs


## Testing Strategy

### Overview

This feature requires a dual testing approach combining property-based tests for correctness verification and unit/integration tests for specific scenarios. Property-based testing is highly applicable here because the core validation, parsing, and transformation logic consists of pure functions that should satisfy universal properties across all valid inputs.

### Property-Based Testing

**Library Selection:** `fast-check` for TypeScript (extension), `hypothesis` for Python (backend)

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: agentic-pdf-pipeline, Property N: [property text]`
- Custom generators for markdown, Mermaid code, enriched JSON structures

**Test Organization:**
- Extension tests: `src/tests/properties/`
- Backend tests: `tests/property_tests/`
- Shared generators: `tests/generators/`


### Property Test Coverage by Component

**ContentHashService (Properties 1-4)**
- Generator: Random strings (0-10000 chars)
- Generator: Markdown strings with headings, lists, code blocks
- Generator: Single-character mutations
- Verify: Hash stability, uniqueness, sensitivity

**EnrichedJSONValidator (Properties 6-10)**
- Generator: Valid enriched JSON structures
- Generator: Invalid JSON (missing fields, wrong types)
- Generator: Sections, diagrams, glossary with varying structures
- Verify: Schema validation accepts/rejects correctly

**HeadingPreservationValidator (Properties 11-13)**
- Generator: Markdown with random heading structures (# through ######)
- Generator: Enriched JSON with matching/missing headings
- Verify: Heading extraction completeness, preservation validation

**DiagramGroundingValidator (Properties 14-16)**
- Generator: Mermaid code (graph, sequence, state, ER diagrams)
- Generator: Markdown with varying component mention rates
- Verify: Component extraction, grounding calculation, filtering logic

**GlossaryTermValidator (Properties 17-18)**
- Generator: Glossary entries with random terms
- Generator: Markdown with varying term occurrences
- Verify: Case-insensitive term matching, filtering preserves valid entries


**DiagramRenderingService (Properties 19-21)**
- Generator: Valid Mermaid code strings
- Generator: Mock rendering failures (mmdc, Kroki)
- Verify: Cache key determinism, cache reuse, fallback behavior

**HTMLGeneratorService (Properties 22-27)**
- Generator: Enriched JSON with various content structures
- Generator: Sections of varying lengths (for summary embedding)
- Generator: Diagrams with different location specifications
- Generator: Glossary terms appearing in content
- Verify: Cover page content, summary embedding, diagram placement, term linking, TOC generation

### Unit Testing

**Specific Scenarios (Example-based tests):**

1. **AI Integration:**
   - Single AI call per transformation (mock provider, verify call count = 1)
   - AI timeout triggers fallback (mock 15s+ delay, verify fallback)
   - Invalid AI JSON extraction from code blocks

2. **Validation Logging:**
   - Schema validation errors logged with field names
   - Heading preservation failures logged with missing headings
   - Diagram/glossary filtering logged with reasons

3. **Rendering Configuration:**
   - mmdc called before Kroki (verify call order)
   - PNG dimensions set to 1200x800 (verify output)
   - Page breaks added for major sections (verify CSS)
   - PDF margins set to 1 inch (verify layout)


4. **Error Handling:**
   - WeasyPrint failure returns HTML fallback
   - Double rendering failure (mmdc + Kroki) continues without diagram
   - File system errors prompt user for output location

5. **Cache Behavior:**
   - Cache hit skips all processing stages (mock cache, verify skip)
   - Cache miss processes document (mock cache, verify processing)
   - Cache stores artifact with metadata (verify storage)

### Integration Testing

**External Service Integration:**

1. **AI Provider Integration:**
   - Test with actual Copilot/Claude (if available in CI)
   - Measure AI call completion time (target: < 15 seconds)
   - Verify AI response contains expected enrichments

2. **mmdc CLI Integration:**
   - Test with mmdc installed (real diagram rendering)
   - Verify PNG output dimensions and transparency
   - Measure rendering time (target: < 3 seconds per diagram)

3. **Kroki API Integration:**
   - Test fallback when mmdc unavailable
   - Handle Kroki rate limits and errors
   - Measure API latency


4. **WeasyPrint Integration:**
   - Test PDF generation with complex HTML
   - Verify hyperlink preservation
   - Verify image embedding
   - Measure PDF generation time (target: < 5 seconds)

**End-to-End Integration:**

1. **Performance Testing:**
   - Process 5000-word documents (target: < 20 seconds end-to-end)
   - Measure stage timing breakdown
   - Identify performance bottlenecks

2. **Cache Deduplication:**
   - Process same document twice, verify second is skipped
   - Modify document by one character, verify reprocessing
   - Verify cache storage and retrieval

3. **Graceful Degradation:**
   - Test with AI unavailable (verify fallback)
   - Test with mmdc unavailable (verify Kroki fallback)
   - Test with all diagram rendering failed (verify continuation)

### Test Data Generators

**Custom Generators for Property Tests:**

```typescript
// Extension generators
fc.markdown(): Arbitrary<string>        // Random valid markdown
fc.heading(): Arbitrary<string>         // Markdown heading lines
fc.mermaidCode(): Arbitrary<string>     // Valid Mermaid syntax
fc.enrichedJSON(): Arbitrary<EnrichedJSON>  // Valid enriched structure
```


```python
# Backend generators
@st.composite
def markdown_with_headings(draw):
    """Generate markdown with random heading structure"""
    pass

@st.composite
def mermaid_diagram(draw):
    """Generate valid Mermaid diagram code"""
    pass

@st.composite
def enriched_json_structure(draw):
    """Generate valid enriched JSON"""
    pass

@st.composite
def glossary_with_terms(draw, markdown: str):
    """Generate glossary with terms that may/may not exist in markdown"""
    pass
```

### Test Execution

**Continuous Integration:**
- Property tests run on every PR (100 iterations each)
- Unit tests run on every commit
- Integration tests run on merge to main
- Performance tests run nightly

**Test Coverage Targets:**
- Property test coverage: 80%+ of validation/parsing/transformation logic
- Unit test coverage: 90%+ overall code coverage
- Integration test coverage: All external service integrations

**Test Duration:**
- Property tests: < 2 minutes total
- Unit tests: < 30 seconds total
- Integration tests: < 5 minutes total
- Performance tests: < 10 minutes total


## Implementation Notes

### AI Prompt Engineering

The single AI enrichment prompt must be carefully crafted to maximize quality and adherence to the enriched JSON schema:

**Prompt Structure:**
1. Role definition (technical documentation analyst)
2. Task description (analyze and enrich markdown document)
3. Output format specification (JSON schema with examples)
4. Grounding requirement (diagrams and glossary must reference actual content)
5. Constraints (diagram limits, glossary size, summary length)
6. Examples of good vs. bad output

**Schema Inclusion:**
The complete TypeScript/JSON schema for EnrichedJSON must be included in the prompt to guide AI output structure.

**Token Budget Management:**
- Reserve ~2000 tokens for prompt and schema
- Limit input markdown to ~6000 tokens (approximately 4500 words)
- For longer documents, truncate or split (consider as future enhancement)


### Diagram Cache Implementation

**Cache Structure:**
```
cache/
  diagrams/
    <sha256-hash>.png        # Rendered diagram
    <sha256-hash>.meta.json  # Metadata (mermaid code, render method, timestamp)
```

**Cache Invalidation:**
- No automatic invalidation (diagrams are content-addressed)
- Manual cleanup via backend API endpoint
- Size-based eviction (LRU) when cache exceeds threshold (e.g., 1GB)

**Cache Sharing:**
- Diagrams cached by content hash are shared across all documents
- Same Mermaid code in different documents reuses cached render

### Artifact Storage

**Storage Structure:**
```
artifacts/
  <artifact-id>/
    document.pdf
    document.html      # Fallback if PDF generation failed
    metadata.json      # Content hash, timestamp, source path, etc.
```

**Metadata Schema:**
```json
{
  "artifactId": "uuid",
  "contentHash": "sha256-hex",
  "sourcePath": "/path/to/source.md",
  "commitHash": "git-sha (optional)",
  "createdAt": "ISO-8601 timestamp",
  "processingTimeMs": 15234,
  "stageTimings": {
    "stage1_ai_ms": 12000,
    "stage2_validation_ms": 1500,
    "stage3_rendering_ms": 1734
  },
  "enrichments": {
    "diagramCount": 3,
    "glossaryTermCount": 12,
    "hasSummaries": true
  }
}
```

