import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Breadcrumb from './Breadcrumb';
import userEvent from '@testing-library/user-event';

/**
 * Unit tests for Breadcrumb component
 * Tests breadcrumb rendering and navigation with React Router
 * **Validates: Requirements 6.3, 7.5**
 */
describe('Breadcrumb', () => {
  // Helper to render Breadcrumb with proper routing context
  const renderWithRouter = (initialRoute: string) => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/" element={<Breadcrumb />} />
          <Route path="/projects/:projectId" element={<Breadcrumb />} />
          <Route path="/projects/:projectId/artifacts/:artifactId" element={<Breadcrumb />} />
          <Route path="/projects/:projectId/artifacts/:artifactId/versions/:versionId" element={<Breadcrumb />} />
          <Route path="*" element={<Breadcrumb />} />
        </Routes>
      </MemoryRouter>
    );
  };
  describe('home route', () => {
    it('renders Home breadcrumb at root path', () => {
      renderWithRouter('/');

      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('marks Home as current page at root path', () => {
      renderWithRouter('/');

      const homeElement = screen.getByText('Home').closest('span');
      expect(homeElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders Home icon', () => {
      const { container } = renderWithRouter('/');

      // The Home icon is an SVG with lucide-react classes
      const homeSvg = container.querySelector('svg.lucide-house');
      expect(homeSvg).toBeInTheDocument();
    });
  });

  describe('project route', () => {
    it('renders Project breadcrumb when on project page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      renderWithRouter(`/projects/${projectId}`);

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
    });

    it('truncates long project ID', () => {
      const projectId = '12345678-90ab-cdef-1234-567890abcdef';
      
      renderWithRouter(`/projects/${projectId}`);

      const projectText = screen.getByText(/Project 12345678\.\.\./);
      expect(projectText).toBeInTheDocument();
    });

    it('renders Home as link when on project page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      renderWithRouter(`/projects/${projectId}`);

      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('marks Project as current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      renderWithRouter(`/projects/${projectId}`);

      const projectElement = screen.getByText(/Project 12345678\.\.\./).closest('span');
      expect(projectElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders chevron separator between items', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      const { container } = renderWithRouter(`/projects/${projectId}`);

      // ChevronRight icon should be present
      const chevronSvg = container.querySelector('svg.lucide-chevron-right');
      expect(chevronSvg).toBeInTheDocument();
    });
  });

  describe('artifact route', () => {
    it('renders all breadcrumb levels for artifact page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/Artifact abcdef12\.\.\./)).toBeInTheDocument();
    });

    it('marks Artifact as current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const artifactElement = screen.getByText(/Artifact abcdef12\.\.\./).closest('span');
      expect(artifactElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders Project as link when on artifact page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const projectLink = screen.getByText(/Project 12345678\.\.\./).closest('a');
      expect(projectLink).toHaveAttribute('href', `/projects/${projectId}`);
    });
  });

  describe('version route', () => {
    it('renders all breadcrumb levels for version page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version01-2345-6789-0abc-def123456789';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText(/Project 12345678\.\.\./)).toBeInTheDocument();
      expect(screen.getByText(/Artifact abcdef12\.\.\./)).toBeInTheDocument();
      // Version ID is "version01-..." which becomes "version0..." after substring(0,8)
      expect(screen.getByText(/Version version0\.\.\./)).toBeInTheDocument();
    });

    it('marks Version as current page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version01-2345-6789-0abc-def123456789';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      // Version ID is "version01-..." which becomes "version0..." after substring(0,8)
      const versionElement = screen.getByText(/Version version0\.\.\./).closest('span');
      expect(versionElement).toHaveAttribute('aria-current', 'page');
    });

    it('renders Artifact as link when on version page', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version01-2345-6789-0abc-def123456789';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      const artifactLink = screen.getByText(/Artifact abcdef12\.\.\./).closest('a');
      expect(artifactLink).toHaveAttribute('href', `/projects/${projectId}/artifacts/${artifactId}`);
    });

    it('renders multiple chevron separators', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      const versionId = 'version01-2345-6789-0abc-def123456789';
      
      const { container } = renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}/versions/${versionId}`);

      // Should have 3 chevron icons (between 4 breadcrumb items)
      const chevronSvgs = container.querySelectorAll('svg.lucide-chevron-right');
      expect(chevronSvgs).toHaveLength(3);
    });
  });

  describe('navigation accessibility', () => {
    it('has nav element with Breadcrumb aria-label', () => {
      renderWithRouter('/');

      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toBeInTheDocument();
    });

    it('renders breadcrumb list with ordered list semantics', () => {
      const { container } = renderWithRouter('/');

      const ol = container.querySelector('ol');
      expect(ol).toBeInTheDocument();
    });

    it('chevron icons are hidden from screen readers', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      const { container } = renderWithRouter(`/projects/${projectId}`);

      const chevronSvg = container.querySelector('svg.lucide-chevron-right');
      expect(chevronSvg).toHaveAttribute('aria-hidden', 'true');
    });

    it('home icon is hidden from screen readers', () => {
      const { container } = renderWithRouter('/');

      const homeSvg = container.querySelector('svg.lucide-house');
      expect(homeSvg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('link styling and interaction', () => {
    it('applies hover styles to links', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      renderWithRouter(`/projects/${projectId}`);

      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toHaveClass('hover:text-foreground');
    });

    it('applies focus styles for keyboard navigation', () => {
      const projectId = '12345678-1234-1234-1234-123456789abc';
      
      renderWithRouter(`/projects/${projectId}`);

      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toHaveClass('focus:ring-2');
    });
  });

  describe('click navigation', () => {
    it('navigates when breadcrumb link is clicked', async () => {
      const user = userEvent.setup();
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toHaveAttribute('href', '/');
      
      // Verify link is clickable
      await user.click(homeLink!);
    });

    it('project link navigates to correct path', async () => {
      const user = userEvent.setup();
      const projectId = '12345678-1234-1234-1234-123456789abc';
      const artifactId = 'abcdef12-3456-7890-abcd-ef1234567890';
      
      renderWithRouter(`/projects/${projectId}/artifacts/${artifactId}`);

      const projectLink = screen.getByText(/Project 12345678\.\.\./).closest('a');
      expect(projectLink).toHaveAttribute('href', `/projects/${projectId}`);
      
      // Verify link is clickable
      await user.click(projectLink!);
    });
  });

  describe('edge cases', () => {
    it('handles very short IDs', () => {
      const projectId = '123';
      
      renderWithRouter(`/projects/${projectId}`);

      // Should not crash with short IDs
      expect(screen.getByText(/Project 123\.\.\./)).toBeInTheDocument();
    });

    it('renders correctly with no route params', () => {
      renderWithRouter('/unknown-route');

      // Should at least render Home
      expect(screen.getByText('Home')).toBeInTheDocument();
    });
  });
});
