import {
  mergeInstructionsContent,
  PROGRESS_TRACKING_START_MARKER,
  PROGRESS_TRACKING_END_MARKER
} from './copilotInstructionsMerge';

describe('mergeInstructionsContent', () => {
  it('appends the progress-tracking block to an empty file', () => {
    const { content, wasAdded } = mergeInstructionsContent('');

    expect(wasAdded).toBe(true);
    expect(content).toContain(PROGRESS_TRACKING_START_MARKER);
    expect(content).toContain(PROGRESS_TRACKING_END_MARKER);
    expect(content).toContain('.speckit-auto-ai/progress/');
    expect(content).toContain('in_progress');
  });

  it('appends the block after existing content, separated by a blank line', () => {
    const existing = '# My Project Instructions\n\nBe concise.';
    const { content, wasAdded } = mergeInstructionsContent(existing);

    expect(wasAdded).toBe(true);
    expect(content.startsWith(existing)).toBe(true);
    expect(content).toContain(`${existing}\n\n${PROGRESS_TRACKING_START_MARKER}`);
  });

  it('does not add a duplicate block when the marker is already present', () => {
    const alreadyProvisioned = `Some instructions.\n\n${PROGRESS_TRACKING_START_MARKER}\nold content\n${PROGRESS_TRACKING_END_MARKER}\n`;
    const { content, wasAdded } = mergeInstructionsContent(alreadyProvisioned);

    expect(wasAdded).toBe(false);
    expect(content).toBe(alreadyProvisioned);
  });

  it('does not rewrite or reorder existing content when the marker is present', () => {
    const existing = `Z instructions first.\n\n${PROGRESS_TRACKING_START_MARKER}\nstale text a user may have edited\n${PROGRESS_TRACKING_END_MARKER}\n\nA instructions last.`;
    const { content, wasAdded } = mergeInstructionsContent(existing);

    expect(wasAdded).toBe(false);
    expect(content).toBe(existing);
  });

  it('the emitted block instructs writing to .speckit-auto-ai/progress/<task_key>.json', () => {
    const { content } = mergeInstructionsContent('');
    expect(content).toContain('.speckit-auto-ai/progress/<task_key>.json');
    expect(content).toContain('"status": "in_progress"');
    expect(content).toContain('"status": "done"');
  });
});
