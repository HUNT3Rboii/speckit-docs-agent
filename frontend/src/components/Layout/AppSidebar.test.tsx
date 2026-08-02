import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '../ui/sidebar';
import * as useProjectsModule from '../../hooks/useProjects';
import type { Project } from '../../types/api';

describe('AppSidebar', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

  it('shows Artifacts/Board sub-links only under the active project', () => {
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
    expect(boardLink).toHaveAttribute('href', '/projects/proj-1/board');
    expect(artifactsLink).toHaveAttribute('href', '/projects/proj-1');

    // Only one project is active, so only one set of sub-links renders.
    expect(screen.getAllByText('Board')).toHaveLength(1);
    expect(screen.getAllByText('Artifacts')).toHaveLength(1);
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
});
