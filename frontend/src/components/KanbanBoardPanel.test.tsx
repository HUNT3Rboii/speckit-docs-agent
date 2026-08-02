/**
 * Unit tests for KanbanBoardPanel: renders a project's tasks (parsed from
 * tasks.md-classified artifacts) as one aggregated board, split into
 * swimlanes per source file, with drag-and-drop between To Do / In
 * Progress / Done columns updating board_status.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KanbanBoardPanel } from './KanbanBoardPanel';
import * as useKanbanTasksModule from '../hooks/useKanbanTasks';
import type { KanbanTask } from '../types/api';

function makeTask(overrides?: Partial<KanbanTask>): KanbanTask {
  return {
    id: 1,
    project_id: 'proj-1',
    artifact_id: 'artifact-1',
    source_path: 'specs/001-demo/tasks.md',
    task_key: 'T001',
    phase: 'Phase 1: Setup',
    phase_order: 0,
    parallel: false,
    story: null,
    description: 'Set up project structure',
    checkbox_done: false,
    board_status: 'todo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Minimal fake DataTransfer: real drag-and-drop shares one instance across
// dragstart/dragover/drop, so setData during dragstart must be visible to
// the types check and getData call the column handlers make later.
function createDataTransfer() {
  const store: Record<string, string> = {};
  const dataTransfer = {
    effectAllowed: '',
    types: [] as string[],
    setData: (type: string, value: string) => {
      store[type] = value;
      if (!dataTransfer.types.includes(type)) dataTransfer.types.push(type);
    },
    getData: (type: string) => store[type] ?? '',
  };
  return dataTransfer as unknown as DataTransfer;
}

describe('KanbanBoardPanel', () => {
  const updateMutate = vi.fn();

  beforeEach(() => {
    updateMutate.mockReset();
    vi.spyOn(useKanbanTasksModule, 'useUpdateKanbanTaskStatus').mockReturnValue({
      mutate: updateMutate,
      isPending: false,
    } as any);
  });

  it('shows a loading state while fetching', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error message with a working retry button when the fetch fails', () => {
    const refetch = vi.fn();
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch,
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    expect(screen.getByText(/Error Loading Board/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when there are no tasks yet', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument();
  });

  it('fetches tasks for the correct project and groups them into swimlanes per source file', () => {
    const spy = vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, source_path: 'specs/001-demo/tasks.md', task_key: 'T001', board_status: 'todo' }),
        makeTask({
          id: 2,
          source_path: 'specs/001-demo/tasks.md',
          task_key: 'T002',
          board_status: 'done',
          description: 'Second task',
        }),
        makeTask({
          id: 3,
          source_path: 'specs/002-other/tasks.md',
          task_key: 'T001',
          board_status: 'in_progress',
          description: 'Other feature task',
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    expect(spy).toHaveBeenCalledWith('proj-1');
    expect(screen.getByText('001-demo')).toBeInTheDocument();
    expect(screen.getByText('002-other')).toBeInTheDocument();
    expect(screen.getByText('Set up project structure')).toBeInTheDocument();
    expect(screen.getByText('Second task')).toBeInTheDocument();
    expect(screen.getByText('Other feature task')).toBeInTheDocument();
  });

  it('splits a swimlane into a separate board per phase, ordered by phase_order', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, phase: 'Phase 3: User Story 1', phase_order: 1, description: 'Later phase task' }),
        makeTask({ id: 2, phase: 'Phase 1: Setup', phase_order: 0, description: 'Earlier phase task' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    expect(screen.getByText('Phase 1: Setup')).toBeInTheDocument();
    expect(screen.getByText('Phase 3: User Story 1')).toBeInTheDocument();

    const headings = screen.getAllByText(/^Phase \d/).map((el) => el.textContent);
    expect(headings).toEqual(['Phase 1: Setup', 'Phase 3: User Story 1']);
  });

  it('supports drag-and-drop within a specific phase when a swimlane has multiple phases', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, phase: 'Phase 1: Setup', phase_order: 0, board_status: 'todo', description: 'Phase one task' }),
        makeTask({ id: 2, phase: 'Phase 3: User Story 1', phase_order: 1, board_status: 'todo', description: 'Phase two task' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    const card = screen.getByText('Phase two task').closest('[role="button"]') as HTMLElement;
    const sections = container.querySelectorAll('section');
    // Phase 1: Setup -> sections[0..2] (To Do/In Progress/Done),
    // Phase 3: User Story 1 -> sections[3..5].
    const phaseTwoInProgressColumn = sections[4];

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(phaseTwoInProgressColumn, { dataTransfer });
    fireEvent.drop(phaseTwoInProgressColumn, { dataTransfer });

    expect(updateMutate).toHaveBeenCalledWith({ taskId: 2, boardStatus: 'in_progress' });
  });

  it('moving a card into a different phase board updates both board_status and phase', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, phase: 'Phase 1: Setup', phase_order: 0, board_status: 'todo', description: 'Phase one task' }),
        makeTask({
          id: 2,
          phase: 'Phase 3: User Story 1',
          phase_order: 1,
          board_status: 'todo',
          task_key: 'T010',
          description: 'Phase two task',
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    const card = screen.getByText('Phase one task').closest('[role="button"]') as HTMLElement;
    const sections = container.querySelectorAll('section');
    // Phase 1: Setup -> sections[0..2] (To Do/In Progress/Done),
    // Phase 3: User Story 1 -> sections[3..5]. Drop into Phase 3's Done column.
    const phaseTwoDoneColumn = sections[5];

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(phaseTwoDoneColumn, { dataTransfer });
    fireEvent.drop(phaseTwoDoneColumn, { dataTransfer });

    expect(updateMutate).toHaveBeenCalledWith({
      taskId: 1,
      boardStatus: 'done',
      phase: 'Phase 3: User Story 1',
      phaseOrder: 1,
    });
  });

  it('does not send a phase change when a card is dropped in its own phase board, even in a different column', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [makeTask({ id: 7, task_key: 'T007', board_status: 'todo', phase: 'Phase 1: Setup', description: 'Stay in phase' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    const card = screen.getByText('Stay in phase').closest('[role="button"]') as HTMLElement;
    const sections = container.querySelectorAll('section');
    const doneColumn = sections[2];

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(doneColumn, { dataTransfer });
    fireEvent.drop(doneColumn, { dataTransfer });

    expect(updateMutate).toHaveBeenCalledWith({ taskId: 7, boardStatus: 'done' });
  });

  it('collapses and expands a swimlane when its header is clicked, without affecting other swimlanes', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, source_path: 'specs/001-demo/tasks.md' }),
        makeTask({ id: 2, source_path: 'specs/002-other/tasks.md', task_key: 'T001' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    const swimlaneOneTrigger = screen.getByText('001-demo').closest('[role="button"]') as HTMLElement;
    const swimlaneTwoTrigger = screen.getByText('002-other').closest('[role="button"]') as HTMLElement;

    expect(swimlaneOneTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(swimlaneTwoTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(swimlaneOneTrigger);

    expect(swimlaneOneTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(swimlaneTwoTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(swimlaneOneTrigger);
    expect(swimlaneOneTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses and expands a single phase without affecting sibling phases in the same swimlane', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, phase: 'Phase 1: Setup', phase_order: 0 }),
        makeTask({ id: 2, phase: 'Phase 3: User Story 1', phase_order: 1, task_key: 'T010' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    const phaseOneTrigger = screen.getByText('Phase 1: Setup').closest('[role="button"]') as HTMLElement;
    const phaseTwoTrigger = screen.getByText('Phase 3: User Story 1').closest('[role="button"]') as HTMLElement;

    fireEvent.click(phaseOneTrigger);

    expect(phaseOneTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(phaseTwoTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a task count badge on swimlane and phase headers', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        makeTask({ id: 1, phase: 'Phase 1: Setup', phase_order: 0 }),
        makeTask({ id: 2, phase: 'Phase 1: Setup', phase_order: 0, task_key: 'T002' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    const swimlaneTrigger = screen.getByText('001-demo').closest('[role="button"]') as HTMLElement;
    const phaseTrigger = screen.getByText('Phase 1: Setup').closest('[role="button"]') as HTMLElement;
    expect(swimlaneTrigger).toHaveTextContent('2');
    expect(phaseTrigger).toHaveTextContent('2');
  });

  it('shows parallel and story tags on cards that have them', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [makeTask({ id: 1, parallel: true, story: 'US1' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(<KanbanBoardPanel projectId="proj-1" />);

    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('US1')).toBeInTheDocument();
  });

  it('moves a card to a new column via drag-and-drop, updating its board_status', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [makeTask({ id: 7, task_key: 'T007', board_status: 'todo', description: 'Drag me' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    const card = screen.getByText('Drag me').closest('[role="button"]') as HTMLElement;
    // Column order within a swimlane is fixed: To Do, In Progress, Done.
    const sections = container.querySelectorAll('section');
    const inProgressColumn = sections[1];

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(inProgressColumn, { dataTransfer });
    fireEvent.drop(inProgressColumn, { dataTransfer });

    expect(updateMutate).toHaveBeenCalledWith({ taskId: 7, boardStatus: 'in_progress' });
  });

  it('does not call the mutation when a card is dropped back on its own column', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [makeTask({ id: 7, task_key: 'T007', board_status: 'todo', description: 'Stay put' })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    const { container } = render(<KanbanBoardPanel projectId="proj-1" />);

    const card = screen.getByText('Stay put').closest('[role="button"]') as HTMLElement;
    const sections = container.querySelectorAll('section');
    const todoColumn = sections[0];

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(todoColumn, { dataTransfer });
    fireEvent.drop(todoColumn, { dataTransfer });

    expect(updateMutate).not.toHaveBeenCalled();
  });
});
