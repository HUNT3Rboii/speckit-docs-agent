/**
 * Unit tests for ExceptionsPanel: lets the user add/remove source paths
 * (exact files or folder prefixes) that the backend should never process
 * into a PDF, managed entirely server-side.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExceptionsPanel } from './ExceptionsPanel';
import * as useExceptionsModule from '../hooks/useExceptions';
import type { ProcessingException } from '../types/api';

function makeException(overrides?: Partial<ProcessingException>): ProcessingException {
  return {
    id: 1,
    project_id: 'proj-1',
    source_path: '.specify/templates',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ExceptionsPanel', () => {
  const addMutate = vi.fn();
  const removeMutate = vi.fn();

  beforeEach(() => {
    addMutate.mockReset();
    removeMutate.mockReset();

    vi.spyOn(useExceptionsModule, 'useAddException').mockReturnValue({
      mutate: addMutate,
      isPending: false,
      isError: false,
    } as any);
    vi.spyOn(useExceptionsModule, 'useRemoveException').mockReturnValue({
      mutate: removeMutate,
      isPending: false,
      isError: false,
    } as any);
  });

  it('shows a loading state while fetching', () => {
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    expect(screen.getByText(/Loading exceptions/)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', () => {
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    expect(screen.getByText(/Failed to load exceptions/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no exceptions yet', () => {
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    expect(screen.getByText(/No excluded paths yet/)).toBeInTheDocument();
  });

  it('lists existing exceptions', () => {
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: [
        makeException({ id: 1, source_path: '.specify/templates' }),
        makeException({ id: 2, source_path: 'docs/onepager.md' }),
      ],
      isLoading: false,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    expect(screen.getByText('.specify/templates')).toBeInTheDocument();
    expect(screen.getByText('docs/onepager.md')).toBeInTheDocument();
  });

  it('adds a new exception by path via the form', async () => {
    const user = userEvent.setup();
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    const input = screen.getByLabelText('Path to exclude');
    await user.type(input, '.specify/templates');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(addMutate).toHaveBeenCalledWith('.specify/templates', expect.anything());
  });

  it('does not submit an empty or whitespace-only path', async () => {
    const user = userEvent.setup();
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    const input = screen.getByLabelText('Path to exclude');
    await user.type(input, '   ');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(addMutate).not.toHaveBeenCalled();
  });

  it('removes an exception when its remove button is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(useExceptionsModule, 'useExceptions').mockReturnValue({
      data: [makeException({ id: 42, source_path: 'docs/onepager.md' })],
      isLoading: false,
      error: null,
    } as any);

    render(<ExceptionsPanel projectId="proj-1" />);

    await user.click(screen.getByRole('button', { name: 'Remove docs/onepager.md' }));

    expect(removeMutate).toHaveBeenCalledWith(42);
  });
});
