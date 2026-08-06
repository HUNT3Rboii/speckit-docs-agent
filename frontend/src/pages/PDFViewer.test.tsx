/**
 * Unit tests for PDFViewer's live-processing states: while an artifact is
 * still being generated (no version to display yet), the pane should show
 * a spinner and the current pipeline step instead of the plain
 * "Select a version" placeholder or a blank pane - the "the viewer doesn't
 * work" bug this session started from was exactly this kind of silent gap.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFViewer } from './PDFViewer';
import * as useArtifactStatusModule from '../hooks/useArtifactStatus';
import * as useVersionsModule from '../hooks/useVersions';
import * as useExceptionsModule from '../hooks/useExceptions';
import * as useArtifactsModule from '../hooks/useArtifacts';
import type { Artifact, ArtifactStatusResponse } from '../types/api';

/** useRetryArtifact uses react-query internals (useMutation/useQueryClient)
 * that need a QueryClientProvider this test tree doesn't set up - like
 * useAddException below, it must always be mocked, never left to run for
 * real. */
function mockRetryArtifact(overrides?: Partial<ReturnType<typeof useArtifactsModule.useRetryArtifact>>) {
  vi.spyOn(useArtifactsModule, 'useRetryArtifact').mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    ...overrides,
  } as any);
}

function makeArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: 'artifact-1',
    project_id: 'proj-1',
    source_path: 'specs/demo/spec.md',
    artifact_type: 'spec',
    status: 'rendered',
    content_hash: 'abc',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockStatus(artifact: Artifact) {
  const response: ArtifactStatusResponse = {
    artifact,
    latest_version: null,
    version_count: 0,
    dropped_items: {},
    validation_warnings: [],
    cache_hit: false,
  };
  vi.spyOn(useArtifactStatusModule, 'useArtifactStatus').mockReturnValue({
    data: response,
    isLoading: false,
    error: null,
  } as any);
}

function renderAtArtifact(artifactId = 'artifact-1') {
  return render(
    <MemoryRouter initialEntries={[`/projects/proj-1/artifacts/${artifactId}`]}>
      <Routes>
        <Route path="/projects/:projectId/artifacts/:artifactId" element={<PDFViewer />} />
        <Route path="/projects/:projectId" element={<div>Artifact list placeholder</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PDFViewer live processing states', () => {
  beforeEach(() => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as any);
    mockRetryArtifact();
  });

  it('shows a spinner and the current step while the artifact is processing', () => {
    mockStatus(makeArtifact({ status: 'processing', metadata: { current_step: 'rendering_diagrams' } }));

    renderAtArtifact();

    expect(screen.getByText('Rendering diagrams')).toBeInTheDocument();
    expect(screen.queryByText('Select a version to view PDF')).not.toBeInTheDocument();
  });

  it('shows a static "needs correction" message (not a spinner) for retry_needed status', () => {
    mockStatus(
      makeArtifact({
        status: 'retry_needed',
        metadata: {
          current_step: 'awaiting_retry',
          structured_error: {
            valid: false,
            retry_count: 1,
            errors: { ungrounded_diagrams: ['Diagram evidence ungrounded for component X'] },
            warnings: [],
          },
        },
      })
    );

    renderAtArtifact();

    expect(
      screen.getByText('Needs correction: Diagram evidence ungrounded for component X')
    ).toBeInTheDocument();
  });

  it('shows the already-rendered PDF instead of the stalled message when a version exists', () => {
    // Regression: an artifact can be status="retry_needed" (a later
    // re-submission needs correction) while still having a perfectly good
    // PDF from an earlier successful run - that existing version must stay
    // reachable rather than being hidden behind the "needs correction" pane.
    mockStatus(makeArtifact({ status: 'retry_needed', metadata: { current_step: 'awaiting_retry' } }));
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [
        {
          id: 'version-1',
          artifact_id: 'artifact-1',
          version_no: 1,
          pdf_path: '/tmp/doc-output/artifact-1-v1.pdf',
          structured_json: {},
          generated_by: 'agentic-pipeline',
          generated_at: new Date().toISOString(),
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    renderAtArtifact();

    expect(screen.queryByText(/Needs correction/)).not.toBeInTheDocument();
  });

  it('shows a failed message with the error when the pipeline crashed', () => {
    mockStatus(makeArtifact({ status: 'failed', metadata: { error: 'PDF generation crashed' } }));

    renderAtArtifact();

    expect(screen.getByText('Failed: PDF generation crashed')).toBeInTheDocument();
  });

  it('falls back to "Select a version" when the artifact is done but nothing is selected yet', () => {
    mockStatus(makeArtifact({ status: 'rendered' }));

    renderAtArtifact();

    expect(screen.getByText('Select a version to view PDF')).toBeInTheDocument();
  });
});

describe('PDFViewer exclude-from-processing button', () => {
  beforeEach(() => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    mockRetryArtifact();
  });

  it('adds the artifact source_path as an exception, then navigates back to the artifact list', async () => {
    // Excluding deletes the artifact server-side (see backend's
    // add_exception route), so staying on this page would start erroring
    // once the status poll refetches a now-gone artifact.
    const user = userEvent.setup();
    const mutate = vi.fn((_path: string, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as any);
    mockStatus(makeArtifact({ status: 'rendered', source_path: 'docs/onepager.md', project_id: 'proj-1' }));

    renderAtArtifact();

    await user.click(screen.getByRole('button', { name: /Exclude from Processing/ }));

    expect(mutate).toHaveBeenCalledWith('docs/onepager.md', expect.anything());
    expect(await screen.findByText('Artifact list placeholder')).toBeInTheDocument();
  });

  it('is disabled while the artifact status has not loaded yet', () => {
    vi.spyOn(useArtifactStatusModule, 'useArtifactStatus').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as any);

    renderAtArtifact();

    expect(screen.getByRole('button', { name: /Exclude from Processing/ })).toBeDisabled();
  });
});

describe('PDFViewer retry button', () => {
  beforeEach(() => {
    vi.spyOn(useVersionsModule, 'useVersions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as any);
  });

  it('calls retryArtifact.mutate with the artifact id when clicked', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockRetryArtifact({ mutate });
    mockStatus(makeArtifact({ id: 'artifact-1', status: 'rendered' }));

    renderAtArtifact();

    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(mutate).toHaveBeenCalledWith('artifact-1');
  });

  it('is disabled while the artifact is actively processing (a retry is already redundant)', () => {
    mockRetryArtifact();
    mockStatus(makeArtifact({ status: 'processing', metadata: { current_step: 'validating' } }));

    renderAtArtifact();

    expect(screen.getByRole('button', { name: /Retry/ })).toBeDisabled();
  });

  it('is disabled while the artifact status has not loaded yet', () => {
    mockRetryArtifact();
    vi.spyOn(useArtifactStatusModule, 'useArtifactStatus').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    renderAtArtifact();

    expect(screen.getByRole('button', { name: /Retry/ })).toBeDisabled();
  });

  it('is enabled once rendered (a completed run can still be retried)', () => {
    mockRetryArtifact();
    mockStatus(makeArtifact({ status: 'rendered' }));

    renderAtArtifact();

    expect(screen.getByRole('button', { name: /Retry/ })).toBeEnabled();
  });

  it('shows a "Retrying…" label and disables the button while the mutation is pending', () => {
    mockRetryArtifact({ isPending: true });
    mockStatus(makeArtifact({ status: 'rendered' }));

    renderAtArtifact();

    const button = screen.getByRole('button', { name: /Retrying/ });
    expect(button).toBeDisabled();
  });
});
