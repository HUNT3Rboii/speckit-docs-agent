/**
 * Custom hook for fetching artifacts for a specific project using React Query
 * **Validates: Requirements 2.1**
 */

import { useQuery } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { Artifact } from '../types/api';
import { isProcessing } from '../utils/processingStatus';

/**
 * Configuration for API client
 * In production, these should come from environment variables
 */
const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

/**
 * How often to re-poll the artifact list. Always polls - never returns
 * `false` - because a brand-new document (one that's never been saved
 * before) has no row in the current data for a "is anything processing"
 * check to match against, so a conditional-only poll can never notice it
 * appearing; the page would just sit there until something else happens
 * to trigger a refetch (window refocus, a manual reload). Polling faster
 * while something already in the list is live keeps that case snappy;
 * the slower steady-state poll is what actually catches a new card
 * showing up.
 */
export function getArtifactsRefetchInterval(artifacts: Artifact[] | undefined): number {
  return artifacts?.some((artifact) => isProcessing(artifact.status)) ? 3000 : 10000;
}

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
    refetchInterval: (query) => getArtifactsRefetchInterval(query.state.data),
  });
}
