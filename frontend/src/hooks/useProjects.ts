/**
 * Custom hook for fetching projects using React Query
 * **Validates: Requirements 1.1**
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { Project } from '../types/api';

/**
 * Configuration for API client
 * In production, these should come from environment variables
 */
const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

/**
 * Hook for fetching all projects
 * Uses React Query to manage server state with caching
 * 
 * @returns Object with projects data, loading state, error, and refetch function
 */
export function useProjects() {
  return useQuery<Project[], Error>({
    queryKey: ['projects'],
    queryFn: () => apiClient.getProjects(),
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh for 5 minutes
    retry: 2, // Retry failed requests up to 2 times
  });
}
