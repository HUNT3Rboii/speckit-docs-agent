import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { KanbanBoardView } from './KanbanBoardView';
import * as useKanbanTasksModule from '../hooks/useKanbanTasks';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/projects/test-project-123/board']}>
    <Routes>
      <Route path="/projects/:projectId/board" element={children} />
    </Routes>
  </MemoryRouter>
);

describe('KanbanBoardView', () => {
  it('renders a Board heading and fetches tasks for the correct project', () => {
    const spy = vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useKanbanTasksModule, 'useUpdateKanbanTaskStatus').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(
      <TestWrapper>
        <KanbanBoardView />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith('test-project-123');
  });

  it('shows the board panel content once tasks load', () => {
    vi.spyOn(useKanbanTasksModule, 'useKanbanTasks').mockReturnValue({
      data: [
        {
          id: 1,
          project_id: 'test-project-123',
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
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.spyOn(useKanbanTasksModule, 'useUpdateKanbanTaskStatus').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any);

    render(
      <TestWrapper>
        <KanbanBoardView />
      </TestWrapper>
    );

    expect(screen.getByText('Set up project structure')).toBeInTheDocument();
  });
});
