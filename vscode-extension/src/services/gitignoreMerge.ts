/**
 * Pure content-merging logic for ensuring .gitignore excludes the local
 * progress-signal directory the Kanban progress-tracking feature writes to
 * (see progressFileWatcher.ts), so those ephemeral files never get
 * committed. No `vscode` import, so this is unit-testable under Jest - see
 * gitignoreService.ts for the thin filesystem wrapper that actually
 * reads/writes the file.
 */

export const PROGRESS_DIR_IGNORE_ENTRY = '.speckit-auto-ai/';
const IGNORE_COMMENT = '# Speckit Auto-AI: local-only task-progress signal files, never meant to be committed';

/**
 * Merges the ignore entry into existing .gitignore content. Checked as a
 * plain substring (not a full gitignore-pattern matcher) - good enough for
 * the one specific entry this ever adds, and avoids duplicate entries on
 * repeat activation without needing a real gitignore parser.
 */
export function mergeGitignoreContent(existingContent: string): { content: string; wasAdded: boolean } {
  if (existingContent.includes(PROGRESS_DIR_IGNORE_ENTRY)) {
    return { content: existingContent, wasAdded: false };
  }

  const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith('\n');
  const separator = existingContent.length > 0 ? '\n' : '';
  const content = `${existingContent}${needsLeadingNewline ? '\n' : ''}${separator}${IGNORE_COMMENT}\n${PROGRESS_DIR_IGNORE_ENTRY}\n`;
  return { content, wasAdded: true };
}
