/**
 * Pure content-merging logic for auto-provisioning
 * .github/copilot-instructions.md with a live task-progress-tracking
 * block, so GitHub Copilot (e.g. running /speckit.implement) reports task
 * start/finish to the Speckit Auto-AI Kanban board without the user having
 * to set anything up by hand. No `vscode` import, so this is unit-testable
 * under Jest - see copilotInstructionsService.ts for the thin filesystem
 * wrapper that actually reads/writes the file.
 */

export const PROGRESS_TRACKING_START_MARKER = '<!-- speckit-auto-ai:progress-tracking:start -->';
export const PROGRESS_TRACKING_END_MARKER = '<!-- speckit-auto-ai:progress-tracking:end -->';

function buildInstructionsBlock(): string {
  return `${PROGRESS_TRACKING_START_MARKER}
## Speckit Auto-AI: Live Task Progress Tracking

This project uses the Speckit Auto-AI extension to show a live Kanban board of the tasks in each \`tasks.md\` file. When you are executing \`/speckit.implement\` (or otherwise working through a \`tasks.md\` checklist) and are about to start or finish a specific task:

1. **When you start working on a task** (e.g. \`T003\`), write a JSON file to \`.speckit-auto-ai/progress/<task_key>.json\` (creating the \`.speckit-auto-ai/progress/\` directory if it doesn't exist) with this exact shape:
   \`\`\`json
   { "source_path": "<path to the tasks.md file, relative to the repo root>", "task_key": "T003", "status": "in_progress" }
   \`\`\`
2. **When you finish that task** (after checking its box, \`- [x]\`), overwrite the same file with \`"status": "done"\` instead.

Do this for every task you work on, one file write per task. These files are local-only signals (already gitignored) picked up by the Speckit Auto-AI extension - they are not part of the project's source and should never be referenced elsewhere or committed.
${PROGRESS_TRACKING_END_MARKER}`;
}

/**
 * Merges the progress-tracking block into existing copilot-instructions.md
 * content. Never rewrites or reorders anything the user already has - if
 * the marker is already present anywhere in the file, the content is
 * returned unchanged (wasAdded: false), respecting any edits the user has
 * since made rather than silently overwriting them on every activation.
 */
export function mergeInstructionsContent(existingContent: string): { content: string; wasAdded: boolean } {
  if (existingContent.includes(PROGRESS_TRACKING_START_MARKER)) {
    return { content: existingContent, wasAdded: false };
  }

  const separator = existingContent.trim().length > 0 ? '\n\n' : '';
  const content = `${existingContent}${separator}${buildInstructionsBlock()}\n`;
  return { content, wasAdded: true };
}
