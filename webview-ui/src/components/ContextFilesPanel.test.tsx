/**
 * Unit tests for ContextFilesPanel: lists every markdown file in the
 * project's working tree - converted or not - and lets the user either
 * queue one for the pipeline or exclude it for good.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextFilesPanel } from './ContextFilesPanel';
import * as useProjectFilesModule from '../hooks/useProjectFiles';
import * as useExceptionsModule from '../hooks/useExceptions';
import type { ProjectFile } from '../types/api';

function makeFile(overrides?: Partial<ProjectFile>): ProjectFile {
  return {
    id: 1,
    project_id: 'proj-1',
    source_path: 'docs/notes.md',
    size_bytes: 2048,
    modified_at: '2024-03-15T10:30:00Z',
    transform_requested: false,
    requested_at: null,
    last_seen_at: '2024-03-15T10:30:00Z',
    is_excluded: false,
    artifact_id: null,
    artifact_status: null,
    ...overrides,
  };
}

function mockFiles(files: ProjectFile[], overrides?: Record<string, unknown>) {
  vi.spyOn(useProjectFilesModule, 'useProjectFiles').mockReturnValue({
    data: files,
    isLoading: false,
    error: null,
    ...overrides,
  } as any);
}

describe('ContextFilesPanel', () => {
  const transformMutate = vi.fn();
  const addExceptionMutate = vi.fn();

  beforeEach(() => {
    transformMutate.mockReset();
    addExceptionMutate.mockReset();

    vi.spyOn(useProjectFilesModule, 'useRequestFileTransform').mockReturnValue({
      mutate: transformMutate,
      isPending: false,
      isError: false,
      variables: undefined,
    } as any);
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: addExceptionMutate,
      isPending: false,
      isError: false,
      variables: undefined,
    } as any);
  });

  it('shows a loading state while fetching', () => {
    mockFiles([], { data: undefined, isLoading: true });

    const { container } = render(<ContextFilesPanel projectId="proj-1" />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error message when the fetch fails', () => {
    vi.spyOn(useProjectFilesModule, 'useProjectFiles').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as any);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText(/Failed to load context files/)).toBeInTheDocument();
  });

  it('points at the VS Code extension when no files have been reported', () => {
    mockFiles([]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText(/No markdown files found/)).toBeInTheDocument();
    expect(screen.getByText(/Colophon extension running/)).toBeInTheDocument();
  });

  it('lists every reported file with its path', () => {
    mockFiles([
      makeFile({ id: 1, source_path: 'docs/notes.md' }),
      makeFile({ id: 2, source_path: 'specs/demo/spec.md' }),
    ]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText('docs/notes.md')).toBeInTheDocument();
    expect(screen.getByText('specs/demo/spec.md')).toBeInTheDocument();
    expect(screen.getByText('2 files')).toBeInTheDocument();
  });

  it('hides excluded files, which the Exceptions tab owns instead', () => {
    mockFiles([
      makeFile({ id: 1, source_path: 'docs/notes.md' }),
      makeFile({ id: 2, source_path: '.github/notes.md', is_excluded: true }),
    ]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText('docs/notes.md')).toBeInTheDocument();
    expect(screen.queryByText('.github/notes.md')).not.toBeInTheDocument();
  });

  it('treats an all-excluded project as having no files', () => {
    mockFiles([makeFile({ source_path: '.github/notes.md', is_excluded: true })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText(/No markdown files found/)).toBeInTheDocument();
  });

  it('filters the list by path as the user searches', async () => {
    const user = userEvent.setup();
    mockFiles([
      makeFile({ id: 1, source_path: 'docs/notes.md' }),
      makeFile({ id: 2, source_path: 'specs/demo/spec.md' }),
    ]);

    render(<ContextFilesPanel projectId="proj-1" />);

    await user.type(screen.getByLabelText('Search context files'), 'specs');

    // The search input is debounced, so the non-matching row is still on
    // screen for a beat after typing - wait for it to actually go.
    await waitFor(() => {
      expect(screen.queryByText('docs/notes.md')).not.toBeInTheDocument();
    });
    expect(screen.getByText('specs/demo/spec.md')).toBeInTheDocument();
  });

  it('shows a distinct empty state when the search matches nothing', async () => {
    const user = userEvent.setup();
    mockFiles([makeFile({ source_path: 'docs/notes.md' })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    await user.type(screen.getByLabelText('Search context files'), 'nothing-matches-this');

    expect(await screen.findByText(/No files match your search/)).toBeInTheDocument();
  });

  it('queues a file for the pipeline when Transform to PDF is clicked', async () => {
    const user = userEvent.setup();
    mockFiles([makeFile({ source_path: 'docs/notes.md' })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    await user.click(screen.getByRole('button', { name: 'Transform to PDF' }));

    expect(transformMutate).toHaveBeenCalledWith('docs/notes.md');
  });

  it('excludes a file when its exceptions button is clicked', async () => {
    const user = userEvent.setup();
    mockFiles([makeFile({ source_path: 'docs/notes.md' })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    await user.click(screen.getByRole('button', { name: 'Add docs/notes.md to exceptions' }));

    expect(addExceptionMutate).toHaveBeenCalledWith('docs/notes.md');
  });

  it('offers a regenerate, and marks the file, once it already has a PDF', () => {
    mockFiles([makeFile({ artifact_id: 'artifact-1', artifact_status: 'completed' })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByRole('button', { name: 'Regenerate PDF' })).toBeEnabled();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('disables the button for a file already waiting to be picked up', () => {
    mockFiles([makeFile({ transform_requested: true })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByRole('button', { name: 'Queued' })).toBeDisabled();
  });

  it('disables the button for a file already mid-pipeline', () => {
    mockFiles([makeFile({ artifact_id: 'artifact-1', artifact_status: 'processing' })]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled();
  });

  it('only shows the in-flight label on the row that was clicked', () => {
    vi.spyOn(useProjectFilesModule, 'useRequestFileTransform').mockReturnValue({
      mutate: transformMutate,
      isPending: true,
      isError: false,
      variables: 'docs/notes.md',
    } as any);
    mockFiles([
      makeFile({ id: 1, source_path: 'docs/notes.md' }),
      makeFile({ id: 2, source_path: 'specs/demo/spec.md' }),
    ]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByRole('button', { name: 'Queueing...' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transform to PDF' })).toBeEnabled();
  });

  it('surfaces a failed queue attempt', () => {
    vi.spyOn(useProjectFilesModule, 'useRequestFileTransform').mockReturnValue({
      mutate: transformMutate,
      isPending: false,
      isError: true,
      variables: undefined,
    } as any);
    mockFiles([makeFile()]);

    render(<ContextFilesPanel projectId="proj-1" />);

    expect(screen.getByText(/Failed to queue that file/)).toBeInTheDocument();
  });
});
