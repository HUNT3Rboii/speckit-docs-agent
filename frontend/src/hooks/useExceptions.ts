/**
 * Custom hook for fetching and managing a project's processing-exceptions
 * list (source paths excluded from being converted to PDF) using React
 * Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { ProcessingException } from '../types/api';

const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

export function useExceptions(projectId: string) {
  return useQuery<ProcessingException[], Error>({
    queryKey: ['exceptions', projectId],
    queryFn: () => apiClient.getExceptions(projectId),
    staleTime: 60 * 1000,
    retry: 2,
    enabled: !!projectId,
  });
}

export function useAddException(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation<ProcessingException, Error, string>({
    mutationFn: (sourcePath: string) => apiClient.addException(projectId, sourcePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions', projectId] });
      // Excluding a path hides any artifact(s) that already existed under
      // it server-side (see backend's add_exception route) - refetch the
      // artifact list so the dashboard reflects that immediately instead
      // of showing a now-hidden artifact until the next unrelated refetch
      // happens to occur.
      queryClient.invalidateQueries({ queryKey: ['artifacts', projectId] });
    },
  });
}

export function useRemoveException(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (exceptionId: number) => apiClient.removeException(projectId, exceptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exceptions', projectId] });
      // Removing an exception can bring previously-hidden artifacts back
      // (see backend's remove_exception route) - refetch the artifact
      // list so they reappear immediately.
      queryClient.invalidateQueries({ queryKey: ['artifacts', projectId] });
    },
  });
}
