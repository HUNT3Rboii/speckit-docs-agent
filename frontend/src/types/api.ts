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
}

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
  structured_json: Record<string, any>;
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
 * Error response structure from the backend API
 */
export interface ErrorResponse {
  detail: string | {
    message: string;
    details?: any;
  };
}
