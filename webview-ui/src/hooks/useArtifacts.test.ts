/**
 * Unit tests for useArtifacts hook
 * Tests successful data fetching, loading states, error handling, and project-specific behavior
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useArtifacts, getArtifactsRefetchInterval } from './useArtifacts';
import { APIClient } from '../api/client';
import type { Artifact } from '../types/api';
import type { ReactNode } from 'react';

// Mock the API client module
vi.mock('../api/client');

describe('useArtifacts', () => {
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
    it('should fetch artifacts for a specific project', async () => {
      const projectId = 'project-123';
      const mockArtifacts: Artifact[] = [
        {
          id: 'artifact-1',
          project_id: projectId,
          source_path: 'docs/spec.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'hash1',
          created_at: '2024-01-15T10:00:00Z',
          title: 'API Specification',
        },
        {
          id: 'artifact-2',
          project_id: projectId,
          source_path: 'docs/plan.md',
          artifact_type: 'plan',
          status: 'completed',
          content_hash: 'hash2',
          created_at: '2024-01-16T11:30:00Z',
          title: 'Implementation Plan',
        },
      ];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockArtifacts);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(APIClient.prototype.getArtifacts).toHaveBeenCalledWith(projectId);
    });

    it('should return empty array when project has no artifacts', async () => {
      const projectId = 'empty-project';
      const mockArtifacts: Artifact[] = [];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('should fetch artifacts with different artifact types', async () => {
      const projectId = 'multi-type-project';
      const mockArtifacts: Artifact[] = [
        {
          id: '1',
          project_id: projectId,
          source_path: 'spec.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'h1',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          project_id: projectId,
          source_path: 'plan.md',
          artifact_type: 'plan',
          status: 'completed',
          content_hash: 'h2',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: '3',
          project_id: projectId,
          source_path: 'task.md',
          artifact_type: 'task',
          status: 'completed',
          content_hash: 'h3',
          created_at: '2024-01-03T00:00:00Z',
        },
        {
          id: '4',
          project_id: projectId,
          source_path: 'constitution.md',
          artifact_type: 'constitution',
          status: 'completed',
          content_hash: 'h4',
          created_at: '2024-01-04T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(4);
      expect(result.current.data?.map((a) => a.artifact_type)).toEqual(['spec', 'plan', 'task', 'constitution']);
    });
  });

  describe('loading state transitions', () => {
    it('should start with isLoading true and transition to false', async () => {
      const projectId = 'project-456';
      const mockArtifacts: Artifact[] = [
        {
          id: 'artifact-1',
          project_id: projectId,
          source_path: 'test.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'hash',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      // Initially should be loading
      expect(result.current.isPending || result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for loading to complete
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data).toEqual(mockArtifacts);
    });

    it('should have correct state after successful fetch', async () => {
      const projectId = 'test-project';
      const mockArtifacts: Artifact[] = [];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API errors and set error state', async () => {
      const projectId = 'error-project';
      const mockError = new Error('Failed to fetch artifacts');

      vi.mocked(APIClient.prototype.getArtifacts).mockRejectedValue(mockError);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Failed to fetch artifacts');
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle 404 errors when project not found', async () => {
      const projectId = 'non-existent-project';
      const notFoundError = new Error('Resource not found.');

      vi.mocked(APIClient.prototype.getArtifacts).mockRejectedValue(notFoundError);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('not found');
    });

    it('should handle network errors', async () => {
      const projectId = 'network-fail-project';
      const networkError = new Error('Backend server is not available. Please ensure the backend is running.');

      vi.mocked(APIClient.prototype.getArtifacts).mockRejectedValue(networkError);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Backend server is not available');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle authentication errors (401)', async () => {
      const projectId = 'auth-fail-project';
      const authError = new Error('Authentication failed. Please check API key configuration.');

      vi.mocked(APIClient.prototype.getArtifacts).mockRejectedValue(authError);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Authentication failed');
    });
  });

  describe('enabled parameter behavior', () => {
    it('should not fetch when projectId is empty string', () => {
      const projectId = '';

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue([]);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      // Should not fetch data when projectId is empty
      expect(result.current.isPending).toBe(true);
      expect(APIClient.prototype.getArtifacts).not.toHaveBeenCalled();
    });

    it('should fetch when projectId is provided', async () => {
      const projectId = 'valid-project';
      const mockArtifacts: Artifact[] = [];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(APIClient.prototype.getArtifacts).toHaveBeenCalledWith(projectId);
      expect(APIClient.prototype.getArtifacts).toHaveBeenCalledTimes(1);
    });
  });

  describe('refetch functionality', () => {
    it('should provide refetch function that re-fetches data', async () => {
      const projectId = 'refetch-project';
      const mockArtifacts1: Artifact[] = [
        {
          id: '1',
          project_id: projectId,
          source_path: 'first.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'h1',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      const mockArtifacts2: Artifact[] = [
        ...mockArtifacts1,
        {
          id: '2',
          project_id: projectId,
          source_path: 'second.md',
          artifact_type: 'plan',
          status: 'completed',
          content_hash: 'h2',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      // First call returns one artifact
      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValueOnce(mockArtifacts1);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);

      // Second call returns two artifacts
      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValueOnce(mockArtifacts2);

      // Trigger refetch
      result.current.refetch();

      await waitFor(() => expect(result.current.data).toHaveLength(2));
      expect(result.current.data).toEqual(mockArtifacts2);
    });
  });

  describe('React Query configuration', () => {
    it('should use correct query key with projectId', async () => {
      const projectId = 'query-key-project';
      const mockArtifacts: Artifact[] = [];

      vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Check that the query exists in the cache with the correct key
      const cachedData = queryClient.getQueryData(['artifacts', projectId]);
      expect(cachedData).toEqual(mockArtifacts);
    });

    it('should use different cache keys for different projects', async () => {
      const projectId1 = 'project-1';
      const projectId2 = 'project-2';
      const mockArtifacts1: Artifact[] = [
        {
          id: '1',
          project_id: projectId1,
          source_path: 'p1.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'h1',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];
      const mockArtifacts2: Artifact[] = [
        {
          id: '2',
          project_id: projectId2,
          source_path: 'p2.md',
          artifact_type: 'plan',
          status: 'completed',
          content_hash: 'h2',
          created_at: '2024-01-02T00:00:00Z',
        },
      ];

      vi.mocked(APIClient.prototype.getArtifacts)
        .mockResolvedValueOnce(mockArtifacts1)
        .mockResolvedValueOnce(mockArtifacts2);

      // Render hook for first project
      const { result: result1 } = renderHook(() => useArtifacts(projectId1), { wrapper });
      await waitFor(() => expect(result1.current.isSuccess).toBe(true));

      // Render hook for second project
      const { result: result2 } = renderHook(() => useArtifacts(projectId2), { wrapper });
      await waitFor(() => expect(result2.current.isSuccess).toBe(true));

      // Both should have their own cached data
      expect(queryClient.getQueryData(['artifacts', projectId1])).toEqual(mockArtifacts1);
      expect(queryClient.getQueryData(['artifacts', projectId2])).toEqual(mockArtifacts2);
      expect(result1.current.data).not.toEqual(result2.current.data);
    });

    it('should call API client getArtifacts method with correct projectId', async () => {
      const projectId = 'test-id-123';
      const mockArtifacts: Artifact[] = [];
      const getArtifactsSpy = vi.mocked(APIClient.prototype.getArtifacts).mockResolvedValue(mockArtifacts);

      const { result } = renderHook(() => useArtifacts(projectId), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getArtifactsSpy).toHaveBeenCalledTimes(1);
      expect(getArtifactsSpy).toHaveBeenCalledWith(projectId);
    });
  });
});

describe('getArtifactsRefetchInterval', () => {
  const makeArtifact = (status: string): Artifact => ({
    id: 'artifact-1',
    project_id: 'proj-1',
    source_path: 'spec.md',
    artifact_type: 'spec',
    status,
    content_hash: 'hash',
    created_at: '2024-01-01T00:00:00Z',
  });

  it('never stops polling, even when nothing is currently processing', () => {
    // Regression: a brand-new document has no row in the list yet for a
    // conditional-only "is anything processing" check to match against,
    // so a poll that fully stops (returns false) once everything settles
    // can never notice a new card appear - the page just sits there until
    // the user manually refreshes.
    expect(getArtifactsRefetchInterval([makeArtifact('rendered')])).toBeGreaterThan(0);
    expect(getArtifactsRefetchInterval([])).toBeGreaterThan(0);
    expect(getArtifactsRefetchInterval(undefined)).toBeGreaterThan(0);
  });

  it('polls faster while an artifact in the list is actively processing', () => {
    const idle = getArtifactsRefetchInterval([makeArtifact('rendered')]);
    const active = getArtifactsRefetchInterval([makeArtifact('processing')]);
    expect(active).toBeLessThan(idle);
  });

  it('polls faster while an artifact is retry_needed too', () => {
    const idle = getArtifactsRefetchInterval([makeArtifact('rendered')]);
    const retrying = getArtifactsRefetchInterval([makeArtifact('retry_needed')]);
    expect(retrying).toBeLessThan(idle);
  });
});
