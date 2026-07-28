import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Layout from './Layout';
import { BrowserRouter } from 'react-router-dom';

/**
 * Unit tests for Layout component
 * Tests that Layout renders children correctly with navigation structure
 * **Validates: Requirements 6.2**
 */
describe('Layout', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  describe('navigation header', () => {
    it('renders the application title', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      expect(screen.getByText('PDF Visualization')).toBeInTheDocument();
    });

    it('renders navigation with correct role and aria-label', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      expect(nav).toBeInTheDocument();
    });
  });

  describe('children rendering', () => {
    it('renders children in main content area', () => {
      renderWithRouter(
        <Layout>
          <div data-testid="child-content">Child Component</div>
        </Layout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Child Component')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      renderWithRouter(
        <Layout>
          <div>First child</div>
          <div>Second child</div>
          <div>Third child</div>
        </Layout>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
      expect(screen.getByText('Third child')).toBeInTheDocument();
    });

    it('renders main element with correct role and id', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
      expect(main).toHaveAttribute('id', 'main-content');
    });
  });

  describe('accessibility features', () => {
    it('provides skip to main content link', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });

    it('has skip link with screen reader only class initially', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      const skipLink = screen.getByText('Skip to main content');
      expect(skipLink).toHaveClass('sr-only');
    });
  });

  describe('layout structure', () => {
    it('renders breadcrumb navigation area', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      // Breadcrumb component is rendered, which has a nav with aria-label="Breadcrumb"
      const breadcrumbNav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(breadcrumbNav).toBeInTheDocument();
    });

    it('applies correct styling classes', () => {
      const { container } = renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      // Check that the root div has min-h-screen class
      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv).toHaveClass('min-h-screen', 'bg-background');
    });
  });

  describe('component integration', () => {
    it('renders Breadcrumb component', () => {
      renderWithRouter(
        <Layout>
          <div>Test content</div>
        </Layout>
      );

      // Breadcrumb should render Home link
      expect(screen.getByText('Home')).toBeInTheDocument();
    });

    it('renders all sections in correct order', () => {
      const { container } = renderWithRouter(
        <Layout>
          <div data-testid="test-content">Test content</div>
        </Layout>
      );

      // Get all major sections
      const skipLink = screen.getByText('Skip to main content');
      const nav = screen.getByRole('navigation', { name: /main navigation/i });
      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
      const main = screen.getByRole('main');

      // Verify order by comparing positions in the DOM
      const allElements = [skipLink, nav, breadcrumb, main];
      const positions = allElements.map(el => 
        Array.from(container.querySelectorAll('*')).indexOf(el as Element)
      );

      // Each element should appear after the previous one
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    });
  });
});
