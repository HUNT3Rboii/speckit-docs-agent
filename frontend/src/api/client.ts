/**
 * API Client for communicating with the FastAPI backend
 * Handles authentication, error handling, and request/response transformation
 */

import axios, { type AxiosInstance, AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type {
  Project,
  ProjectsResponse,
  Artifact,
  ArtifactsResponse,
  ArtifactStatusResponse,
  Version,
  VersionsResponse,
  ProcessingException,
  ExceptionsResponse,
  ProjectFile,
  ProjectFilesResponse,
  AutomationMode,
  KanbanTask,
  KanbanTasksResponse,
  KanbanBoardStatus,
  ErrorResponse,
} from '../types/api';

/**
 * Custom error class for API errors with structured information
 */
export class APIError extends Error {
  statusCode: number;
  message: string;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.details = details;
    this.name = 'APIError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    const captureStackTrace = (Error as any).captureStackTrace;
    if (captureStackTrace) {
      captureStackTrace(this, APIError);
    }
  }
}

/**
 * Maps Axios errors to user-friendly APIError instances
 */
function handleAPIError(error: AxiosError<ErrorResponse>): APIError {
  // Network error or backend server unavailable
  if (!error.response) {
    return new APIError(
      0,
      'Backend server is not available. Please ensure the backend is running.'
    );
  }

  const status = error.response.status;
  const responseData = error.response.data;

  // Extract error message from response if available
  let errorMessage = 'An unexpected error occurred.';
  let errorDetails = undefined;

  if (responseData?.detail) {
    if (typeof responseData.detail === 'string') {
      errorMessage = responseData.detail;
    } else if (typeof responseData.detail === 'object' && responseData.detail.message) {
      errorMessage = responseData.detail.message;
      errorDetails = responseData.detail.details;
    }
  }

  // Map HTTP status codes to user-friendly messages
  switch (status) {
    case 401:
      return new APIError(
        401,
        'Authentication failed. Please check API key configuration.',
        errorDetails
      );
    case 404:
      return new APIError(404, 'Resource not found.', errorDetails);
    case 500:
      return new APIError(
        500,
        'Server error occurred. Please try again later.',
        errorDetails
      );
    case 422:
      return new APIError(
        422,
        errorMessage || 'Invalid data. Please try again.',
        errorDetails
      );
    default:
      return new APIError(status, errorMessage, errorDetails);
  }
}

/**
 * APIClient class handles all HTTP communication with the backend
 */
export class APIClient {
  private axiosInstance: AxiosInstance;
  private apiKey: string;

  /**
   * Creates a new APIClient instance
   * @param baseURL - Base URL of the backend API (e.g., http://localhost:8000)
   * @param apiKey - API key for authentication
   */
  constructor(baseURL: string, apiKey: string) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000, // 30-second timeout for all requests
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to inject Authorization header
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Inject API key in Authorization header
        if (this.apiKey) {
          config.headers.Authorization = `Bearer ${this.apiKey}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Pass through successful responses
        return response;
      },
      (error: AxiosError<ErrorResponse>) => {
        // Transform Axios errors to APIError instances
        const apiError = handleAPIError(error);
        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Fetches all projects from the backend
   * @returns Promise resolving to array of Project objects
   * @throws APIError on failure
   */
  async getProjects(): Promise<Project[]> {
    const response = await this.axiosInstance.get<ProjectsResponse>('/api/projects');
    return response.data.projects;
  }

  /**
   * Fetches all artifacts for a specific project
   * @param projectId - ID of the project
   * @returns Promise resolving to array of Artifact objects
   * @throws APIError on failure
   */
  async getArtifacts(projectId: string): Promise<Artifact[]> {
    const response = await this.axiosInstance.get<ArtifactsResponse>(
      `/api/projects/${projectId}/artifacts`
    );
    return response.data.artifacts;
  }

  /**
   * Fetches version history for a specific artifact
   * @param artifactId - ID of the artifact
   * @returns Promise resolving to array of Version objects
   * @throws APIError on failure
   */
  async getVersions(artifactId: string): Promise<Version[]> {
    const response = await this.axiosInstance.get<VersionsResponse>(
      `/api/artifacts/${artifactId}/versions`
    );
    return response.data.versions;
  }

  /**
   * Fetches live processing status for a specific artifact - the current
   * pipeline step while it's still rendering, or the final artifact/version
   * once done.
   * @param artifactId - ID of the artifact
   * @throws APIError on failure
   */
  async getArtifactStatus(artifactId: string): Promise<ArtifactStatusResponse> {
    const response = await this.axiosInstance.get<ArtifactStatusResponse>(
      `/api/status/${artifactId}`
    );
    return response.data;
  }

  /**
   * Fetches the processing-exceptions list (excluded paths) for a project
   * @param projectId - ID of the project
   * @throws APIError on failure
   */
  async getExceptions(projectId: string): Promise<ProcessingException[]> {
    const response = await this.axiosInstance.get<ExceptionsResponse>(
      `/api/projects/${projectId}/exceptions`
    );
    return response.data.exceptions;
  }

  /**
   * Adds a path (exact file or folder prefix) to a project's processing-
   * exceptions list, excluding it from future processing.
   * @param projectId - ID of the project
   * @param sourcePath - exact file path or folder prefix to exclude
   * @throws APIError on failure
   */
  async addException(projectId: string, sourcePath: string): Promise<ProcessingException> {
    const response = await this.axiosInstance.post<{ exception: ProcessingException }>(
      `/api/projects/${projectId}/exceptions`,
      { source_path: sourcePath }
    );
    return response.data.exception;
  }

  /**
   * Removes a path from a project's processing-exceptions list.
   * @param projectId - ID of the project
   * @param exceptionId - ID of the exception entry to remove
   * @throws APIError on failure
   */
  async removeException(projectId: string, exceptionId: number): Promise<void> {
    await this.axiosInstance.delete(`/api/projects/${projectId}/exceptions/${exceptionId}`);
  }

  /**
   * Fetches every markdown file in the project's working tree, whether or
   * not it has ever been turned into a PDF. Sourced from what the VS Code
   * extension last reported - an empty list usually means the extension
   * isn't running rather than that the project has no markdown.
   * @param projectId - ID of the project
   * @throws APIError on failure
   */
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const response = await this.axiosInstance.get<ProjectFilesResponse>(
      `/api/projects/${projectId}/files`
    );
    return response.data.files;
  }

  /**
   * Queues one markdown file for a run through the pipeline. The backend
   * can only record the request - the VS Code extension is what has the
   * file and the AI provider - so a successful response means "queued",
   * not "converted".
   * @param projectId - ID of the project
   * @param sourcePath - workspace-relative path of the file to transform
   * @throws APIError on failure
   */
  async requestFileTransform(projectId: string, sourcePath: string): Promise<ProjectFile> {
    const response = await this.axiosInstance.post<{ file: ProjectFile }>(
      `/api/projects/${projectId}/files/transform`,
      { source_path: sourcePath }
    );
    return response.data.file;
  }

  /**
   * Switches a project between processing every save automatically and
   * only processing what's explicitly asked for.
   * @param projectId - ID of the project
   * @param mode - "automatic" or "manual"
   * @throws APIError on failure
   */
  async setAutomationMode(projectId: string, mode: AutomationMode): Promise<Project> {
    const response = await this.axiosInstance.patch<Project>(
      `/api/projects/${projectId}/automation-mode`,
      { mode }
    );
    return response.data;
  }

  /**
   * Fetches all Kanban tasks for a project, across every tasks.md-classified
   * artifact.
   * @param projectId - ID of the project
   * @throws APIError on failure
   */
  async getKanbanTasks(projectId: string): Promise<KanbanTask[]> {
    const response = await this.axiosInstance.get<KanbanTasksResponse>(
      `/api/projects/${projectId}/kanban-tasks`
    );
    return response.data.tasks;
  }

  /**
   * Moves a Kanban card between columns and, optionally, between phase
   * lanes (when phase/phaseOrder are supplied, e.g. dragging a card into a
   * different phase's board).
   * @param taskId - ID of the task
   * @param boardStatus - the column to move it to
   * @param phase - target phase lane, if the card moved to a different one
   * @param phaseOrder - the target phase's sort order, kept in sync with phase
   * @throws APIError on failure
   */
  async updateKanbanTaskStatus(
    taskId: number,
    boardStatus: KanbanBoardStatus,
    phase?: string,
    phaseOrder?: number
  ): Promise<KanbanTask> {
    const response = await this.axiosInstance.patch<{ task: KanbanTask }>(`/api/kanban-tasks/${taskId}`, {
      board_status: boardStatus,
      ...(phase !== undefined ? { phase } : {}),
      ...(phaseOrder !== undefined ? { phase_order: phaseOrder } : {}),
    });
    return response.data.task;
  }

  /**
   * Replaces an artifact's full tag list (not a partial add/remove) -
   * callers send the complete desired set.
   * @param artifactId - ID of the artifact
   * @param tags - the complete desired tag list
   * @throws APIError on failure (404 if the artifact doesn't exist)
   */
  async setArtifactTags(artifactId: string, tags: string[]): Promise<string[]> {
    const response = await this.axiosInstance.put<{ tags: string[] }>(
      `/api/artifacts/${artifactId}/tags`,
      { tags }
    );
    return response.data.tags;
  }

  /**
   * Flags an in-flight artifact for cancellation. Best-effort: the VS Code
   * extension (where the actual AI call runs) notices this the next time
   * it reports a processing step and cancels its own work - there's no way
   * for the backend to forcibly interrupt it.
   * @param artifactId - ID of the artifact to cancel
   * @throws APIError on failure (404 if the artifact doesn't exist)
   */
  async cancelArtifact(artifactId: string): Promise<void> {
    await this.axiosInstance.post(`/api/artifacts/${artifactId}/cancel`);
  }

  /**
   * Flags an artifact to be reprocessed from scratch. The VS Code
   * extension polls for pending retries and, on seeing this one, re-reads
   * the file from disk and re-runs the full pipeline (fresh AI call
   * included) as if it had just been saved.
   * @param artifactId - ID of the artifact to retry
   * @throws APIError on failure (404 if the artifact doesn't exist)
   */
  async retryArtifact(artifactId: string): Promise<void> {
    await this.axiosInstance.post(`/api/artifacts/${artifactId}/retry`);
  }

  /**
   * Downloads a PDF file for a specific document version
   * @param versionId - ID of the document version
   * @returns Promise resolving to Blob containing PDF data
   * @throws APIError on failure
   */
  async downloadPDF(versionId: string): Promise<Blob> {
    const response = await this.axiosInstance.get(`/api/doc-versions/${versionId}/pdf`, {
      responseType: 'blob',
    });
    return response.data;
  }
}
