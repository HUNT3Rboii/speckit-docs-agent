/**
 * Unit tests for ProjectDashboard page
 * Tests loading, error, empty, and success states with responsive grid
 * **Validates: Requirements 1.1, 1.4, 1.5, 5.1, 5.2, 5.3, 5.4, 7.1, 7.5, 8.1, 8.2, 8.3, 8.4**
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ProjectDashboard } from './ProjectDashboard';
import * as useProjectsModule from '../hooks/useProjects';
import type { Project } from '../types/api';

// Mock the useProjects hook
vi.mock('../hooks/useProjects');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('ProjectDashboard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    mockNavigate.mockClear();
    vi.clearAllMocks();
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {component}
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  describe('loading state', () => {
    it('displays loading skeleton components while fetching', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('Projects')).toBeInTheDocument();
      
      // Check for skeleton components (Skeleton has animate-pulse class)
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('disables interactive elements during loading', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      // No project cards should be rendered
      expect(screen.queryByRole('button', { name: /Open project/i })).not.toBeInTheDocument();
    });

    it('displays multiple skeleton placeholders for grid layout', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      const { container } = renderWithProviders(<ProjectDashboard />);

      // Should render 6 skeleton placeholders
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(6);
    });
  });

  describe('error state', () => {
    it('displays error message when API request fails', () => {
      const mockError = new Error('Backend server is not available');
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: mockError,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('Error Loading Projects')).toBeInTheDocument();
      expect(screen.getByText('Backend server is not available')).toBeInTheDocument();
    });

    it('displays retry button in error state', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const retryButton = screen.getByRole('button', { name: /Retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('calls refetch when retry button is clicked', () => {
      const mockRefetch = vi.fn();
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const retryButton = screen.getByRole('button', { name: /Retry/i });
      fireEvent.click(retryButton);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('displays generic error message for non-Error objects', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: 'String error' as any,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('displays empty state when no projects exist', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('No projects found')).toBeInTheDocument();
      expect(screen.getByText(/Create some markdown files/i)).toBeInTheDocument();
    });

    it('displays empty state when projects is undefined', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('No projects found')).toBeInTheDocument();
    });
  });

  describe('success state with project cards', () => {
    const mockProjects: Project[] = [
      { id: 'project-1', name: 'Project Alpha', repo_url: 'https://github.com/test/alpha' },
      { id: 'project-2', name: 'Project Beta', repo_url: 'https://github.com/test/beta' },
      { id: 'project-3', name: 'Project Gamma' },
    ];

    it('displays all projects as cards', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      expect(screen.getByText('Project Alpha')).toBeInTheDocument();
      expect(screen.getByText('Project Beta')).toBeInTheDocument();
      expect(screen.getByText('Project Gamma')).toBeInTheDocument();
    });

    it('navigates to project artifacts when card is clicked', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const projectCard = screen.getByRole('button', { name: /Open project Project Alpha/i });
      fireEvent.click(projectCard);

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/projects/project-1');
    });

    it('renders correct number of project cards', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: mockProjects,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const cards = screen.getAllByRole('button', { name: /Open project/i });
      expect(cards).toHaveLength(3);
    });
  });

  describe('responsive grid layout', () => {
    it('applies responsive grid classes for 1/2/3 columns', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: [
          { id: 'p1', name: 'Project 1' },
          { id: 'p2', name: 'Project 2' },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const { container } = renderWithProviders(<ProjectDashboard />);

      // Check for responsive grid classes
      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('grid-cols-1'); // Mobile: 1 column
      expect(grid).toHaveClass('md:grid-cols-2'); // Tablet: 2 columns
      expect(grid).toHaveClass('lg:grid-cols-3'); // Desktop: 3 columns
    });

    it('applies appropriate gap spacing', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: [{ id: 'p1', name: 'Project 1' }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      const { container } = renderWithProviders(<ProjectDashboard />);

      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('gap-6');
    });
  });

  describe('page title', () => {
    it('displays "Projects" heading', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const heading = screen.getByRole('heading', { name: 'Projects', level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('displays heading in all states', () => {
      const states = [
        { data: [], isLoading: false, error: null },
        { data: undefined, isLoading: true, error: null },
        { data: [{ id: 'p1', name: 'Project 1' }], isLoading: false, error: null },
      ];

      states.forEach((state) => {
        vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
          ...state,
          refetch: vi.fn(),
        } as any);

        const { unmount } = renderWithProviders(<ProjectDashboard />);
        
        expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
        
        unmount();
      });
    });
  });

  describe('shadcn/ui component usage', () => {
    it('uses Skeleton component for loading state', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any);

      const { container } = renderWithProviders(<ProjectDashboard />);

      // Skeleton components have animate-pulse class
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('uses Button component for retry action', () => {
      vi.spyOn(useProjectsModule, 'useProjects').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Test error'),
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<ProjectDashboard />);

      const button = screen.getByRole('button', { name: /Retry/i });
      expect(button).toBeInTheDocument();
    });
  });
});
