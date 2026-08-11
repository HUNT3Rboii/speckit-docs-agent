import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ContextFilesView } from './ContextFilesView';
import * as useProjectFilesModule from '../hooks/useProjectFiles';
import * as useExceptionsModule from '../hooks/useExceptions';

const renderAt = (route: string) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/projects/:projectId/files" element={<ContextFilesView />} />
      </Routes>
    </MemoryRouter>
  );

describe('ContextFilesView', () => {
  beforeEach(() => {
    vi.spyOn(useProjectFilesModule, 'useRequestFileTransform').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      variables: undefined,
    } as any);
    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      variables: undefined,
    } as any);
  });

  it('lists the files for the project id in the route', () => {
    const useProjectFiles = vi.spyOn(useProjectFilesModule, 'useProjectFiles').mockReturnValue({
      data: [
        {
          id: 1,
          project_id: 'proj-1',
          source_path: 'docs/notes.md',
          size_bytes: 1024,
          modified_at: new Date().toISOString(),
          transform_requested: false,
          requested_at: null,
          last_seen_at: new Date().toISOString(),
          is_excluded: false,
          artifact_id: null,
          artifact_status: null,
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    renderAt('/projects/proj-1/files');

    expect(useProjectFiles).toHaveBeenCalledWith('proj-1');
    expect(screen.getByRole('heading', { name: 'Context Files' })).toBeInTheDocument();
    expect(screen.getByText('docs/notes.md')).toBeInTheDocument();
  });
});
