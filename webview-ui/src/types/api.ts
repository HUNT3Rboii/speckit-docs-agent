/**
 * TypeScript interfaces for API responses
 * This file contains type definitions for all API endpoints used by the frontend
 */

/**
 * Project entity representing a code repository or workspace
 */
export interface Project {
  id: string;
  name: string;
  repo_url?: string;
  /**
   * Optional so a project row written before this setting existed (or a
   * backend that predates it) still parses - absent is read as automatic,
   * which is what the pipeline did before the setting existed.
   */
  automation_mode?: AutomationMode;
}

/**
 * Whether saving a markdown file in a project runs it through the pipeline
 * on its own ("automatic") or waits to be asked for from the Context Files
 * tab ("manual"). Per-project: one noisy workspace shouldn't force every
 * other project into manual mode.
 */
export type AutomationMode = 'automatic' | 'manual';

/**
 * API response for projects list endpoint
 */
export interface ProjectsResponse {
  projects: Project[];
}

/**
 * Artifact entity representing a generated PDF document with metadata
 */
export interface Artifact {
  id: string;
  project_id: string;
  source_path: string;
  artifact_type: 'spec' | 'plan' | 'task' | 'constitution' | 'other';
  status: string;
  content_hash: string;
  created_at: string;
  title?: string;
  tags?: string[];
  metadata?: {
    current_step?: string | null;
    title?: string;
    error?: string;
    attempt?: number | null;
    max_attempts?: number | null;
    structured_error?: {
      valid: boolean;
      retry_count: number;
      errors: Record<string, string[]>;
      warnings: string[];
    };
    [key: string]: unknown;
  };
}

/**
 * Response from GET /api/status/{artifactId} - a richer per-artifact
 * status snapshot (used while polling a document still being processed)
 * than the plain list-artifacts response.
 */
export interface ArtifactStatusResponse {
  artifact: Artifact;
  latest_version: Version | null;
  version_count: number;
  dropped_items: Record<string, unknown>;
  validation_warnings: string[];
  cache_hit: boolean;
}

/**
 * API response for artifacts list endpoint
 */
export interface ArtifactsResponse {
  artifacts: Artifact[];
}

/**
 * Version entity representing a specific version of an artifact PDF
 */
export interface Version {
  id: string;
  artifact_id: string;
  version_no: number;
  pdf_path: string;
  structured_json: Record<string, unknown>;
  generated_by: string;
  generated_at: string;
}

/**
 * API response for versions list endpoint
 */
export interface VersionsResponse {
  versions: Version[];
}

/**
 * A source_path (exact file) or folder prefix (e.g. ".specify/templates")
 * excluded from processing for a project - managed entirely server-side so
 * it takes effect immediately with no VS Code extension changes needed.
 */
export interface ProcessingException {
  id: number;
  project_id: string;
  source_path: string;
  created_at: string;
}

/**
 * API response for the exceptions list endpoint
 */
export interface ExceptionsResponse {
  exceptions: ProcessingException[];
}

/**
 * A markdown file that exists in the project's working tree, as last
 * reported by the VS Code extension (the backend has no filesystem
 * visibility of its own). Unlike an Artifact, this exists whether or not
 * the file has ever been turned into a PDF - which is exactly what the
 * Context Files page is for.
 */
export interface ProjectFile {
  id: number;
  project_id: string;
  source_path: string;
  size_bytes: number;
  modified_at: string | null;
  /** A transform has been asked for and is waiting to be picked up. */
  transform_requested: boolean;
  requested_at: string | null;
  last_seen_at: string;
  is_excluded: boolean;
  /** Set once this file has been through the pipeline at least once. */
  artifact_id: string | null;
  artifact_status: string | null;
}

export interface ProjectFilesResponse {
  files: ProjectFile[];
}

export type KanbanBoardStatus = 'todo' | 'in_progress' | 'done';

/**
 * A single task parsed out of a tasks.md-classified artifact (see the
 * backend's tasks_parser.py) - re-synced from the file on every successful
 * (re)render. board_status is the only field the board itself can change
 * (via drag-and-drop); everything else is owned by the source file and is
 * overwritten on the next resync.
 */
export interface KanbanTask {
  id: number;
  project_id: string;
  artifact_id: string;
  source_path: string;
  task_key: string;
  phase: string;
  phase_order: number;
  parallel: boolean;
  story: string | null;
  description: string;
  checkbox_done: boolean;
  board_status: KanbanBoardStatus;
  created_at: string;
  updated_at: string;
}

/**
 * API response for the Kanban tasks list endpoint
 */
export interface KanbanTasksResponse {
  tasks: KanbanTask[];
}

/**
 * Error response structure from the backend API
 */
export interface ErrorResponse {
  detail: string | {
    message: string;
    details?: unknown;
  };
}
