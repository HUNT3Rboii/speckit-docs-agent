import * as vscode from 'vscode';

import { ProposedEnrichment } from './parse';
import { PromptPair } from './providers';

/**
 * Give the model a chance to correct itself before anything is thrown away.
 *
 * The backend drops any claim it cannot find in the document. Dropping is the
 * right final answer, but not the right *first* one: a model that quoted a line
 * from memory and got a word wrong wrote a real entry about a real term, and
 * asking it again with the specific failures usually fixes it.
 *
 * Two attempts, as before. A model that has failed twice on the same evidence
 * is not going to succeed on the third try, and the user is waiting.
 */

export const MAX_ATTEMPTS = 2;

export interface DroppedItem {
  kind: string;
  label: string;
  reason: string;
}

export interface ValidationRound {
  dropped: DroppedItem[];
  kept: { glossary: number; diagrams: number };
}

export type Validate = (enrichment: ProposedEnrichment) => Promise<ValidationRound>;
export type Ask = (prompt: PromptPair, token: vscode.CancellationToken) => Promise<ProposedEnrichment | undefined>;

export interface RetryOutcome {
  enrichment: ProposedEnrichment;
  attempts: number;
  dropped: DroppedItem[];
}

/**
 * Build the correction request.
 *
 * It names what failed and why, and repeats the one rule that matters, because
 * a bare "try again" produces the same output with different wording.
 */
export function correctionPrompt(original: PromptPair, dropped: DroppedItem[]): PromptPair {
  const failures = dropped
    .map((item) => `- ${item.kind} "${item.label}": ${item.reason}`)
    .join('\n');

  return {
    system: original.system,
    user:
      `${original.user}\n\n` +
      `Your previous answer had entries removed because they could not be found in the document:\n\n` +
      `${failures}\n\n` +
      `Return the JSON again. For each removed entry, either copy the exact wording from the ` +
      `document into its "evidence" field, or leave the entry out entirely. Do not invent a quote ` +
      `to satisfy the check - an entry with no support is worth less than no entry.`,
  };
}

/**
 * Ask, validate, and re-ask once if anything was dropped.
 *
 * Returns whatever survived the last attempt, which may be less than was asked
 * for. That is the intended end state: the document decides.
 */
export async function enrichWithRetry(
  prompt: PromptPair,
  ask: Ask,
  validate: Validate,
  token: vscode.CancellationToken,
  log: (message: string) => void
): Promise<RetryOutcome | undefined> {
  let current = await ask(prompt, token);
  if (!current) {
    return undefined;
  }

  let round = await validate(current);
  let attempts = 1;

  while (round.dropped.length && attempts < MAX_ATTEMPTS && !token.isCancellationRequested) {
    log(`${round.dropped.length} item(s) unsupported; asking for a correction (attempt ${attempts + 1})`);

    const corrected = await ask(correctionPrompt(prompt, round.dropped), token);
    attempts += 1;

    if (!corrected) {
      break;
    }

    const nextRound = await validate(corrected);

    // Only take the correction if it actually improved matters. A second answer
    // that keeps less of the document is worse than the first, and models do
    // sometimes respond to criticism by deleting everything.
    const keptBefore = round.kept.glossary + round.kept.diagrams;
    const keptAfter = nextRound.kept.glossary + nextRound.kept.diagrams;

    if (keptAfter >= keptBefore) {
      current = corrected;
      round = nextRound;
    } else {
      log(`the correction kept less than the original (${keptAfter} vs ${keptBefore}); keeping the original`);
      break;
    }
  }

  return { enrichment: current, attempts, dropped: round.dropped };
}
