/**
 * Custom hook for fetching version history for an artifact using React Query
 * **Validates: Requirements 10.1**
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { Version } from '../types/api';

/**
 * Configuration for API client
 * In production, these should come from environment variables
 */
const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

/**
 * Hook for fetching version history for a specific artifact
 * Uses React Query to manage server state with caching
 * 
 * @param artifactId - ID of the artifact to fetch versions for
 * @returns Object with versions data, loading state, error, and refetch function
 */
export function useVersions(artifactId: string) {
  return useQuery<Version[], Error>({
    queryKey: ['versions', artifactId],
    queryFn: () => apiClient.getVersions(artifactId),
    staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh for 5 minutes
    retry: 2, // Retry failed requests up to 2 times
    enabled: !!artifactId, // Only fetch when artifactId is provided
  });
}
