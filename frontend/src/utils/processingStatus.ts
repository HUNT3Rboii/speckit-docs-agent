import type { Artifact } from '../types/api';

const STEP_LABELS: Record<string, string> = {
  // Reported by the VS Code extension itself, before it has enough to call
  // /api/process (see backend's report_step) - these are often the slowest
  // steps, especially transforming_with_ai when it's a real LLM call.
  transforming_with_ai: 'Transforming with AI',
  correcting: 'Correcting and resubmitting',
  submitting: 'Submitting to backend',
  // Reported by the backend pipeline itself, once /api/process is called.
  validating: 'Validating content',
  rendering_diagrams: 'Rendering diagrams',
  generating_pdf: 'Generating PDF',
};

/** True while the pipeline is actively running this request (spinner-worthy). */
export function isActivelyProcessing(status: string): boolean {
  return status === 'processing';
}

/**
 * True while the artifact is either actively processing or parked in
 * retry_needed. Used to decide whether to keep polling - retry_needed can
 * still resolve if the calling AI agent resubmits a correction, even though
 * (unlike "processing") nothing is guaranteed to be happening right now.
 */
export function isProcessing(status: string): boolean {
  return status === 'processing' || status === 'retry_needed';
}

/**
 * True when validation failed and the pipeline is waiting on the calling AI
 * agent (the VS Code extension's Copilot/Claude session) to correct and
 * resubmit. This is NOT guaranteed to resolve on its own: if that agent
 * session has already ended, the artifact stays here indefinitely - so this
 * state should read as "needs attention", not as live progress.
 */
export function needsCorrection(status: string): boolean {
  return status === 'retry_needed';
}

function firstValidationError(artifact: Pick<Artifact, 'metadata'>): string | undefined {
  const errors = artifact.metadata?.structured_error?.errors;
  if (!errors) return undefined;
  for (const category of Object.keys(errors)) {
    const messages = errors[category];
    if (messages && messages.length > 0) return messages[0];
  }
  return undefined;
}

export function stepLabel(artifact: Pick<Artifact, 'status' | 'metadata'>): string {
  if (artifact.status === 'failed') {
    return artifact.metadata?.error ? `Failed: ${artifact.metadata.error}` : 'Failed';
  }
  if (artifact.status === 'retry_needed') {
    const reason = firstValidationError(artifact);
    return reason ? `Needs correction: ${reason}` : 'Needs correction before this can render';
  }
  const step = artifact.metadata?.current_step;
  const base = step && STEP_LABELS[step] ? STEP_LABELS[step] : 'Processing';
  // A client-side correction loop can take several fresh-AI-call cycles
  // (each one looking identical to the last) before it resolves - without
  // the attempt count, a slow-but-working retry is indistinguishable from
  // a hang.
  const { attempt, max_attempts: maxAttempts } = artifact.metadata ?? {};
  if (attempt && maxAttempts) return `${base} (attempt ${attempt}/${maxAttempts})`;
  return base;
}
