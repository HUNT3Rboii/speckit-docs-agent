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

// Export a singleton instance configured from environment variables
import { config } from '../config/env';
export const apiClient = new APIClient(config.apiBaseUrl, config.apiKey);
