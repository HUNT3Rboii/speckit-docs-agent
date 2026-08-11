/**
 * Unit tests for useVersions hook
 * Tests successful data fetching, loading states, error handling, and version-specific behavior
 * **Validates: Requirements 10.1**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVersions } from './useVersions';
import { APIClient } from '../api/client';
import type { Version } from '../types/api';
import type { ReactNode } from 'react';

// Mock the API client module
vi.mock('../api/client');

describe('useVersions', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

  beforeEach(() => {
    // Create a new QueryClient for each test to avoid state leakage
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Disable retries for faster tests
          retryDelay: 0,
        },
      },
      logger: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    // Create a wrapper component that provides QueryClient context
    wrapper = ({ children }: { children: ReactNode }) =>
      QueryClientProvider({ client: queryClient, children });

    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('successful data fetching', () => {
    it('should fetch versions for a specific artifact', async () => {
      const artifactId = 'artifact-123';
      const mockVersions: Version[] = [
        {
          id: 'version-1',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/pdfs/artifact-123-v1.pdf',
          structured_json: { title: 'Version 1' },
          generated_by: 'system',
          generated_at: '2024-01-01T10:00:00Z',
        },
        {
          id: 'version-2',
          artifact_id: artifactId,
          version_no: 2,
          pdf_path: '/pdfs/artifact-123-v2.pdf',
          structured_json: { title: 'Version 2' },
          generated_by: 'user',
          generated_at: '2024-01-02T15:30:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockVersions);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(APIClient.prototype.getVersions).toHaveBeenCalledWith(artifactId);
    });

    it('should return empty array when artifact has no versions', async () => {
      const artifactId = 'no-versions-artifact';
      const mockVersions: Version[] = [];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should fetch multiple versions with sequential version numbers', async () => {
      const artifactId = 'multi-version-artifact';
      const mockVersions: Version[] = [
        {
          id: 'v1',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/v1.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'v2',
          artifact_id: artifactId,
          version_no: 2,
          pdf_path: '/v2.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 'v3',
          artifact_id: artifactId,
          version_no: 3,
          pdf_path: '/v3.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-03T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(3);
      expect(result.current.data?.map((v) => v.version_no)).toEqual([1, 2, 3]);
    });

    it('should handle versions with structured JSON data', async () => {
      const artifactId = 'json-artifact';
      const mockVersions: Version[] = [
        {
          id: 'version-with-json',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/path.pdf',
          structured_json: {
            sections: ['intro', 'body', 'conclusion'],
            metadata: { author: 'AI Agent', tags: ['spec', 'api'] },
          },
          generated_by: 'ai-agent',
          generated_at: '2024-01-15T12:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.[0].structured_json).toEqual({
        sections: ['intro', 'body', 'conclusion'],
        metadata: { author: 'AI Agent', tags: ['spec', 'api'] },
      });
    });
  });

  describe('loading state transitions', () => {
    it('should start with isLoading true and transition to false', async () => {
      const artifactId = 'artifact-456';
      const mockVersions: Version[] = [
        {
          id: 'v1',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/test.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      // Initially should be loading
      expect(result.current.isPending || result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for loading to complete
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data).toEqual(mockVersions);
    });

    it('should have correct state after successful fetch', async () => {
      const artifactId = 'test-artifact';
      const mockVersions: Version[] = [];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API errors and set error state', async () => {
      const artifactId = 'error-artifact';
      const mockError = new Error('Failed to fetch versions');

      vi.mocked(APIClient.prototype.getVersions).mockRejectedValue(mockError);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Failed to fetch versions');
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle 404 errors when artifact not found', async () => {
      const artifactId = 'non-existent-artifact';
      const notFoundError = new Error('Resource not found.');

      vi.mocked(APIClient.prototype.getVersions).mockRejectedValue(notFoundError);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('not found');
    });

    it('should handle network errors', async () => {
      const artifactId = 'network-fail';
      const networkError = new Error('Backend server is not available. Please ensure the backend is running.');

      vi.mocked(APIClient.prototype.getVersions).mockRejectedValue(networkError);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Backend server is not available');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle server errors (500)', async () => {
      const artifactId = 'server-error-artifact';
      const serverError = new Error('Server error occurred. Please try again later.');

      vi.mocked(APIClient.prototype.getVersions).mockRejectedValue(serverError);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Server error occurred');
    });
  });

  describe('enabled parameter behavior', () => {
    it('should not fetch when artifactId is empty string', () => {
      const artifactId = '';

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue([]);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      // Should not fetch data when artifactId is empty
      expect(result.current.isPending).toBe(true);
      expect(APIClient.prototype.getVersions).not.toHaveBeenCalled();
    });

    it('should fetch when artifactId is provided', async () => {
      const artifactId = 'valid-artifact';
      const mockVersions: Version[] = [];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(APIClient.prototype.getVersions).toHaveBeenCalledWith(artifactId);
      expect(APIClient.prototype.getVersions).toHaveBeenCalledTimes(1);
    });
  });

  describe('refetch functionality', () => {
    it('should provide refetch function that re-fetches data', async () => {
      const artifactId = 'refetch-artifact';
      const mockVersions1: Version[] = [
        {
          id: 'v1',
          artifact_id: artifactId,
          version_no: 1,
          pdf_path: '/v1.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-01T00:00:00Z',
        },
      ];
      const mockVersions2: Version[] = [
        ...mockVersions1,
        {
          id: 'v2',
          artifact_id: artifactId,
          version_no: 2,
          pdf_path: '/v2.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-02T00:00:00Z',
        },
      ];

      // First call returns one version
      vi.mocked(APIClient.prototype.getVersions).mockResolvedValueOnce(mockVersions1);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);

      // Second call returns two versions (new version was added)
      vi.mocked(APIClient.prototype.getVersions).mockResolvedValueOnce(mockVersions2);

      // Trigger refetch
      result.current.refetch();

      await waitFor(() => expect(result.current.data).toHaveLength(2));
      expect(result.current.data).toEqual(mockVersions2);
    });
  });

  describe('React Query configuration', () => {
    it('should use correct query key with artifactId', async () => {
      const artifactId = 'query-key-artifact';
      const mockVersions: Version[] = [];

      vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Check that the query exists in the cache with the correct key
      const cachedData = queryClient.getQueryData(['versions', artifactId]);
      expect(cachedData).toEqual(mockVersions);
    });

    it('should use different cache keys for different artifacts', async () => {
      const artifactId1 = 'artifact-1';
      const artifactId2 = 'artifact-2';
      const mockVersions1: Version[] = [
        {
          id: 'v1-1',
          artifact_id: artifactId1,
          version_no: 1,
          pdf_path: '/a1-v1.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-01T00:00:00Z',
        },
      ];
      const mockVersions2: Version[] = [
        {
          id: 'v2-1',
          artifact_id: artifactId2,
          version_no: 1,
          pdf_path: '/a2-v1.pdf',
          structured_json: {},
          generated_by: 'system',
          generated_at: '2024-01-02T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getVersions)
        .mockResolvedValueOnce(mockVersions1)
        .mockResolvedValueOnce(mockVersions2);

      // Render hook for first artifact
      const { result: result1 } = renderHook(() => useVersions(artifactId1), { wrapper });
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      // Render hook for second artifact
      const { result: result2 } = renderHook(() => useVersions(artifactId2), { wrapper });
      await waitFor(() => expect(result2.current.isSuccess).toBe(true));

      // Both should have their own cached data
      expect(queryClient.getQueryData(['versions', artifactId1])).toEqual(mockVersions1);
      expect(queryClient.getQueryData(['versions', artifactId2])).toEqual(mockVersions2);
      expect(result1.current.data).not.toEqual(result2.current.data);
    });

    it('should call API client getVersions method with correct artifactId', async () => {
      const artifactId = 'test-id-789';
      const mockVersions: Version[] = [];
      const getVersionsSpy = vi.mocked(APIClient.prototype.getVersions).mockResolvedValue(mockVersions);

      const { result } = renderHook(() => useVersions(artifactId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getVersionsSpy).toHaveBeenCalledTimes(1);
      expect(getVersionsSpy).toHaveBeenCalledWith(artifactId);
    });
  });
});
