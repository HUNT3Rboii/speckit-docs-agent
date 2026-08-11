import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './Layout';
import * as useProjectsModule from '../../hooks/useProjects';
import * as useArtifactsModule from '../../hooks/useArtifacts';
import type { Project } from '../../types/api';

/**
 * Unit tests for Layout component.
 * Layout is rendered as a parent route (see App.tsx) so its Outlet's matched
 * child route's params (:projectId etc.) are visible to components Layout
 * renders internally, like the header's Breadcrumb - it is NOT a
 * children-taking wrapper placed around <Routes>, which does not give
 * useParams() access to the child route's params at all. Tests render it
 * the same way: as the element of a parent <Route>, with a child <Route>
 * providing the content and route params.
 */
describe('Layout', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    vi.spyOn(useArtifactsModule, 'useArtifacts').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any);
  });

  const renderWithProviders = (
    childElement: React.ReactElement,
    { initialRoute = '/test', childPath = '/test' }: { initialRoute?: string; childPath?: string } = {}
  ) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path={childPath} element={childElement} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('sidebar and header', () => {
    it('renders the app name in the sidebar', () => {
      renderWithProviders(<div>Test content</div>);

      expect(screen.getByText('PDF Docs')).toBeInTheDocument();
    });

    it('renders a sidebar toggle button (header trigger + rail)', () => {
      renderWithProviders(<div>Test content</div>);

      // The header's SidebarTrigger and the always-present SidebarRail both
      // expose a "Toggle Sidebar" accessible name.
      expect(screen.getAllByRole('button', { name: /toggle sidebar/i }).length).toBeGreaterThan(0);
    });

    it('renders the theme toggle button', () => {
      renderWithProviders(<div>Test content</div>);

      expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeInTheDocument();
    });
  });

  describe('routed content rendering (via Outlet)', () => {
    it('renders the matched child route element in the main content area', () => {
      renderWithProviders(<div data-testid="child-content">Child Component</div>);

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Child Component')).toBeInTheDocument();
    });

    it('renders a single main landmark (SidebarInset)', () => {
      renderWithProviders(<div>Test content</div>);

      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('renders the skip-link target with id="main-content"', () => {
      const { container } = renderWithProviders(<div>Test content</div>);

      expect(container.querySelector('#main-content')).toBeInTheDocument();
    });
  });

  describe('accessibility features', () => {
    it('provides skip to main content link', () => {
      renderWithProviders(<div>Test content</div>);

      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('has skip link with screen reader only class initially', () => {
      renderWithProviders(<div>Test content</div>);

      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toHaveClass('sr-only');
    });
  });

  describe('breadcrumb integration', () => {
    it('renders the breadcrumb navigation area', () => {
      renderWithProviders(<div>Test content</div>);

      const breadcrumbNav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(breadcrumbNav).toBeInTheDocument();
      // "Projects" also appears as the sidebar's group label, so scope this
      // assertion to the breadcrumb nav specifically.
      expect(within(breadcrumbNav).getByText('Projects')).toBeInTheDocument();
    });

    it('resolves the actual route params (regression: Layout must be a parent route, not a children-wrapper, for useParams() to work in Breadcrumb)', () => {
      const projects: Project[] = [{ id: 'proj-1', name: 'Speckit Docs Agent' }];
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: projects,
        isLoading: false,
        error: null,
      } as any);

      renderWithProviders(<div>Artifact list content</div>, {
        initialRoute: '/projects/proj-1',
        childPath: '/projects/:projectId',
      });

      const breadcrumbNav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(within(breadcrumbNav).getByText('Speckit Docs Agent')).toBeInTheDocument();
    });
  });
});
