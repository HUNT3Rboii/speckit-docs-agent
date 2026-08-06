/**
 * Unit tests for API Client
 * Tests authentication, error handling, and request configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { APIClient, APIError } from './client';
import type { ProjectsResponse, ArtifactsResponse, VersionsResponse } from '../types/api';

// Mock axios
vi.mock('axios');

const mockedAxios = axios as any;

describe('APIClient', () => {
  let client: APIClient;
  const baseURL = 'http://localhost:8000';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    // Create a mock axios instance
    const mockInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((onFulfilled) => {
            mockInstance._requestInterceptor = onFulfilled;
            return 0;
          }),
        },
        response: {
          use: vi.fn((onFulfilled, onRejected) => {
            mockInstance._responseInterceptor = { onFulfilled, onRejected };
            return 0;
          }),
        },
      },
      _requestInterceptor: null as any,
      _responseInterceptor: null as any,
    };

    mockedAxios.create = vi.fn(() => mockInstance);
    client = new APIClient(baseURL, apiKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct base URL and timeout', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should set up request and response interceptors', () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('request interceptor', () => {
    it('should inject Authorization header with API key', () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const requestInterceptor = mockInstance._requestInterceptor;

      const mockConfig = {
        headers: {},
      };

      const result = requestInterceptor(mockConfig);

      expect(result.headers.Authorization).toBe(`Bearer ${apiKey}`);
    });
  });

  describe('getProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const mockProjects = [
        { id: '1', name: 'Project 1', repo_url: 'https://github.com/test/repo1' },
        { id: '2', name: 'Project 2' },
      ];
      const mockResponse: ProjectsResponse = { projects: mockProjects };

      mockInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getProjects();

      expect(mockInstance.get).toHaveBeenCalledWith('/api/projects');
      expect(result).toEqual(mockProjects);
    });
  });

  describe('getArtifacts', () => {
    it('should fetch artifacts for a project', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const projectId = 'project-123';
      const mockArtifacts = [
        {
          id: 'artifact-1',
          project_id: projectId,
          source_path: 'path/to/spec.md',
          artifact_type: 'spec' as const,
          status: 'completed',
          content_hash: 'hash123',
          created_at: '2024-01-01T00:00:00Z',
          title: 'Test Spec',
        },
      ];
      const mockResponse: ArtifactsResponse = { artifacts: mockArtifacts };

      mockInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getArtifacts(projectId);

      expect(mockInstance.get).toHaveBeenCalledWith(`/api/projects/${projectId}/artifacts`);
      expect(result).toEqual(mockArtifacts);
    });
  });

  describe('setArtifactTags', () => {
    it('should PUT the full tag list and return the normalized result', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const artifactId = 'artifact-1';
      mockInstance.put.mockResolvedValue({
        data: { artifact_id: artifactId, tags: ['important', 'release'] },
      });

      const result = await client.setArtifactTags(artifactId, ['release', 'important']);

      expect(mockInstance.put).toHaveBeenCalledWith(`/api/artifacts/${artifactId}/tags`, {
        tags: ['release', 'important'],
      });
      expect(result).toEqual(['important', 'release']);
    });
  });

  describe('cancelArtifact', () => {
    it('should POST to the cancel endpoint with no body', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const artifactId = 'artifact-1';
      mockInstance.post.mockResolvedValue({ data: { artifact: { id: artifactId } } });

      await client.cancelArtifact(artifactId);

      expect(mockInstance.post).toHaveBeenCalledWith(`/api/artifacts/${artifactId}/cancel`);
    });
  });

  describe('retryArtifact', () => {
    it('should POST to the retry endpoint with no body', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const artifactId = 'artifact-1';
      mockInstance.post.mockResolvedValue({ data: { artifact: { id: artifactId } } });

      await client.retryArtifact(artifactId);

      expect(mockInstance.post).toHaveBeenCalledWith(`/api/artifacts/${artifactId}/retry`);
    });
  });

  describe('getVersions', () => {
    it('should fetch versions for an artifact', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const artifactId = 'artifact-123';
      const mockVersions = [
        {
          id: 'version-1',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/path/to/pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-01T00:00:00Z',
        },
      ];
      const mockResponse: VersionsResponse = { versions: mockVersions };

      mockInstance.get.mockResolvedValue({ data: mockResponse });

      const result = await client.getVersions(artifactId);

      expect(mockInstance.get).toHaveBeenCalledWith(`/api/artifacts/${artifactId}/versions`);
      expect(result).toEqual(mockVersions);
    });
  });

  describe('downloadPDF', () => {
    it('should download PDF as blob', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const versionId = 'version-123';
      const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' });

      mockInstance.get.mockResolvedValue({ data: mockBlob });

      const result = await client.downloadPDF(versionId);

      expect(mockInstance.get).toHaveBeenCalledWith(`/api/doc-versions/${versionId}/pdf`, {
        responseType: 'blob',
      });
      expect(result).toEqual(mockBlob);
    });
  });

  describe('error handling', () => {
    it('should handle network errors (status 0)', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const responseInterceptor = mockInstance._responseInterceptor.onRejected;

      const mockError = {
        response: undefined,
        message: 'Network Error',
      };

      const apiError = responseInterceptor(mockError);

      await expect(apiError).rejects.toThrow(APIError);
      await expect(apiError).rejects.toMatchObject({
        statusCode: 0,
        message: 'Backend server is not available. Please ensure the backend is running.',
      });
    });

    it('should handle 401 authentication errors', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const responseInterceptor = mockInstance._responseInterceptor.onRejected;

      const mockError = {
        response: {
          status: 401,
          data: { detail: 'Invalid API key' },
        },
      };

      const apiError = responseInterceptor(mockError);

      await expect(apiError).rejects.toThrow(APIError);
      await expect(apiError).rejects.toMatchObject({
        statusCode: 401,
        message: 'Authentication failed. Please check API key configuration.',
      });
    });

    it('should handle 404 not found errors', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const responseInterceptor = mockInstance._responseInterceptor.onRejected;

      const mockError = {
        response: {
          status: 404,
          data: { detail: 'Resource not found' },
        },
      };

      const apiError = responseInterceptor(mockError);

      await expect(apiError).rejects.toThrow(APIError);
      await expect(apiError).rejects.toMatchObject({
        statusCode: 404,
        message: 'Resource not found.',
      });
    });

    it('should handle 500 server errors', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const responseInterceptor = mockInstance._responseInterceptor.onRejected;

      const mockError = {
        response: {
          status: 500,
          data: { detail: 'Internal server error' },
        },
      };

      const apiError = responseInterceptor(mockError);

      await expect(apiError).rejects.toThrow(APIError);
      await expect(apiError).rejects.toMatchObject({
        statusCode: 500,
        message: 'Server error occurred. Please try again later.',
      });
    });

    it('should handle 422 validation errors with custom message', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const responseInterceptor = mockInstance._responseInterceptor.onRejected;

      const mockError = {
        response: {
          status: 422,
          data: {
            detail: {
              message: 'Validation failed',
              details: { field: 'Invalid format' },
            },
          },
        },
      };

      const apiError = responseInterceptor(mockError);

      await expect(apiError).rejects.toThrow(APIError);
      await expect(apiError).rejects.toMatchObject({
        statusCode: 422,
        message: 'Validation failed',
        details: { field: 'Invalid format' },
      });
    });
  });

  describe('APIError class', () => {
    it('should create APIError with correct properties', () => {
      const error = new APIError(404, 'Not found', { extra: 'info' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(APIError);
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.details).toEqual({ extra: 'info' });
      expect(error.name).toBe('APIError');
    });
  });
});
