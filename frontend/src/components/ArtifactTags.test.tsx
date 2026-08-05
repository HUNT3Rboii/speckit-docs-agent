import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactTags } from './ArtifactTags';
import * as clientModule from '../api/client';

describe('ArtifactTags', () => {
  let queryClient: QueryClient;
  let setArtifactTagsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setArtifactTagsSpy = vi
      .spyOn(clientModule.APIClient.prototype, 'setArtifactTags')
      .mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderTags = (tags: string[] = []) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ArtifactTags artifactId="artifact-1" projectId="project-1" tags={tags} />
      </QueryClientProvider>
    );
  };

  it('renders existing tags as chips', () => {
    renderTags(['release', 'important']);
    expect(screen.getByText('release')).toBeInTheDocument();
    expect(screen.getByText('important')).toBeInTheDocument();
  });

  it('shows an "Add tag" button when there are no tags yet', () => {
    renderTags([]);
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeInTheDocument();
  });

  it('adding a tag reveals an input, and Enter commits it with the full new list', async () => {
    const user = userEvent.setup();
    renderTags(['release']);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const input = screen.getByPlaceholderText('New tag');
    await user.type(input, 'urgent{Enter}');

    expect(setArtifactTagsSpy).toHaveBeenCalledWith('artifact-1', ['release', 'urgent']);
  });

  it('does not add a duplicate tag', async () => {
    const user = userEvent.setup();
    renderTags(['release']);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByPlaceholderText('New tag'), 'release{Enter}');

    expect(setArtifactTagsSpy).not.toHaveBeenCalled();
  });

  it('does not add a blank/whitespace-only tag', async () => {
    const user = userEvent.setup();
    renderTags(['release']);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByPlaceholderText('New tag'), '   {Enter}');

    expect(setArtifactTagsSpy).not.toHaveBeenCalled();
  });

  it('Escape cancels adding without committing', async () => {
    const user = userEvent.setup();
    renderTags([]);

    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.type(screen.getByPlaceholderText('New tag'), 'draft{Escape}');

    expect(setArtifactTagsSpy).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('New tag')).not.toBeInTheDocument();
  });

  it('removing a tag sends the list without it', async () => {
    const user = userEvent.setup();
    renderTags(['release', 'important']);

    await user.click(screen.getByRole('button', { name: 'Remove tag release' }));

    expect(setArtifactTagsSpy).toHaveBeenCalledWith('artifact-1', ['important']);
  });

  it('stops click and keydown events from bubbling to a clickable parent card', () => {
    const parentClick = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <div onClick={parentClick} onKeyDown={parentClick} role="button" tabIndex={0}>
          <ArtifactTags artifactId="artifact-1" projectId="project-1" tags={['release']} />
        </div>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(parentClick).not.toHaveBeenCalled();
  });
});
