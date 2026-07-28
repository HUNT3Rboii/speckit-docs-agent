/**
 * Custom hook for fetching artifacts for a specific project using React Query
 * **Validates: Requirements 2.1**
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { Artifact } from '../types/api';

/**
 * Configuration for API client
 * In production, these should come from environment variables
 */
const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

/**
 * Hook for fetching artifacts for a specific project
 * Uses React Query to manage server state with caching
 * 
 * @param projectId - ID of the project to fetch artifacts for
 * @returns Object with artifacts data, loading state, error, and refetch function
 */
export function useArtifacts(projectId: string) {
  return useQuery<Artifact[], Error>({
    queryKey: ['artifacts', projectId],
    queryFn: () => apiClient.getArtifacts(projectId),
    staleTime: 2 * 60 * 1000, // 2 minutes - data considered fresh for 2 minutes
    retry: 2, // Retry failed requests up to 2 times
    enabled: !!projectId, // Only fetch when projectId is provided
  });
}
