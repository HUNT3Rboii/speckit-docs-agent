/**
 * Pure parsing/validation for the small JSON "progress signal" files an
 * external agent (GitHub Copilot running /speckit.implement) drops under
 * .speckit-auto-ai/progress/ - see copilotInstructionsMerge.ts for the
 * exact shape Copilot is instructed to write. No `vscode` import, so this
 * is unit-testable under Jest - see progressFileWatcher.ts for the thin
 * filesystem-watching wrapper that calls this on every file event.
 */

export interface ProgressSignal {
  source_path: string;
  task_key: string;
  status: string;
}

const VALID_STATUSES = new Set(['todo', 'in_progress', 'done']);

/**
 * Parses and validates a progress-signal file's raw text. Returns null
 * (rather than throwing) for anything malformed - a partially-written or
 * malformed file is a normal transient state while an editor/agent is
 * still writing it, not an error worth surfacing; this is a best-effort
 * side-channel signal, not a critical path.
 */
export function parseProgressSignal(raw: string): ProgressSignal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.source_path !== 'string' ||
    typeof candidate.task_key !== 'string' ||
    typeof candidate.status !== 'string' ||
    !VALID_STATUSES.has(candidate.status)
  ) {
    return null;
  }

  return {
    source_path: candidate.source_path,
    task_key: candidate.task_key,
    status: candidate.status,
  };
}
