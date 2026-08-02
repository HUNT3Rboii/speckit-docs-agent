import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppHeader } from './AppHeader';
import { SidebarProvider } from '../ui/sidebar';
import * as useProjectsModule from '../../hooks/useProjects';
import * as useArtifactsModule from '../../hooks/useArtifacts';

describe('AppHeader', () => {
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

  const renderWithProviders = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SidebarProvider>
            <AppHeader />
          </SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders the sidebar trigger button', () => {
    renderWithProviders();

    expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
  });

  it('renders the breadcrumb', () => {
    renderWithProviders();

    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it('renders the theme toggle', () => {
    renderWithProviders();

    expect(screen.getByRole('button', { name: /switch to (dark|light) mode/i })).toBeInTheDocument();
  });
});
