import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '../ui/sidebar';
import * as useProjectsModule from '../../hooks/useProjects';
import * as useAutomationModeModule from '../../hooks/useAutomationMode';
import type { Project } from '../../types/api';

describe('AppSidebar', () => {
  let queryClient: QueryClient;
  const setAutomationModeMutate = vi.fn();

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setAutomationModeMutate.mockReset();
    vi.spyOn(useAutomationModeModule, 'useSetAutomationMode').mockReturnValue({
      mutate: setAutomationModeMutate,
      isPending: false,
    } as any);
  });

  const renderWithProviders = (initialRoute: string = '/') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <SidebarProvider>
            <Routes>
              <Route path="/" element={<AppSidebar />} />
              <Route path="/projects/:projectId" element={<AppSidebar />} />
              <Route path="/projects/:projectId/board" element={<AppSidebar />} />
              <Route path="/projects/:projectId/files" element={<AppSidebar />} />
            </Routes>
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders the app name linking to the root', () => {
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders();

    const homeLink = screen.getByText('PDF Docs').closest('a');
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('shows loading skeletons while projects are loading', () => {
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    const { container } = renderWithProviders();

    expect(container.querySelectorAll('[data-sidebar="menu-skeleton"]').length).toBeGreaterThan(0);
  });

  it('shows an empty-state message when there are no projects', () => {
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders();

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });

  it('lists each project as a link to its artifact list', () => {
    const projects: Project[] = [
      { id: 'proj-1', name: 'Speckit Docs Agent' },
      { id: 'proj-2', name: 'Another Project' },
    ];
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: projects,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders();

    const link1 = screen.getByText('Speckit Docs Agent').closest('a');
    const link2 = screen.getByText('Another Project').closest('a');
    expect(link1).toHaveAttribute('href', '/projects/proj-1');
    expect(link2).toHaveAttribute('href', '/projects/proj-2');
  });

  it('marks the current project as active', () => {
    const projects: Project[] = [
      { id: 'proj-1', name: 'Speckit Docs Agent' },
      { id: 'proj-2', name: 'Another Project' },
    ];
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: projects,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders('/projects/proj-1');

    const activeButton = screen.getByText('Speckit Docs Agent').closest('[data-sidebar="menu-button"]');
    const inactiveButton = screen.getByText('Another Project').closest('[data-sidebar="menu-button"]');
    expect(activeButton).toHaveAttribute('data-active', 'true');
    expect(inactiveButton).toHaveAttribute('data-active', 'false');
  });

  it('shows Artifacts/Board/Context Files sub-links only under the active project', () => {
    const projects: Project[] = [
      { id: 'proj-1', name: 'Speckit Docs Agent' },
      { id: 'proj-2', name: 'Another Project' },
    ];
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: projects,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders('/projects/proj-1');

    const boardLink = screen.getByText('Board').closest('a');
    const artifactsLink = screen.getByText('Artifacts').closest('a');
    const filesLink = screen.getByText('Context Files').closest('a');
    expect(boardLink).toHaveAttribute('href', '/projects/proj-1/board');
    expect(artifactsLink).toHaveAttribute('href', '/projects/proj-1');
    expect(filesLink).toHaveAttribute('href', '/projects/proj-1/files');

    // Only one project is active, so only one set of sub-links renders.
    expect(screen.getAllByText('Board')).toHaveLength(1);
    expect(screen.getAllByText('Artifacts')).toHaveLength(1);
    expect(screen.getAllByText('Context Files')).toHaveLength(1);
  });

  it('marks the Board sub-link active when viewing the board route', () => {
    const projects: Project[] = [{ id: 'proj-1', name: 'Speckit Docs Agent' }];
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: projects,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders('/projects/proj-1/board');

    const boardButton = screen.getByText('Board').closest('[data-sidebar="menu-sub-button"]');
    const artifactsButton = screen.getByText('Artifacts').closest('[data-sidebar="menu-sub-button"]');
    expect(boardButton).toHaveAttribute('data-active', 'true');
    expect(artifactsButton).toHaveAttribute('data-active', 'false');
  });

  it('marks the Context Files sub-link active when viewing that route', () => {
    const projects: Project[] = [{ id: 'proj-1', name: 'Speckit Docs Agent' }];
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: projects,
      isLoading: false,
      error: null,
    } as any);

    renderWithProviders('/projects/proj-1/files');

    const filesButton = screen.getByText('Context Files').closest('[data-sidebar="menu-sub-button"]');
    const artifactsButton = screen.getByText('Artifacts').closest('[data-sidebar="menu-sub-button"]');
    expect(filesButton).toHaveAttribute('data-active', 'true');
    expect(artifactsButton).toHaveAttribute('data-active', 'false');
  });

  describe('automatic transformation toggle', () => {
    const mockProjects = (projects: Project[]) => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: projects,
        isLoading: false,
        error: null,
      } as any);
    };

    it('is shown only under the active project, alongside its other sub-links', () => {
      mockProjects([
        { id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'automatic' },
        { id: 'proj-2', name: 'Another Project', automation_mode: 'automatic' },
      ]);

      renderWithProviders('/projects/proj-1');

      expect(screen.getAllByRole('switch')).toHaveLength(1);
      expect(
        screen.getByRole('switch', { name: 'Automatic transformation for Speckit Docs Agent' })
      ).toBeInTheDocument();
    });

    it('is not shown when no project is selected', () => {
      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'automatic' }]);

      renderWithProviders('/');

      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('reads on for an automatic project and off for a manual one', () => {
      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'manual' }]);
      const { unmount } = renderWithProviders('/projects/proj-1');
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
      unmount();

      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'automatic' }]);
      renderWithProviders('/projects/proj-1');
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('reads on for a project from a backend that predates the setting', () => {
      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent' }]);

      renderWithProviders('/projects/proj-1');

      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('switches the project to manual when turned off', async () => {
      const user = userEvent.setup();
      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'automatic' }]);

      renderWithProviders('/projects/proj-1');
      await user.click(screen.getByRole('switch'));

      expect(setAutomationModeMutate).toHaveBeenCalledWith('manual');
    });

    it('switches the project back to automatic when turned on', async () => {
      const user = userEvent.setup();
      mockProjects([{ id: 'proj-1', name: 'Speckit Docs Agent', automation_mode: 'manual' }]);

      renderWithProviders('/projects/proj-1');
      await user.click(screen.getByRole('switch'));

      expect(setAutomationModeMutate).toHaveBeenCalledWith('automatic');
    });
  });
});
