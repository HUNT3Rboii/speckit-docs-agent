/**
 * Unit tests for VersionList.
 * Includes regression coverage for a real bug: navigating to an artifact
 * with no version pre-selected (e.g. clicked from the artifact list, not a
 * direct /versions/:id link) left the PDF pane on "Select a version to view
 * PDF" indefinitely - nothing auto-selected a version, so the viewer looked
 * broken until the user noticed and clicked a version button here.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { VersionList } from './VersionList';
import * as useVersionsModule from '../hooks/useVersions';
import type { Version } from '../types/api';

function makeVersion(overrides?: Partial<Version>): Version {
  return {
    id: 'version-1',
    artifact_id: 'artifact-1',
    version_no: 1,
    pdf_path: '/tmp/doc-output/artifact-1-v1.pdf',
    structured_json: {},
    generated_by: 'agentic-pipeline',
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('VersionList', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const renderWithProviders = (props: {
    artifactId: string;
    currentVersionId: string;
    onVersionSelect: (id: string) => void;
  }) =>
    render(
      <QueryClientProvider client={queryClient}>
        <VersionList {...props} />
      </QueryClientProvider>
    );

  it('auto-selects the most recent version when none is selected yet', async () => {
    const older = makeVersion({
      id: 'v-old',
      version_no: 1,
      generated_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const newer = makeVersion({
      id: 'v-new',
      version_no: 2,
      generated_at: new Date().toISOString(),
    });
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [older, newer],
      isLoading: false,
      error: null,
    } as any);

    const onVersionSelect = vi.fn();
    renderWithProviders({ artifactId: 'artifact-1', currentVersionId: '', onVersionSelect });

    await waitFor(() => {
      expect(onVersionSelect).toHaveBeenCalledWith('v-new');
    });
    expect(onVersionSelect).toHaveBeenCalledTimes(1);
  });

  it('does not auto-select when a version is already selected', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [makeVersion({ id: 'v-1' }), makeVersion({ id: 'v-2', version_no: 2 })],
      isLoading: false,
      error: null,
    } as any);

    const onVersionSelect = vi.fn();
    renderWithProviders({ artifactId: 'artifact-1', currentVersionId: 'v-1', onVersionSelect });

    expect(onVersionSelect).not.toHaveBeenCalled();
  });

  it('does not auto-select when there are no versions', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    const onVersionSelect = vi.fn();
    renderWithProviders({ artifactId: 'artifact-1', currentVersionId: '', onVersionSelect });

    expect(onVersionSelect).not.toHaveBeenCalled();
  });

  it('calls onVersionSelect when a version button is clicked manually', async () => {
    const user = userEvent.setup();
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [makeVersion({ id: 'v-1' })],
      isLoading: false,
      error: null,
    } as any);

    const onVersionSelect = vi.fn();
    renderWithProviders({ artifactId: 'artifact-1', currentVersionId: 'v-1', onVersionSelect });

    await user.click(screen.getByText(/Version 1/));

    expect(onVersionSelect).toHaveBeenCalledWith('v-1');
  });

  it('shows loading skeletons while fetching', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    const { container } = renderWithProviders({
      artifactId: 'artifact-1',
      currentVersionId: '',
      onVersionSelect: vi.fn(),
    });

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error message when the fetch fails', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as any);

    renderWithProviders({ artifactId: 'artifact-1', currentVersionId: '', onVersionSelect: vi.fn() });

    expect(screen.getByText('Failed to load version history')).toBeInTheDocument();
  });

  it('shows a "processing, no versions yet" message when isProcessing and no versions exist', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <VersionList
          artifactId="artifact-1"
          currentVersionId=""
          onVersionSelect={vi.fn()}
          isProcessing
        />
      </QueryClientProvider>
    );

    expect(screen.getByText(/No versions yet/)).toBeInTheDocument();
  });

  it('renders nothing (not the processing message) when not processing and no versions exist', () => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <VersionList artifactId="artifact-1" currentVersionId="" onVersionSelect={vi.fn()} />
      </QueryClientProvider>
    );

    expect(container.textContent).toBe('');
  });
});
