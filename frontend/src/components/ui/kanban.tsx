/**
 * Trimmed-down port of shadcn's Kanban board primitives
 * (https://github.com/janhesters/shadcn-kanban-board), adapted for Vite +
 * Tailwind v3. Native HTML5 drag-and-drop, no external DnD library.
 *
 * Deliberately dropped versus the upstream template: inline card/column
 * editing, add/delete card/column, per-column color circles. This board's
 * cards are derived from tasks.md files (see useKanbanTasks) - the file is
 * the source of truth, not manual editing - so only column-to-column
 * dragging (to change board_status) and the accessibility layer are kept.
 */
import type { ComponentProps } from 'react';
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Skeleton } from './skeleton';
import { cn } from '../../lib/utils';

/* Accessibility */

type KanbanBoardDndMonitorEventHandler = {
  onDragStart?: (activeId: string) => void;
  onDragOver?: (activeId: string, overId?: string) => void;
  onDragEnd?: (activeId: string, overId?: string) => void;
  onDragCancel?: (activeId: string) => void;
};

type KanbanBoardDndEventType = keyof KanbanBoardDndMonitorEventHandler;

type KanbanBoardDndMonitorContextValue = {
  draggableDescribedById: string;
  registerMonitor: (monitor: KanbanBoardDndMonitorEventHandler) => void;
  unregisterMonitor: (monitor: KanbanBoardDndMonitorEventHandler) => void;
  triggerEvent: (eventType: KanbanBoardDndEventType, activeId: string, overId?: string) => void;
};

const KanbanBoardContext = createContext<KanbanBoardDndMonitorContextValue | undefined>(undefined);

function useDndEvents() {
  const context = useContext(KanbanBoardContext);
  if (!context) {
    throw new Error('useDndEvents must be used within a KanbanBoardProvider');
  }
  const { draggableDescribedById, triggerEvent } = context;

  const onDragStart = useCallback((activeId: string) => triggerEvent('onDragStart', activeId), [triggerEvent]);
  const onDragOver = useCallback(
    (activeId: string, overId?: string) => triggerEvent('onDragOver', activeId, overId),
    [triggerEvent]
  );
  const onDragEnd = useCallback(
    (activeId: string, overId?: string) => triggerEvent('onDragEnd', activeId, overId),
    [triggerEvent]
  );
  const onDragCancel = useCallback((activeId: string) => triggerEvent('onDragCancel', activeId), [triggerEvent]);

  return { draggableDescribedById, onDragStart, onDragOver, onDragEnd, onDragCancel };
}

const defaultAnnouncements = {
  onDragStart: (activeId: string) => `Picked up card ${activeId}.`,
  onDragOver: (activeId: string, overId?: string) =>
    overId ? `Card ${activeId} was moved over ${overId}.` : `Card ${activeId} is no longer over a droppable area.`,
  onDragEnd: (activeId: string, overId?: string) =>
    overId ? `Card ${activeId} was dropped over ${overId}.` : `Card ${activeId} was dropped.`,
  onDragCancel: (activeId: string) => `Dragging was cancelled. Card ${activeId} was dropped.`,
};

function KanbanBoardLiveRegion({ announcement, id }: { announcement: string; id: string }) {
  return (
    <div
      aria-live="assertive"
      aria-atomic
      className="fixed left-0 top-0 -m-px h-px w-px overflow-hidden border-0 p-0 [clip:rect(0_0_0_0)]"
      id={id}
      role="status"
    >
      {announcement}
    </div>
  );
}

function useAnnouncement() {
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((value: string | undefined) => {
    if (value !== undefined) setAnnouncement(value);
  }, []);
  return { announce, announcement } as const;
}

function KanbanBoardProvider({ children }: { children: React.ReactNode }) {
  const draggableDescribedById = useId();
  const { announce, announcement } = useAnnouncement();
  // The provider owns monitorsRef, so it registers its own default
  // screen-reader announcements directly here rather than through a
  // separate useDndMonitor hook (which would need the context this
  // component IS the provider for - a chicken-and-egg problem for a
  // monitor that wants to live inside the provider itself).
  const monitorsRef = useRef<KanbanBoardDndMonitorEventHandler[]>([
    {
      onDragStart: (activeId) => announce(defaultAnnouncements.onDragStart(activeId)),
      onDragOver: (activeId, overId) => announce(defaultAnnouncements.onDragOver(activeId, overId)),
      onDragEnd: (activeId, overId) => announce(defaultAnnouncements.onDragEnd(activeId, overId)),
      onDragCancel: (activeId) => announce(defaultAnnouncements.onDragCancel(activeId)),
    },
  ]);
  const liveRegionId = useId();

  const registerMonitor = useCallback((monitor: KanbanBoardDndMonitorEventHandler) => {
    monitorsRef.current.push(monitor);
  }, []);
  const unregisterMonitor = useCallback((monitor: KanbanBoardDndMonitorEventHandler) => {
    monitorsRef.current = monitorsRef.current.filter((m) => m !== monitor);
  }, []);
  const triggerEvent = useCallback((eventType: KanbanBoardDndEventType, activeId: string, overId?: string) => {
    for (const monitor of monitorsRef.current) {
      monitor[eventType]?.(activeId, overId);
    }
  }, []);

  const contextValue = useMemo(
    () => ({ draggableDescribedById, registerMonitor, unregisterMonitor, triggerEvent }),
    [draggableDescribedById, registerMonitor, unregisterMonitor, triggerEvent]
  );

  return (
    <KanbanBoardContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <>
          <div id={draggableDescribedById} className="hidden">
            To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item.
            Press space again to drop the item in its new position, or press escape to cancel.
          </div>
          <KanbanBoardLiveRegion id={liveRegionId} announcement={announcement} />
        </>,
        document.body
      )}
    </KanbanBoardContext.Provider>
  );
}

/* Board */

function KanbanBoard({ className, ref, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-full flex-grow items-start gap-3 overflow-x-auto py-1', className)}
      ref={ref}
      {...props}
    />
  );
}

/* Column */

const DATA_TRANSFER_TYPE = 'kanban-board-card';

type KanbanBoardColumnProps = {
  columnId: string;
  onDropOverColumn?: (dataTransferData: string) => void;
};

const kanbanBoardColumnClassNames =
  'w-72 flex-shrink-0 rounded-lg border flex flex-col border-border bg-muted/40 py-2 max-h-full';

function KanbanBoardColumn({
  className,
  columnId,
  onDropOverColumn,
  ref,
  ...props
}: ComponentProps<'section'> & KanbanBoardColumnProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const { onDragEnd, onDragOver } = useDndEvents();

  return (
    <section
      aria-labelledby={`column-${columnId}-title`}
      className={cn(kanbanBoardColumnClassNames, isDropTarget && 'border-primary', className)}
      onDragLeave={() => setIsDropTarget(false)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DATA_TRANSFER_TYPE)) {
          event.preventDefault();
          setIsDropTarget(true);
          onDragOver('', columnId);
        }
      }}
      onDrop={(event) => {
        const data = event.dataTransfer.getData(DATA_TRANSFER_TYPE);
        if (!data) return;
        onDropOverColumn?.(data);
        onDragEnd((JSON.parse(data) as { id: string }).id, columnId);
        setIsDropTarget(false);
      }}
      ref={ref}
      {...props}
    />
  );
}

function KanbanBoardColumnSkeleton() {
  return (
    <section className={cn(kanbanBoardColumnClassNames, 'h-full py-0')}>
      <Skeleton className="h-full w-full" />
    </section>
  );
}

function KanbanBoardColumnHeader({ className, ref, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center justify-between px-3 py-1', className)} ref={ref} {...props} />;
}

function KanbanBoardColumnTitle({
  className,
  columnId,
  ref,
  ...props
}: ComponentProps<'h2'> & { columnId: string }) {
  return (
    // eslint-disable-next-line jsx-a11y/heading-has-content -- content is always supplied via {...props}/children by callers
    <h2
      className={cn('inline-flex items-center gap-2 text-sm font-medium text-muted-foreground', className)}
      id={`column-${columnId}-title`}
      ref={ref}
      {...props}
    />
  );
}

function KanbanBoardColumnList({ className, ref, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('min-h-2 flex-grow space-y-2 overflow-y-auto px-2', className)} ref={ref} {...props} />;
}

type KanbanBoardDropDirection = 'none' | 'top' | 'bottom';

type KanbanBoardColumnListItemProps = {
  cardId: string;
  onDropOverListItem?: (dataTransferData: string, dropDirection: KanbanBoardDropDirection) => void;
};

function KanbanBoardColumnListItem({
  cardId,
  className,
  onDropOverListItem,
  ref,
  ...props
}: ComponentProps<'li'> & KanbanBoardColumnListItemProps) {
  const [dropDirection, setDropDirection] = useState<KanbanBoardDropDirection>('none');
  const { onDragOver, onDragEnd } = useDndEvents();

  return (
    <li
      className={cn(
        '-my-px border-y-2 border-transparent',
        dropDirection === 'top' && 'border-t-primary',
        dropDirection === 'bottom' && 'border-b-primary',
        className
      )}
      onDragLeave={() => setDropDirection('none')}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DATA_TRANSFER_TYPE)) {
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          const midpoint = (rect.top + rect.bottom) / 2;
          setDropDirection(event.clientY <= midpoint ? 'top' : 'bottom');
          onDragOver('', cardId);
        }
      }}
      onDrop={(event) => {
        event.stopPropagation();
        const data = event.dataTransfer.getData(DATA_TRANSFER_TYPE);
        if (!data) return;
        onDropOverListItem?.(data, dropDirection);
        onDragEnd((JSON.parse(data) as { id: string }).id, cardId);
        setDropDirection('none');
      }}
      ref={ref}
      {...props}
    />
  );
}

/* Card */

type KanbanBoardCardProps<T extends { id: string } = { id: string }> = {
  data: T;
  isActive?: boolean;
};

const kanbanBoardCardClassNames =
  'rounded-lg border border-border bg-background p-3 text-start text-foreground shadow-sm';

function KanbanBoardCard({
  className,
  data,
  isActive = false,
  ref,
  ...props
}: ComponentProps<'div'> & KanbanBoardCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { draggableDescribedById, onDragStart } = useDndEvents();

  return (
    <div
      aria-describedby={draggableDescribedById}
      aria-roledescription="draggable"
      className={cn(
        kanbanBoardCardClassNames,
        'flex w-full cursor-grab touch-manipulation flex-col gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isDragging ? 'cursor-grabbing' : '',
        isActive && 'rotate-1 shadow-lg',
        className
      )}
      draggable
      onDragStart={(event) => {
        setIsDragging(true);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(DATA_TRANSFER_TYPE, JSON.stringify(data));
        onDragStart(data.id);
      }}
      onDragEnd={() => setIsDragging(false)}
      ref={ref}
      role="button"
      tabIndex={0}
      {...props}
    />
  );
}

function KanbanBoardCardDescription({ className, ref, ...props }: ComponentProps<'p'>) {
  return (
    <p className={cn('whitespace-pre-wrap text-xs leading-5 text-muted-foreground', className)} ref={ref} {...props} />
  );
}

export {
  useDndEvents,
  KanbanBoardProvider,
  KanbanBoard,
  KanbanBoardColumn,
  KanbanBoardColumnSkeleton,
  KanbanBoardColumnHeader,
  KanbanBoardColumnTitle,
  KanbanBoardColumnList,
  KanbanBoardColumnListItem,
  KanbanBoardCard,
  KanbanBoardCardDescription,
};
export type { KanbanBoardColumnProps, KanbanBoardColumnListItemProps, KanbanBoardDropDirection, KanbanBoardCardProps };
