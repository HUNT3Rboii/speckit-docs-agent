import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useKanbanTasks, useUpdateKanbanTaskStatus } from '../hooks/useKanbanTasks';
import {
  KanbanBoard,
  KanbanBoardCard,
  KanbanBoardCardDescription,
  KanbanBoardColumn,
  KanbanBoardColumnHeader,
  KanbanBoardColumnList,
  KanbanBoardColumnListItem,
  KanbanBoardColumnSkeleton,
  KanbanBoardColumnTitle,
  KanbanBoardProvider,
} from './ui/kanban';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import type { KanbanBoardStatus, KanbanTask } from '../types/api';

const COLUMNS: { status: KanbanBoardStatus; title: string }[] = [
  { status: 'todo', title: 'To Do' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
];

// specs/001-documentation-agent/tasks.md -> 001-documentation-agent
function featureNameFromPath(sourcePath: string): string {
  const parts = sourcePath.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : sourcePath;
}

interface KanbanBoardPanelProps {
  projectId: string;
}

export function KanbanBoardPanel({ projectId }: KanbanBoardPanelProps) {
  const { data: tasks, isLoading, error, refetch } = useKanbanTasks(projectId);
  const { mutate: updateStatus } = useUpdateKanbanTaskStatus(projectId);

  // Swimlanes and phases both start expanded (matching prior behavior);
  // collapsing is opt-in per-section rather than persisted, so a fresh load
  // always shows everything.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const toggleCollapsed = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Two grouping levels, matching the source file's own structure: swimlane
  // per tasks.md file, then a further split per "## Phase ..." heading
  // within that file - so the board's layout mirrors the document instead
  // of flattening every phase into one big column per file.
  const swimlanes = useMemo(() => {
    if (!tasks) return [];
    const bySourcePath = new Map<string, KanbanTask[]>();
    for (const task of tasks) {
      const existing = bySourcePath.get(task.source_path);
      if (existing) {
        existing.push(task);
      } else {
        bySourcePath.set(task.source_path, [task]);
      }
    }
    return Array.from(bySourcePath.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourcePath, swimlaneTasks]) => {
        const byPhase = new Map<string, { phaseOrder: number; tasks: KanbanTask[] }>();
        for (const task of swimlaneTasks) {
          const existing = byPhase.get(task.phase);
          if (existing) {
            existing.tasks.push(task);
          } else {
            byPhase.set(task.phase, { phaseOrder: task.phase_order, tasks: [task] });
          }
        }
        const phases = Array.from(byPhase.entries())
          .sort(([, a], [, b]) => a.phaseOrder - b.phaseOrder)
          .map(([phase, group]) => ({
            phase,
            phaseOrder: group.phaseOrder,
            tasks: [...group.tasks].sort((a, b) => a.task_key.localeCompare(b.task_key)),
          }));

        return {
          sourcePath,
          featureName: featureNameFromPath(sourcePath),
          phases,
        };
      });
  }, [tasks]);

  // A card can be dropped into any column of any phase's board, not just its
  // own - moving it into a different phase reassigns phase/phase_order too
  // (adopting the target board's phase identity), not just board_status,
  // otherwise the card would silently snap back to its original phase's
  // board on the next refetch even though it visually looked like it moved.
  // A card's source_path (and therefore which swimlane it renders in) is
  // always left untouched - only phase/status move, never the file it
  // belongs to.
  const handleDropOverColumn = (
    dataTransferData: string,
    status: KanbanBoardStatus,
    targetPhase: string,
    targetPhaseOrder: number
  ) => {
    const { id } = JSON.parse(dataTransferData) as { id: string };
    const taskId = Number(id);
    const task = tasks?.find((t) => t.id === taskId);
    if (!task) return;

    const phaseChanged = task.phase !== targetPhase;
    const statusChanged = task.board_status !== status;
    if (!phaseChanged && !statusChanged) return;

    updateStatus({
      taskId,
      boardStatus: status,
      ...(phaseChanged ? { phase: targetPhase, phaseOrder: targetPhaseOrder } : {}),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(2)].map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <div className="flex gap-3">
              <KanbanBoardColumnSkeleton />
              <KanbanBoardColumnSkeleton />
              <KanbanBoardColumnSkeleton />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-semibold text-destructive">Error Loading Board</h2>
          <p className="text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (swimlanes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
        <div className="max-w-md space-y-2">
          <h2 className="text-xl font-semibold text-muted-foreground">No tasks yet</h2>
          <p className="text-muted-foreground">
            Run /speckit.tasks to generate a tasks.md file, then process it to populate this board.
          </p>
        </div>
      </div>
    );
  }

  return (
    <KanbanBoardProvider>
      <div className="space-y-10">
        {swimlanes.map((swimlane) => {
          const swimlaneOpen = !collapsedKeys.has(swimlane.sourcePath);
          const swimlaneTaskCount = swimlane.phases.reduce((sum, phaseGroup) => sum + phaseGroup.tasks.length, 0);
          return (
            <Collapsible
              key={swimlane.sourcePath}
              open={swimlaneOpen}
              onOpenChange={() => toggleCollapsed(swimlane.sourcePath)}
              className="space-y-6"
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-baseline gap-2 cursor-pointer select-none" role="button" tabIndex={0}>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 self-center transition-transform', !swimlaneOpen && '-rotate-90')}
                  />
                  <h3 className="text-lg font-semibold">{swimlane.featureName}</h3>
                  <span className="text-xs text-muted-foreground">{swimlane.sourcePath}</span>
                  <Badge variant="secondary">{swimlaneTaskCount}</Badge>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6">
                {swimlane.phases.map((phaseGroup) => {
                  const phaseKey = `${swimlane.sourcePath}::${phaseGroup.phase}`;
                  const phaseOpen = !collapsedKeys.has(phaseKey);
                  return (
                    <Collapsible
                      key={phaseGroup.phase}
                      open={phaseOpen}
                      onOpenChange={() => toggleCollapsed(phaseKey)}
                      className="space-y-2 pl-4 border-l-2 border-border"
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center gap-2 cursor-pointer select-none" role="button" tabIndex={0}>
                          <ChevronDown
                            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', !phaseOpen && '-rotate-90')}
                          />
                          <h4 className="text-sm font-medium text-muted-foreground">{phaseGroup.phase}</h4>
                          <Badge variant="secondary" className="text-[10px]">
                            {phaseGroup.tasks.length}
                          </Badge>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <KanbanBoard>
                          {COLUMNS.map(({ status, title }) => {
                            const columnTasks = phaseGroup.tasks.filter((task) => task.board_status === status);
                            const columnId = `${swimlane.sourcePath}:${phaseGroup.phase}:${status}`;
                            return (
                              <KanbanBoardColumn
                                key={columnId}
                                columnId={columnId}
                                onDropOverColumn={(data) =>
                                  handleDropOverColumn(data, status, phaseGroup.phase, phaseGroup.phaseOrder)
                                }
                              >
                                <KanbanBoardColumnHeader>
                                  <KanbanBoardColumnTitle columnId={columnId}>
                                    {title}
                                    <Badge variant="secondary" className="ml-1">
                                      {columnTasks.length}
                                    </Badge>
                                  </KanbanBoardColumnTitle>
                                </KanbanBoardColumnHeader>
                                <KanbanBoardColumnList>
                                  {columnTasks.map((task) => (
                                    <KanbanBoardColumnListItem
                                      key={task.id}
                                      cardId={String(task.id)}
                                      onDropOverListItem={(data) =>
                                        handleDropOverColumn(data, status, phaseGroup.phase, phaseGroup.phaseOrder)
                                      }
                                    >
                                      <KanbanBoardCard data={{ id: String(task.id) }}>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-sm font-medium">{task.task_key}</span>
                                          <div className="flex gap-1">
                                            {task.parallel && (
                                              <Badge variant="outline" className="text-[10px]">
                                                P
                                              </Badge>
                                            )}
                                            {task.story && (
                                              <Badge variant="outline" className="text-[10px]">
                                                {task.story}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                        <KanbanBoardCardDescription>{task.description}</KanbanBoardCardDescription>
                                      </KanbanBoardCard>
                                    </KanbanBoardColumnListItem>
                                  ))}
                                </KanbanBoardColumnList>
                              </KanbanBoardColumn>
                            );
                          })}
                        </KanbanBoard>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </KanbanBoardProvider>
  );
}
