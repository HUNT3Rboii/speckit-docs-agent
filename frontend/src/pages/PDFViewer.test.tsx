/**
 * Unit tests for PDFViewer's live-processing states: while an artifact is
 * still being generated (no version to display yet), the pane should show
 * a spinner and the current pipeline step instead of the plain
 * "Select a version" placeholder or a blank pane - the "the viewer doesn't
 * work" bug this session started from was exactly this kind of silent gap.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFViewer } from './PDFViewer';
import * as useArtifactStatusModule from '../hooks/useArtifactStatus';
import * as useVersionsModule from '../hooks/useVersions';
import type { Artifact, ArtifactStatusResponse } from '../types/api';

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
