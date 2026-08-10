/**
 * Unit tests for the partial-success interpretation - specifically that
 * partial=true with nothing actually dropped is a complete success, not a
 * degraded one.
 */

import { countDroppedItems, describeDroppedItems, isPartialSuccess } from './partialResult';

describe('countDroppedItems', () => {
  it('sums every category', () => {
    expect(countDroppedItems({ diagrams: ['Data Flow', 'Architecture'], glossary_entries: ['JWT'] })).toBe(3);
  });

  it('returns 0 for empty categories, an empty object, or nothing at all', () => {
    expect(countDroppedItems({ diagrams: [], glossary_entries: [] })).toBe(0);
    expect(countDroppedItems({})).toBe(0);
    expect(countDroppedItems(undefined)).toBe(0);
    expect(countDroppedItems(null)).toBe(0);
  });

  it('ignores malformed members rather than counting them', () => {
    expect(countDroppedItems({ diagrams: ['ok', 42, null] as any, other: 'nope' as any })).toBe(1);
  });
});

describe('isPartialSuccess', () => {
  it('is true only when the flag is set and something was excluded', () => {
    expect(isPartialSuccess(true, { diagrams: ['Data Flow'] })).toBe(true);
  });

  it('is false when the backend flags partial but excluded nothing', () => {
    // The live README.md case: two correction rounds, then a complete PDF
    // reported with empty dropped_items - previously surfaced as a warning
    // notification reading "0 item(s) excluded".
    expect(isPartialSuccess(true, { diagrams: [], glossary_entries: [] })).toBe(false);
    expect(isPartialSuccess(true, undefined)).toBe(false);
  });

  it('is false when the flag is absent, whatever the payload says', () => {
    expect(isPartialSuccess(undefined, { diagrams: ['Data Flow'] })).toBe(false);
    expect(isPartialSuccess(false, { diagrams: ['Data Flow'] })).toBe(false);
  });
});

describe('describeDroppedItems', () => {
  it('names what went missing, per category', () => {
    expect(describeDroppedItems({ diagrams: ['Data Flow'], glossary_entries: ['JWT', 'idempotent'] })).toBe(
      'diagrams: Data Flow; glossary_entries: JWT, idempotent'
    );
  });

  it('skips empty categories', () => {
    expect(describeDroppedItems({ diagrams: ['Data Flow'], glossary_entries: [] })).toBe(
      'diagrams: Data Flow'
    );
  });

  it('returns an empty string when nothing was dropped', () => {
    expect(describeDroppedItems({ diagrams: [], glossary_entries: [] })).toBe('');
    expect(describeDroppedItems(undefined)).toBe('');
  });
});
