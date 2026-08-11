/**
 * Unit tests for useProjects hook
 * Tests successful data fetching, loading states, and error handling
 * **Validates: Requirements 1.1**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProjects } from './useProjects';
import { APIClient } from '../api/client';
import type { Project } from '../types/api';
import type { ReactNode } from 'react';

// Mock the API client module
vi.mock('../api/client');

describe('useProjects', () => {
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
    it('should fetch and return projects successfully', async () => {
      const mockProjects: Project[] = [
        { id: '1', name: 'Project Alpha', repo_url: 'https://github.com/test/alpha' },
        { id: '2', name: 'Project Beta' },
      ];

      // Mock the getProjects method to return test data
      vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      // Wait for the query to complete
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockProjects);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should return empty array when no projects exist', async () => {
      const mockProjects: Project[] = [];

      vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('loading state transitions', () => {
    it('should start with isLoading true and transition to false', async () => {
      const mockProjects: Project[] = [{ id: '1', name: 'Test Project' }];

      vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      // Initially should be loading (isPending in React Query v5)
      expect(result.current.isPending || result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();

      // Wait for loading to complete
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.data).toEqual(mockProjects);
    });

    it('should have correct state after successful fetch', async () => {
      const mockProjects: Project[] = [{ id: '1', name: 'Test' }];

      vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API errors and set error state', async () => {
      const mockError = new Error('Network error');

      vi.mocked(APIClient.prototype.getProjects).mockRejectedValue(mockError);

      const { result } = renderHook(() => useProjects(), { wrapper });

      // Wait for the error state to be set
      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.data).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle backend unavailable error', async () => {
      const backendError = new Error('Backend server is not available. Please ensure the backend is running.');

      vi.mocked(APIClient.prototype.getProjects).mockRejectedValue(backendError);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Backend server is not available');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle authentication errors (401)', async () => {
      const authError = new Error('Authentication failed. Please check API key configuration.');

      vi.mocked(APIClient.prototype.getProjects).mockRejectedValue(authError);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toContain('Authentication failed');
    });
  });

  describe('refetch functionality', () => {
    it('should provide refetch function that re-fetches data', async () => {
      const mockProjects1: Project[] = [{ id: '1', name: 'First' }];
      const mockProjects2: Project[] = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' },
      ];

      // First call returns one project
      vi.mocked(APIClient.prototype.getProjects).mockResolvedValueOnce(mockProjects1);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockProjects1);

      // Second call returns two projects
      vi.mocked(APIClient.prototype.getProjects).mockResolvedValueOnce(mockProjects2);

      // Trigger refetch
      result.current.refetch();

      await waitFor(() => expect(result.current.data).toEqual(mockProjects2));
    });
  });

  describe('React Query configuration', () => {
    it('should use correct query key', async () => {
      const mockProjects: Project[] = [{ id: '1', name: 'Test' }];

      vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Check that the query exists in the cache with the correct key
      const cachedData = queryClient.getQueryData(['projects']);
      expect(cachedData).toEqual(mockProjects);
    });

    it('should call API client getProjects method', async () => {
      const mockProjects: Project[] = [];
      const getProjectsSpy = vi.mocked(APIClient.prototype.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useProjects(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(getProjectsSpy).toHaveBeenCalledTimes(1);
    });
  });
});
