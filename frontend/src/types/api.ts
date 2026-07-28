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
 * Error response structure from the backend API
 */
export interface ErrorResponse {
  detail: string | {
    message: string;
    details?: any;
  };
}
