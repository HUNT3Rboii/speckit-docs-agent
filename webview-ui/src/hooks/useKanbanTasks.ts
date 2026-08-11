/**
 * Custom hook for fetching and managing a project's Kanban board tasks
 * (parsed from tasks.md-classified artifacts - see the backend's
 * tasks_parser.py) using React Query.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIClient } from '../api/client';
import type { KanbanBoardStatus, KanbanTask } from '../types/api';

const apiClient = new APIClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  import.meta.env.VITE_API_KEY || 'dev-api-key'
);

export function useKanbanTasks(projectId: string) {
  return useQuery<KanbanTask[], Error>({
    queryKey: ['kanban-tasks', projectId],
    queryFn: () => apiClient.getKanbanTasks(projectId),
    staleTime: 30 * 1000,
    retry: 2,
    enabled: !!projectId,
    // Always poll (not conditionally): a brand-new task (from a tasks.md
    // that's never been processed before, or a newly-added task in an
    // existing one) has no row in the current data for a "something's
    // active" check to match against - see useArtifacts' identical fix for
    // the same underlying gap.
    refetchInterval: 10000,
  });
}

interface UpdateKanbanTaskStatusVariables {
  taskId: number;
  boardStatus: KanbanBoardStatus;
  /** Set when the card was dragged into a different phase's board, not just a different column within its own. */
  phase?: string;
  phaseOrder?: number;
}

export function useUpdateKanbanTaskStatus(projectId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['kanban-tasks', projectId];

  return useMutation<KanbanTask, Error, UpdateKanbanTaskStatusVariables, { previous?: KanbanTask[] }>({
    mutationFn: ({ taskId, boardStatus, phase, phaseOrder }) =>
      apiClient.updateKanbanTaskStatus(taskId, boardStatus, phase, phaseOrder),
    // Optimistic update so dragging a card feels instant rather than
    // waiting on a round trip before it visually moves - including a phase
    // change, or the card would sit in its old phase's board until the
    // mutation resolves and only then jump to the new one.
    onMutate: async ({ taskId, boardStatus, phase, phaseOrder }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<KanbanTask[]>(queryKey);
      queryClient.setQueryData<KanbanTask[]>(queryKey, (tasks) =>
        tasks?.map((task) =>
          task.id === taskId
            ? {
                ...task,
                board_status: boardStatus,
                ...(phase !== undefined ? { phase } : {}),
                ...(phaseOrder !== undefined ? { phase_order: phaseOrder } : {}),
              }
            : task
        )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
