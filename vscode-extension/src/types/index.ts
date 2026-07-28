/**
 * Core type definitions for Speckit Auto-AI Extension
 */

/**
 * Section type classification for document structure
 */
export type SectionType = 'task' | 'user_story' | 'design_decision' | 'normal';

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
}

/**
 * Structured JSON representation of a markdown document
 */
export interface StructuredJSON {
  /** Document title */
  title: string;
  /** 2-3 sentence summary of the document */
  abstract: string;
  /** Classified sections of the document */
  sections: Section[];
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
  /** Transform markdown to structured JSON */
  transform(markdown: string, sourcePath: string): Promise<StructuredJSON>;
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
  /** Ingest structured document to backend */
  ingest(data: StructuredJSON): Promise<IngestResponse>;
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
