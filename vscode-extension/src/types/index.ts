/**
 * Core type definitions for Speckit Auto-AI Extension
 */

/**
 * Section type classification for document structure
 */
export type SectionType =
  | 'task'
  | 'user_story'
  | 'design_decision'
  | 'normal'
  | 'callout'
  | 'open_question';

/**
 * Document section with classified type
 */
export interface Section {
  /** Section heading/title */
  heading: string;
  /** Full markdown content of the section */
  content: string;
  /** Classification of section content */
  type: SectionType;
  /** Heading level (1-6) */
  level: number;
}

/**
 * A single component referenced by a diagram, with the verbatim source
 * excerpt ("evidence") that grounds its inclusion.
 */
export interface DiagramComponent {
  /** Component label (e.g. "Auth Service") */
  name: string;
  /** REQUIRED: verbatim/near-verbatim excerpt from the source document */
  evidence: string;
}

/** Diagram type, matching the backend's DiagramType enum */
export type DiagramType = 'architecture' | 'sequence' | 'state' | 'data_model' | 'flowchart';

/** AI-generated diagram with evidence-cited components */
export interface Diagram {
  type: DiagramType;
  /** Valid Mermaid syntax */
  mermaidCode: string;
  /** Section heading this diagram relates to */
  sectionRef: string;
  /** Placement, e.g. "after-section-1" or "inline-section-2-paragraph-1" */
  location: string;
  /** REQUIRED: components with evidence citations */
  components: DiagramComponent[];
  /** Optional diagram title */
  title?: string;
}

/** Glossary entry with definition and evidence */
export interface GlossaryEntry {
  /** Technical term from the document */
  term: string;
  /** 1-2 sentence definition */
  definition: string;
  /** REQUIRED: verbatim excerpt where the term appears or is implied */
  evidence: string;
}

/** Executive and optional per-section summaries */
export interface Summaries {
  /** 2-4 sentence document overview */
  executiveSummary: string;
  /** Optional 1-2 sentence summary per section heading (for sections > 200 words) */
  perSection?: Record<string, string>;
}

/**
 * A per-task, user-friendly description produced only for task-list
 * (tasks.md) documents - see EnrichmentPromptBuilder's task-descriptions
 * guidance. The backend's Kanban board sync uses this (keyed by taskKey) in
 * place of the raw checklist text when present.
 */
export interface TaskDescription {
  /** The task's ID exactly as it appears in the source (e.g. "T001") */
  taskKey: string;
  /** Short, user-friendly one-sentence description of what the task involves */
  description: string;
}

/**
 * Structured JSON representation of a markdown document, enriched with
 * evidence-grounded diagrams, glossary, and summaries (the single AI call's
 * output — see EnrichmentPromptBuilder).
 */
export interface StructuredJSON {
  /** Document title */
  title: string;
  /** 2-3 sentence summary of the document */
  abstract: string;
  /** Classified sections of the document (ALL original headings preserved) */
  sections: Section[];
  /** AI-generated diagrams with evidence (0-10) */
  diagrams: Diagram[];
  /** Term definitions with evidence (max 30) */
  glossary: GlossaryEntry[];
  /** Executive and per-section summaries */
  summaries: Summaries;
  /** Per-task friendly descriptions (task-list documents only) */
  taskDescriptions?: TaskDescription[];
  /** Optional document type classification */
  artifact_type?: string;
  /** Relative path from workspace root */
  source_path: string;
  /** Whether AI transformation was used */
  ai_enhanced: boolean;
  /** Name of AI provider used (if applicable) */
  agent_source?: string;
  /** Raw markdown content for validation */
  raw_content?: string;
}

/**
 * Result of transformation pipeline processing
 */
export interface ProcessResult {
  /** Whether processing succeeded */
  success: boolean;
  /** Backend artifact ID (on success) */
  artifactId?: number;
  /** Path to generated PDF (on success) */
  pdfLocation?: string;
  /** Error information (on failure) */
  error?: Error;
  /** AI provider used for transformation */
  provider?: string;
  /** Whether processing was skipped due to duplicate */
  skipped?: boolean;
  /** True if the backend dropped ungrounded diagrams/glossary entries after retries were exhausted */
  partial?: boolean;
  /** Diagram titles / glossary terms dropped for lacking grounded evidence */
  droppedItems?: Record<string, string[]>;
}

/**
 * Backend API ingestion response
 */
export interface IngestResponse {
  /** Response status */
  status: string;
  /** Database ID of created artifact */
  artifact_id: number;
  /** Relative path to generated PDF */
  pdf_location: string;
  /** Version number of the artifact */
  version: number;
  /** Whether ingestion was skipped as duplicate */
  skipped?: boolean;
  /** Optional document enhancements applied */
  enhancements?: {
    diagrams_added: number;
    sections_enhanced: number;
  };
}

/**
 * Backend API ingestion request payload
 */
export interface IngestRequest {
  /** Project identifier or name */
  project_id: string;
  /** Relative path from workspace root */
  source_path: string;
  /** Structured document data */
  structured_json: StructuredJSON;
  /** Optional Git commit hash */
  commit_hash?: string;
}

/**
 * Structured, per-category validation error returned by the backend's
 * RetryLoopOrchestrator when evidence-grounding validation fails and retries
 * remain. Built for the Extension_AI to correct only the flagged items.
 */
export interface StructuredError {
  valid: boolean;
  retry_count: number;
  errors: {
    schema_errors?: string[];
    missing_headings?: string[];
    ungrounded_diagrams?: string[];
    ungrounded_glossary?: string[];
    mermaid_syntax_errors?: string[];
    /** Client-only correction reason, never sent by the backend: sections
     * that DiagramCoverageChecker flagged as diagrammable-by-heading but
     * with no diagram covering them, used to trigger one targeted
     * follow-up AI pass before the first backend submission. */
    missing_diagrams?: string[];
  };
  warnings: string[];
}

/**
 * Request payload for the backend's /api/process endpoint (the agentic
 * pipeline). retry_count is tracked client-side and incremented on each
 * resubmission after a retry_needed response — see TransformPipeline.
 */
export interface ProcessRequest {
  project_id: string;
  source_path: string;
  source_markdown: string;
  enriched_json: StructuredJSON;
  artifact_type?: string;
  commit_hash?: string;
  retry_count: number;
  /** Workspace/project root folder name, detected client-side (the backend
   * has no filesystem visibility into the caller's workspace). */
  project_root?: string;
  /** Detected authoring framework(s) for the source .md, e.g. "speckit",
   * "kiro", "claude-code", "manual", or a comma-joined combination if more
   * than one marker is present. */
  authoring_framework?: string;
  /** Human-readable label for the AI model/provider that produced
   * enriched_json, e.g. "GitHub Copilot Chat — Claude Sonnet 5". */
  model_used?: string;
}

/**
 * Response from /api/process. `status` discriminates between a completed
 * render ("ok") and a request to correct and resubmit ("retry_needed").
 */
export interface ProcessResponse {
  status: 'ok' | 'retry_needed';
  skipped?: boolean;
  partial?: boolean;
  artifact_id?: string;
  pdf_location?: string;
  version?: { version_no: number; [key: string]: unknown };
  dropped_items?: Record<string, string[]>;
  validation_warnings?: string[];
  structured_error?: StructuredError;
  retry_count?: number;
  stageTimings?: Record<string, number>;
}

/**
 * JSON validation result
 */
export interface ValidationResult {
  /** Whether JSON is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Extension configuration settings
 */
export interface ExtensionConfig {
  /** Backend API URL */
  backendUrl: string;
  /** Enable automatic processing on file save */
  autoProcess: boolean;
  /** File patterns to include for processing */
  includePatterns: string[];
  /** File patterns to exclude from processing */
  excludePatterns: string[];
  /** API key for backend authentication */
  apiKey: string;
  /** Enable debug logging */
  enableDebugLogging: boolean;
  /** Debounce delay in milliseconds */
  debounceMs: number;
  /** Maximum concurrent file processing */
  maxConcurrentProcessing: number;
  /**
   * Allow degrading to the rule-based (non-AI) transform when no AI
   * provider is available or the AI request fails. Off by default: a
   * document should always go through real AI, and if it can't, that
   * should be a visible, actionable failure - not a silently
   * lower-quality PDF/board that looks like it "just worked".
   */
  allowRuleBasedFallback: boolean;
  /**
   * Auto-provision .github/copilot-instructions.md (and a .gitignore entry)
   * with live task-progress-tracking instructions in any workspace that
   * looks like a Speckit project, and watch for the resulting signal files
   * so the Kanban board can show "In Progress" while Copilot works through
   * a tasks.md, not just "Done" once a checkbox is saved. On by default;
   * off entirely skips writing to those project files.
   */
  enableCopilotProgressTracking: boolean;
}

/**
 * File watcher configuration
 */
export interface FileWatcherConfig {
  /** Glob patterns for files to include */
  includePatterns: string[];
  /** Glob patterns for files to exclude */
  excludePatterns: string[];
  /** Debounce delay in milliseconds */
  debounceMs: number;
}

/**
 * Extension state
 */
export interface ExtensionState {
  /** Whether extension is activated */
  isActivated: boolean;
  /** Currently active AI provider */
  aiProvider: AIProvider | null;
  /** Processing queue for files */
  processingQueue: Map<string, Promise<ProcessResult>>;
  /** Cache of file content hashes */
  cache: Map<string, string>;
  /** Timestamp of last notification */
  lastNotificationTime: number;
  /** Extension configuration */
  config: ExtensionConfig;
}

/**
 * AI Provider interface
 */
export interface AIProvider {
  /** Check if provider is available */
  isAvailable(): Promise<boolean>;
  /** Get provider name/identifier */
  getProviderName(): string;
  /**
   * Transform markdown to structured JSON. If `structuredError` is provided,
   * the prompt asks the AI to correct only the flagged items (missing
   * headings / ungrounded diagram or glossary evidence / invalid Mermaid
   * syntax) from a previous /api/process retry_needed response, rather than
   * re-transforming from scratch.
   */
  transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON>;
}

/**
 * File Watcher interface
 */
export interface FileWatcher {
  /** Start watching for file changes */
  start(): Promise<void>;
  /** Stop watching for file changes */
  stop(): Promise<void>;
  /** Register callback for file changes */
  onFileChanged(callback: (uri: import('vscode').Uri) => void): void;
  /** Register callback for file creation */
  onFileCreated(callback: (uri: import('vscode').Uri) => void): void;
}

/**
 * JSON Parser interface
 */
export interface JSONParser {
  /** Parse AI response to structured JSON */
  parse(response: string): StructuredJSON;
  /** Validate structured JSON */
  validate(json: StructuredJSON): ValidationResult;
  /** Parse and validate in one step */
  parseAndValidate(response: string): StructuredJSON;
  /** Pretty print JSON for debugging */
  prettyPrint(json: StructuredJSON): string;
}

/**
 * Backend Client interface
 */
export interface BackendClient {
  /** Ingest structured document to backend (legacy /api/artifacts/ingest-structured path) */
  ingest(data: StructuredJSON): Promise<IngestResponse>;
  /** Submit an EnrichedJSON document to the agentic pipeline's /api/process endpoint */
  process(request: ProcessRequest): Promise<ProcessResponse>;
  /**
   * Report a client-side pipeline step (reading the file, calling the AI
   * provider, etc.) that happens before enough is known to call process() -
   * without this, those steps are invisible on the dashboard until they're
   * already done. Best-effort: implementations must never throw, since a
   * status ping failing should never block the actual pipeline. Returns
   * whether sourcePath is on the project's exceptions list, so the caller
   * can skip the AI call entirely for an excluded file (a failed ping
   * reports excluded: false - the authoritative check still happens
   * server-side in process() regardless).
   */
  reportStep(
    projectId: string,
    sourcePath: string,
    step: string,
    attempt?: number,
    maxAttempts?: number
  ): Promise<{ excluded: boolean }>;
  /** Check backend health/availability */
  checkHealth(): Promise<boolean>;
}

/**
 * Notification Service interface
 */
export interface NotificationService {
  /** Show processing started notification */
  processing(fileName: string): void;
  /** Show success notification */
  success(result: IngestResponse): void;
  /** Show partial-success notification (some diagrams/glossary entries were dropped) */
  partial?(response: ProcessResponse): void;
  /** Show error notification */
  error(error: Error): void;
  /** Show progress for multiple files */
  progress(current: number, total: number): void;
}

/**
 * Transform Pipeline interface
 */
export interface TransformPipeline {
  /** Process a markdown file through complete pipeline */
  process(fileUri: import('vscode').Uri): Promise<ProcessResult>;
}

/**
 * Content Hash Service interface
 * Computes SHA-256 hashes for markdown content to enable deduplication
 */
export interface ContentHashService {
  /** Compute SHA-256 hash from content string */
  computeHash(content: string): string;
  /** Compare two hashes for equality */
  compareHashes(hash1: string, hash2: string): boolean;
}
