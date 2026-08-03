import { mergeGitignoreContent, PROGRESS_DIR_IGNORE_ENTRY } from './gitignoreMerge';

describe('mergeGitignoreContent', () => {
  it('adds the ignore entry to an empty file', () => {
    const { content, wasAdded } = mergeGitignoreContent('');

    expect(wasAdded).toBe(true);
    expect(content).toContain(PROGRESS_DIR_IGNORE_ENTRY);
  });

  it('appends to existing content that already ends with a newline', () => {
    const existing = 'node_modules/\ndist/\n';
    const { content, wasAdded } = mergeGitignoreContent(existing);

    expect(wasAdded).toBe(true);
    expect(content.startsWith(existing)).toBe(true);
    expect(content).toContain(PROGRESS_DIR_IGNORE_ENTRY);
  });

  it('adds a newline before appending when existing content has no trailing newline', () => {
    const existing = 'node_modules/';
    const { content } = mergeGitignoreContent(existing);

    expect(content).not.toContain('node_modules/#');
    expect(content).not.toContain(`node_modules/${PROGRESS_DIR_IGNORE_ENTRY}`.replace('\n', ''));
    expect(content).toContain('node_modules/\n');
  });

  it('does not add a duplicate entry when already present', () => {
    const alreadyIgnored = `node_modules/\n${PROGRESS_DIR_IGNORE_ENTRY}\n`;
    const { content, wasAdded } = mergeGitignoreContent(alreadyIgnored);

    expect(wasAdded).toBe(false);
    expect(content).toBe(alreadyIgnored);
  });
});
