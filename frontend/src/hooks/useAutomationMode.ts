/**
 * Custom hook for a project's automatic/manual transformation setting.
 *
 * The mode lives on the project row, so there's no separate query for it -
 * this reads out of the projects list already in the cache and writes back
 * optimistically, which keeps the sidebar toggle from flicking back to its
 * old position while the request is in flight.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { AutomationMode, Project } from '../types/api';

const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

export function useSetAutomationMode(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, AutomationMode, { previous?: Project[] }>({
    mutationFn: (mode: AutomationMode) => apiClient.setAutomationMode(projectId, mode),
    onMutate: async (mode) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] });
      const previous = queryClient.getQueryData<Project[]>(['projects']);
      queryClient.setQueryData<Project[]>(['projects'], (projects) =>
        projects?.map((project) =>
          project.id === projectId ? { ...project, automation_mode: mode } : project
        )
      );
      return { previous };
    },
    onError: (_error, _mode, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['projects'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
