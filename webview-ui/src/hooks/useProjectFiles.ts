/**
 * Custom hooks for a project's markdown-file inventory - every .md in the
 * working tree, whether or not it has been turned into a PDF yet - and for
 * queueing one of those files for a run through the pipeline.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { ProjectFile } from '../types/api';

const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

export function useProjectFiles(projectId: string) {
  return useQuery<ProjectFile[], Error>({
    queryKey: ['project-files', projectId],
    queryFn: () => apiClient.getProjectFiles(projectId),
    // The inventory only changes when the VS Code extension pushes a new
    // one, and a queued transform only clears once the extension picks it
    // up on its own (up to 15s) poll - so this refetches on a timer rather
    // than leaving a "Queued" row looking stuck until a manual reload.
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    retry: 2,
    enabled: !!projectId,
  });
}

export function useRequestFileTransform(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation<ProjectFile, Error, string>({
    mutationFn: (sourcePath: string) => apiClient.requestFileTransform(projectId, sourcePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      // A queued file becomes an artifact once the extension acts on it,
      // so the artifact list is about to change too.
      queryClient.invalidateQueries({ queryKey: ['artifacts', projectId] });
    },
  });
}
