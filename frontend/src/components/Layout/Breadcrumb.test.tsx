import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import Breadcrumb from './Breadcrumb';
import * as useProjectsModule from '../../hooks/useProjects';
import * as useArtifactsModule from '../../hooks/useArtifacts';
import type { Project, Artifact } from '../../types/api';

/**
 * Unit tests for Breadcrumb component.
 * The component now looks up real project/artifact names via
 * useProjects/useArtifacts (falling back to a truncated ID while that data
 * hasn't loaded or doesn't match), so every render needs a QueryClientProvider.
 */
describe('Breadcrumb', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any);
    vi.spyOn(useArtifactsModule, 'useArtifacts').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any);
  });

  const renderWithRouter = (initialRoute: string) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/" element={<Breadcrumb />} />
            <Route path="/projects/:projectId" element={<Breadcrumb />} />
            <Route path="/projects/:projectId/artifacts/:artifactId" element={<Breadcrumb />} />
            <Route
              path="/projects/:projectId/artifacts/:artifactId/versions/:versionId"
              element={<Breadcrumb />}
            />
            <Route path="*" element={<Breadcrumb />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe('root route', () => {
    it('renders "Projects" as the current page at root path', () => {
      renderWithRouter('/');

      const projectsElement = screen.getByText('Projects');
      expect(projectsElement).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('project route (no matching project data yet)', () => {
    it('falls back to a truncated project ID', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';

      renderWithRouter(`/projects/${projectId}`);

      expect(screen.getByText('Projects')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
    });

    it('renders "Projects" as a link back to root', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';

      renderWithRouter(`/projects/${projectId}`);

      const rootLink = screen.getByText('Projects').closest('a');
      expect(rootLink).toHaveAttribute('href', '/');
    });

    it('marks the project as the current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';

      renderWithRouter(`/projects/${projectId}`);

      const projectElement = screen.getByText(/Project 12345678\.\.\./);
      expect(projectElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders a chevron separator between items', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';

      const { container } = renderWithRouter(`/projects/${projectId}`);

      expect(container.querySelector('svg.lucide-chevron-right')).toBeInTheDocument();
    });
  });

  describe('project route (with matching project data)', () => {
    it('shows the real project name instead of a truncated ID', () => {
      const projectId = 'proj-1';
      const projects: Project[] = [{ id: projectId, name: 'Speckit Docs Agent' }];
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: projects,
        isLoading: false,
        error: null,
      } as any);

      renderWithRouter(`/projects/${projectId}`);

      expect(screen.getByText('Speckit Docs Agent')).toBeInTheDocument();
      expect(screen.queryByText(/Project proj-1\.\.\./)).not.toBeInTheDocument();
    });
  });

  describe('artifact route', () => {
    it('renders all breadcrumb levels, falling back to truncated IDs', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      expect(screen.getByText('Projects')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/Artifact abcdef12\.\.\./)).toBeInTheDocument();
    });

    it('shows the real artifact title when available', () => {
      const projectId = 'proj-1';
      const artifactId = 'artifact-1';
      const artifacts: Artifact[] = [
        {
          id: artifactId,
          project_id: projectId,
          source_path: 'docs/spec.md',
          artifact_type: 'spec',
          status: 'completed',
          content_hash: 'abc',
          created_at: new Date().toISOString(),
          title: 'API Specification',
        },
      ];
      vi.spyOn(useArtifactsModule, 'useArtifacts').mockReturnValue({
        data: artifacts,
        isLoading: false,
        error: null,
      } as any);

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      expect(screen.getByText('API Specification')).toBeInTheDocument();
    });

    it('marks the artifact as the current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const artifactElement = screen.getByText(/Artifact abcdef12\.\.\./);
      expect(artifactElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders the project as a link when on the artifact page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const projectLink = screen.getByText(/Project 12345678\.\.\./).closest('a');
      expect(projectLink).toHaveAttribute('href', `/projects/${projectId}`);
    });
  });

  describe('version route', () => {
    it('renders all breadcrumb levels for the version page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version-1';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      expect(screen.getByText('Projects')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/Artifact abcdef12\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(`Version ${versionId}`)).toBeInTheDocument();
    });

    it('marks the version as the current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version-1';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      const versionElement = screen.getByText(`Version ${versionId}`);
      expect(versionElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders the artifact as a link when on the version page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version-1';

      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      const artifactLink = screen.getByText(/Artifact abcdef12\.\.\./).closest('a');
      expect(artifactLink).toHaveAttribute('href', `/projects/${projectId}/artifacts/${artifactId}`);
    });

    it('renders three chevron separators between the four breadcrumb items', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version-1';

      const { container } = renderWithRouter(
        `/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`
      );

      expect(container.querySelectorAll('svg.lucide-chevron-right')).toHaveLength(3);
    });
  });

  describe('accessibility', () => {
    it('has a nav element with an implicit breadcrumb label', () => {
      renderWithRouter('/');

      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toBeInTheDocument();
    });

    it('renders the breadcrumb list as an ordered list', () => {
      const { container } = renderWithRouter('/');

      expect(container.querySelector('ol')).toBeInTheDocument();
    });

    it('chevron separators are hidden from screen readers', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';

      const { container } = renderWithRouter(`/projects/${projectId}`);

      const chevronLi = container.querySelector('svg.lucide-chevron-right')!.closest('li');
      expect(chevronLi).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('click navigation', () => {
    it('root link is clickable', async () => {
      const user = userEvent.setup();
      const projectId = '12345678-1234-1234-1234-123456789abc';

      renderWithRouter(`/projects/${projectId}`);

      const rootLink = screen.getByText('Projects').closest('a');
      expect(rootLink).toHaveAttribute('href', '/');
      await user.click(rootLink!);
    });
  });

  describe('edge cases', () => {
    it('handles very short IDs without crashing', () => {
      renderWithRouter('/projects/123');

      expect(screen.getByText(/Project 123\.\.\./)).toBeInTheDocument();
    });

    it('renders correctly with no route params', () => {
      renderWithRouter('/unknown-route');

      expect(screen.getByText('Projects')).toBeInTheDocument();
    });
  });
});
