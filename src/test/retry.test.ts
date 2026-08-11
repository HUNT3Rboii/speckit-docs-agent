import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_ATTEMPTS, correctionPrompt, enrichWithRetry } from '../ai/retry';
import type { ProposedEnrichment } from '../ai/parse';

/**
 * Correction-loop tests.
 *
 * Dropping an unsupported claim is the right final answer but the wrong first
 * one, and this loop is the difference. The cases that matter are the ones
 * where re-asking makes things *worse* - models do respond to criticism by
 * deleting everything - because that is when keeping the first answer is right.
 */

const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) } as never;
const prompt = { system: 'rules', user: 'Document:\n\nbody' };

function enrichment(terms: string[]): ProposedEnrichment {
  return {
    glossary: terms.map((term) => ({ term, definition: 'd', evidence: 'e' })),
    diagrams: [],
  };
}

describe('the correction loop', () => {
  it('accepts a clean first answer without re-asking', async () => {
    let asked = 0;
    const outcome = await enrichWithRetry(
      prompt,
      async () => {
        asked += 1;
        return enrichment(['a']);
      },
      async () => ({ dropped: [], kept: { glossary: 1, diagrams: 0 } }),
      token,
      () => {}
    );

    assert.equal(asked, 1);
    assert.equal(outcome?.attempts, 1);
  });

  it('re-asks when something was dropped, and takes the better answer', async () => {
    const answers = [enrichment(['a']), enrichment(['a', 'b'])];
    const rounds = [
      { dropped: [{ kind: 'glossary', label: 'b', reason: 'quote not found' }], kept: { glossary: 1, diagrams: 0 } },
      { dropped: [], kept: { glossary: 2, diagrams: 0 } },
    ];
    let call = 0;

    const outcome = await enrichWithRetry(
      prompt,
      async () => answers[call],
      async () => rounds[call++],
      token,
      () => {}
    );

    assert.equal(outcome?.attempts, 2);
    assert.equal(outcome?.dropped.length, 0);
    assert.equal(outcome?.enrichment.glossary.length, 2);
  });

  it('keeps the original when the correction keeps less of the document', async () => {
    // A model told its evidence was wrong sometimes deletes the entry instead
    // of fixing it. That is worse than what it started with.
    const answers = [enrichment(['a', 'b']), enrichment([])];
    const rounds = [
      { dropped: [{ kind: 'glossary', label: 'b', reason: 'quote not found' }], kept: { glossary: 2, diagrams: 0 } },
      { dropped: [], kept: { glossary: 0, diagrams: 0 } },
    ];
    let call = 0;

    const outcome = await enrichWithRetry(
      prompt,
      async () => answers[call],
      async () => rounds[call++],
      token,
      () => {}
    );

    assert.equal(outcome?.enrichment.glossary.length, 2);
  });

  it('stops after the maximum number of attempts', async () => {
    // A model that has failed twice on the same evidence will not succeed on
    // the third try, and the user is waiting.
    let asked = 0;
    const outcome = await enrichWithRetry(
      prompt,
      async () => {
        asked += 1;
        return enrichment(['a']);
      },
      async () => ({
        dropped: [{ kind: 'glossary', label: 'a', reason: 'quote not found' }],
        kept: { glossary: 1, diagrams: 0 },
      }),
      token,
      () => {}
    );

    assert.equal(asked, MAX_ATTEMPTS);
    assert.equal(outcome?.attempts, MAX_ATTEMPTS);
    assert.equal(outcome?.dropped.length, 1);
  });

  it('gives up when no provider answers at all', async () => {
    const outcome = await enrichWithRetry(
      prompt,
      async () => undefined,
      async () => ({ dropped: [], kept: { glossary: 0, diagrams: 0 } }),
      token,
      () => {}
    );
    assert.equal(outcome, undefined);
  });

  it('keeps the first answer when the retry produces nothing', async () => {
    let call = 0;
    const outcome = await enrichWithRetry(
      prompt,
      async () => (call++ === 0 ? enrichment(['a']) : undefined),
      async () => ({
        dropped: [{ kind: 'glossary', label: 'b', reason: 'quote not found' }],
        kept: { glossary: 1, diagrams: 0 },
      }),
      token,
      () => {}
    );

    assert.equal(outcome?.enrichment.glossary.length, 1);
  });

  it('names the specific failures in the correction request', () => {
    // A bare "try again" produces the same output with different wording.
    const corrected = correctionPrompt(prompt, [
      { kind: 'glossary', label: 'idempotent', reason: 'the supporting quote is not in the document' },
    ]);

    assert.match(corrected.user, /idempotent/);
    assert.match(corrected.user, /not in the document/);
    assert.match(corrected.user, /Do not invent a quote/);
    assert.equal(corrected.system, prompt.system);
  });
});
