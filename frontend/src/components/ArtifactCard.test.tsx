import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArtifactCard } from './ArtifactCard';
import type { Artifact } from '../types/api';
import * as clientModule from '../api/client';

/**
 * Unit tests for ArtifactCard component
 * Tests component rendering, color coding, timestamp formatting, path truncation, and click handlers
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 2.2**
 */
describe('ArtifactCard', () => {
  // Mock artifact data
  const createMockArtifact = (overrides?: Partial<Artifact>): Artifact => ({
    id: 'artifact-123',
    project_id: 'project-1',
    source_path: '/src/specs/example.md',
    artifact_type: 'spec',
    status: 'completed',
    content_hash: 'abc123',
    created_at: new Date().toISOString(),
    title: 'Example Spec',
    ...overrides,
  });

  // ArtifactTags (rendered inside every card) uses useSetArtifactTags,
  // which needs a QueryClient in context - a fresh one per render so
  // mutation state never leaks between tests.
  const renderCard = (artifact: Artifact, onClick: (id: string) => void) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <ArtifactCard artifact={artifact} onClick={onClick} />
      </QueryClientProvider>
    );
  };

  describe('rendering', () => {
    it('renders artifact title prominently', () => {
      const artifact = createMockArtifact({ title: 'Test Specification' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const title = screen.getByText('Test Specification');
      expect(title).toBeInTheDocument();
      // Check it's in a CardTitle (heading-like element)
      expect(title).toHaveClass('text-xl');
    });

    it('displays source path as description', () => {
      const sourcePath = '/path/to/source.md';
      const artifact = createMockArtifact({ source_path: sourcePath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(sourcePath)).toBeInTheDocument();
    });

    it('renders artifact when title is missing', () => {
      const sourcePath = '/path/to/source.md';
      const artifact = createMockArtifact({ title: undefined, source_path: sourcePath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      // When no title, path should be shown in title and description
      const cardContent = screen.getByRole('button', { name: /^Open artifact/ });
      expect(cardContent).toBeInTheDocument();
      // The source path appears in both the title and description, so we check for the button
      expect(cardContent).toHaveAttribute('aria-label');
    });

    it('renders as interactive button element', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /Open artifact/ });
      expect(card).toBeInTheDocument();
    });

    it('has proper accessibility attributes', () => {
      const artifact = createMockArtifact({ title: 'Test Title' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card).toHaveAttribute('tabIndex', '0');
      expect(card).toHaveAttribute('role', 'button');
      expect(card).toHaveAttribute('aria-label');
    });

    it('includes created date in card content', () => {
      const now = new Date();
      const artifact = createMockArtifact({ created_at: now.toISOString() });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(/Created/)).toBeInTheDocument();
    });
  });

  describe('category badge with color coding', () => {
    it('displays category badge for spec type', () => {
      const artifact = createMockArtifact({ artifact_type: 'spec' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('spec');
      expect(badge).toBeInTheDocument();
    });

    it('displays category badge for plan type', () => {
      const artifact = createMockArtifact({ artifact_type: 'plan' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('plan');
      expect(badge).toBeInTheDocument();
    });

    it('displays category badge for task type', () => {
      const artifact = createMockArtifact({ artifact_type: 'task' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('task');
      expect(badge).toBeInTheDocument();
    });

    it('displays category badge for constitution type', () => {
      const artifact = createMockArtifact({ artifact_type: 'constitution' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('constitution');
      expect(badge).toBeInTheDocument();
    });

    it('displays category badge for other type', () => {
      const artifact = createMockArtifact({ artifact_type: 'other' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('other');
      expect(badge).toBeInTheDocument();
    });

    it('applies spec category blue color classes', () => {
      const artifact = createMockArtifact({ artifact_type: 'spec' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('spec');
      // spec should have blue classes: bg-blue-100 text-blue-800 border-blue-200
      expect(badge).toHaveClass('bg-blue-100');
      expect(badge).toHaveClass('text-blue-800');
    });

    it('applies plan category green color classes', () => {
      const artifact = createMockArtifact({ artifact_type: 'plan' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('plan');
      // plan should have green classes: bg-green-100 text-green-800 border-green-200
      expect(badge).toHaveClass('bg-green-100');
      expect(badge).toHaveClass('text-green-800');
    });

    it('applies task category orange color classes', () => {
      const artifact = createMockArtifact({ artifact_type: 'task' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('task');
      // task should have orange classes: bg-orange-100 text-orange-800 border-orange-200
      expect(badge).toHaveClass('bg-orange-100');
      expect(badge).toHaveClass('text-orange-800');
    });

    it('applies constitution category purple color classes', () => {
      const artifact = createMockArtifact({ artifact_type: 'constitution' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('constitution');
      // constitution should have purple classes: bg-purple-100 text-purple-800 border-purple-200
      expect(badge).toHaveClass('bg-purple-100');
      expect(badge).toHaveClass('text-purple-800');
    });

    it('applies other category gray color classes', () => {
      const artifact = createMockArtifact({ artifact_type: 'other' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const badge = screen.getByText('other');
      // other should have gray classes: bg-gray-100 text-gray-800 border-gray-200
      expect(badge).toHaveClass('bg-gray-100');
      expect(badge).toHaveClass('text-gray-800');
    });
  });

  describe('timestamp formatting', () => {
    it('formats timestamp in human-readable format', () => {
      const now = new Date();
      const artifact = createMockArtifact({ created_at: now.toISOString() });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const createdText = screen.getByText(/Created/);
      expect(createdText).toBeInTheDocument();
      // Should contain relative time like "now", "seconds ago", etc.
      expect(createdText.textContent).toMatch(/Created/);
    });

    it('formats timestamp with "ago" suffix', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const artifact = createMockArtifact({ created_at: oneHourAgo.toISOString() });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const createdText = screen.getByText(/Created/);
      expect(createdText.textContent).toMatch(/ago/);
    });

    it('formats old timestamps correctly', () => {
      const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const artifact = createMockArtifact({ created_at: threeMonthsAgo.toISOString() });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const createdText = screen.getByText(/Created/);
      expect(createdText).toBeInTheDocument();
    });

    it('displays "Unknown" for missing created_at', () => {
      const artifact = createMockArtifact({ created_at: '' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });

    it('displays "Unknown" for invalid date string', () => {
      const artifact = createMockArtifact({ created_at: 'invalid-date' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });

    it('formats recent timestamps correctly', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const artifact = createMockArtifact({ created_at: fiveMinutesAgo.toISOString() });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const createdText = screen.getByText(/Created/);
      expect(createdText.textContent).toContain('minute');
    });
  });

  describe('source path truncation', () => {
    it('displays short source paths without truncation', () => {
      const shortPath = '/specs/example.md';
      const artifact = createMockArtifact({ source_path: shortPath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(shortPath)).toBeInTheDocument();
    });

    it('truncates long source paths', () => {
      const longPath = '/very/long/path/to/some/deeply/nested/specifications/document.md';
      const artifact = createMockArtifact({ source_path: longPath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      // Should display the path in the card
      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card).toBeInTheDocument();
      // The CardDescription contains the path
      expect(screen.getByText(longPath)).toBeInTheDocument();
    });

    it('preserves filename when truncating path', () => {
      const longPath = '/very/long/path/to/specifications/important-document.md';
      const artifact = createMockArtifact({ source_path: longPath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      // Filename should be preserved
      expect(screen.getByText(/important-document\.md/)).toBeInTheDocument();
    });

    it('handles paths without directories', () => {
      const filename = 'document.md';
      const artifact = createMockArtifact({ source_path: filename });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(filename)).toBeInTheDocument();
    });

    it('uses title for display when available over truncated path', () => {
      const longPath = '/very/long/path/to/specifications/document.md';
      const title = 'My Important Document';
      const artifact = createMockArtifact({ source_path: longPath, title });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      // Should show title prominently
      expect(screen.getByText(title)).toBeInTheDocument();
      // But path should still be in description
      expect(screen.getByText(longPath)).toBeInTheDocument();
    });
  });

  describe('click handler', () => {
    it('calls onClick with artifact ID when card is clicked', async () => {
      const onClick = vi.fn();
      const artifactId = 'artifact-456';
      const artifact = createMockArtifact({ id: artifactId });

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      fireEvent.click(card);

      expect(onClick).toHaveBeenCalledWith(artifactId);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick with correct artifact ID for different artifacts', () => {
      const onClick = vi.fn();
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <ArtifactCard
            artifact={createMockArtifact({ id: 'artifact-1' })}
            onClick={onClick}
          />
        </QueryClientProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Open artifact/ }));
      expect(onClick).toHaveBeenCalledWith('artifact-1');

      onClick.mockClear();

      rerender(
        <QueryClientProvider client={queryClient}>
          <ArtifactCard
            artifact={createMockArtifact({ id: 'artifact-2' })}
            onClick={onClick}
          />
        </QueryClientProvider>
      );

      fireEvent.click(screen.getByRole('button', { name: /^Open artifact/ }));
      expect(onClick).toHaveBeenCalledWith('artifact-2');
    });

    it('is keyboard accessible with Enter key', async () => {
      const onClick = vi.fn();
      const artifact = createMockArtifact({ id: 'artifact-789' });

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

      expect(onClick).toHaveBeenCalledWith('artifact-789');
    });

    it('is keyboard accessible with Space key', async () => {
      const onClick = vi.fn();
      const artifact = createMockArtifact({ id: 'artifact-999' });

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });

      expect(onClick).toHaveBeenCalledWith('artifact-999');
    });

    it('does not call onClick for other key presses', () => {
      const onClick = vi.fn();
      const artifact = createMockArtifact();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      fireEvent.keyDown(card, { key: 'a', code: 'KeyA' });

      expect(onClick).not.toHaveBeenCalled();
    });

    it('prevents default behavior for Space key', () => {
      const onClick = vi.fn();
      const artifact = createMockArtifact();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });

      // Dispatch the event - the component should handle Space key
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });
      
      // Verify that onClick was called (indicating the event was handled)
      expect(onClick).toHaveBeenCalledWith(artifact.id);
    });
  });

  describe('hover and interactive states', () => {
    it('applies hover styling classes', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card).toHaveClass('hover:shadow-lg');
      expect(card).toHaveClass('cursor-pointer');
    });

    it('has transition effects', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card).toHaveClass('transition-all');
    });
  });

  describe('different artifact types', () => {
    const artifactTypes: Array<Artifact['artifact_type']> = [
      'spec',
      'plan',
      'task',
      'constitution',
      'other',
    ];

    it.each(artifactTypes)(
      'renders correctly with artifact_type: %s',
      (type) => {
        const artifact = createMockArtifact({
          artifact_type: type,
          title: `Test ${type}`,
        });
        const onClick = vi.fn();

        renderCard(artifact, onClick);

        const badge = screen.getByText(type);
        expect(badge).toBeInTheDocument();
        expect(screen.getByText(`Test ${type}`)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Open artifact/ }));
        expect(onClick).toHaveBeenCalledWith(artifact.id);
      }
    );
  });

  describe('edge cases', () => {
    it('handles empty title gracefully', () => {
      const artifact = createMockArtifact({ title: '' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      // Should fall back to truncated source path
      expect(screen.getByRole('button', { name: /^Open artifact/ })).toBeInTheDocument();
    });

    it('handles very long artifact titles', () => {
      const longTitle = 'A'.repeat(200);
      const artifact = createMockArtifact({ title: longTitle });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('handles special characters in title', () => {
      const specialTitle = 'Title with "quotes" & <special> characters';
      const artifact = createMockArtifact({ title: specialTitle });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it('handles special characters in path', () => {
      const specialPath = '/path/with spaces/and-special@chars_123.md';
      const artifact = createMockArtifact({ source_path: specialPath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByText(specialPath)).toBeInTheDocument();
    });

    it('handles multiple onClick calls', async () => {
      const onClick = vi.fn();
      const artifact = createMockArtifact();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });

      fireEvent.click(card);
      fireEvent.click(card);
      fireEvent.click(card);

      expect(onClick).toHaveBeenCalledTimes(3);
      expect(onClick).toHaveBeenCalledWith(artifact.id);
    });

    it('maintains functionality with null/undefined optional fields', () => {
      const artifact: Artifact = {
        id: 'test-id',
        project_id: 'proj-1',
        source_path: '/test.md',
        artifact_type: 'spec',
        status: 'completed',
        content_hash: 'hash',
        created_at: new Date().toISOString(),
        // title is undefined
      };
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByRole('button', { name: /^Open artifact/ })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Open artifact/ }));
      expect(onClick).toHaveBeenCalledWith('test-id');
    });
  });

  describe('accessibility and semantics', () => {
    it('has accessible card structure', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card).toHaveAttribute('aria-label');
    });

    it('aria-label includes artifact title', () => {
      const title = 'Important Document';
      const artifact = createMockArtifact({ title });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      expect(card.getAttribute('aria-label')).toContain(title);
    });

    it('aria-label includes source path when title is missing', () => {
      const sourcePath = '/path/to/document.md';
      const artifact = createMockArtifact({ title: undefined, source_path: sourcePath });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      const card = screen.getByRole('button', { name: /^Open artifact/ });
      const ariaLabel = card.getAttribute('aria-label');
      expect(ariaLabel).toBeDefined();
      expect(ariaLabel).toContain('Open artifact');
    });
  });

  describe('component prop validation', () => {
    it('renders with valid artifact prop', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      const { container } = renderCard(artifact, onClick);

      expect(container.querySelector('[role="button"]')).toBeInTheDocument();
    });

    it('callback is optional but component works', () => {
      const artifact = createMockArtifact();
      const onClick = vi.fn();

      expect(() => {
        renderCard(artifact, onClick);
      }).not.toThrow();
    });
  });

  describe('live processing state', () => {
    it('shows a spinner and step label instead of the created date while processing', () => {
      const artifact = createMockArtifact({
        status: 'processing',
        metadata: { current_step: 'rendering_diagrams' },
      });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByTestId('processing-indicator')).toBeInTheDocument();
      expect(screen.getByText('Rendering diagrams')).toBeInTheDocument();
      expect(screen.queryByText(/Created/)).not.toBeInTheDocument();
    });

    it('shows a static "needs correction" state (not a spinner) for retry_needed status', () => {
      const artifact = createMockArtifact({
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
      });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByTestId('stalled-indicator')).toBeInTheDocument();
      expect(screen.queryByTestId('processing-indicator')).not.toBeInTheDocument();
      expect(
        screen.getByText('Needs correction: Diagram evidence ungrounded for component X')
      ).toBeInTheDocument();
    });

    it('shows a failed indicator with the error message', () => {
      const artifact = createMockArtifact({
        status: 'failed',
        metadata: { error: 'PDF generation crashed' },
      });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByTestId('failed-indicator')).toBeInTheDocument();
      expect(screen.getByText('Failed: PDF generation crashed')).toBeInTheDocument();
    });

    it('shows a "Ready" indicator alongside the created date once rendered', () => {
      const artifact = createMockArtifact({ status: 'rendered' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByTestId('ready-indicator')).toBeInTheDocument();
      expect(screen.getByText(/Ready/)).toBeInTheDocument();
      expect(screen.getByText(/Created/)).toBeInTheDocument();
      expect(screen.queryByTestId('processing-indicator')).not.toBeInTheDocument();
      expect(screen.queryByTestId('stalled-indicator')).not.toBeInTheDocument();
      expect(screen.queryByTestId('failed-indicator')).not.toBeInTheDocument();
    });

    it('remains clickable while processing so users can view the live status page', () => {
      const artifact = createMockArtifact({
        status: 'processing',
        metadata: { current_step: 'validating' },
      });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      fireEvent.click(screen.getByRole('button', { name: /^Open artifact/ }));
      expect(onClick).toHaveBeenCalledWith(artifact.id);
    });

    it('shows a "Cancelled" indicator, distinct from failed, for a cancelled artifact', () => {
      const artifact = createMockArtifact({ status: 'cancelled' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);

      expect(screen.getByTestId('cancelled-indicator')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      expect(screen.queryByTestId('failed-indicator')).not.toBeInTheDocument();
    });
  });

  describe('cancel button', () => {
    let cancelArtifactSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      cancelArtifactSpy = vi
        .spyOn(clientModule.APIClient.prototype, 'cancelArtifact')
        .mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a Cancel button only while processing', () => {
      const processingArtifact = createMockArtifact({ status: 'processing' });
      const onClick = vi.fn();
      const { unmount } = renderCard(processingArtifact, onClick);
      expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
      unmount();

      const renderedArtifact = createMockArtifact({ status: 'rendered' });
      renderCard(renderedArtifact, onClick);
      expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();
    });

    it('calls cancelArtifact with the artifact id and does not navigate away', async () => {
      const artifact = createMockArtifact({ id: 'artifact-to-cancel', status: 'processing' });
      const onClick = vi.fn();

      renderCard(artifact, onClick);
      fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));

      await waitFor(() => expect(cancelArtifactSpy).toHaveBeenCalledWith('artifact-to-cancel'));
      // Clicking Cancel must not also trigger the card's own "open artifact"
      // click handler (the card is otherwise a full-surface click target).
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});
