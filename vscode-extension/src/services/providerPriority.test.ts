/**
 * Unit tests for provider try-order resolution - specifically that a
 * custom model can be ordered individually ("custom:<id>") while the
 * legacy/default bare "custom" token keeps behaving exactly as it did.
 */

import { CustomModelEntry, PriorityEntry } from '../types';
import {
  customRefFor,
  customRefId,
  describePriority,
  expandPriority,
  filterPriorityTokens,
  isValidPriorityEntry,
  pickEffectiveOrder,
  syncPriorityWithEntries
} from './providerPriority';

function entry(id: string, overrides: Partial<CustomModelEntry> = {}): CustomModelEntry {
  return {
    id,
    enabled: true,
    name: id,
    baseUrl: `http://${id}.test/v1`,
    apiKey: '',
    modelName: 'model-x',
    ...overrides
  };
}

const names = (priority: PriorityEntry[], entries: CustomModelEntry[]) =>
  expandPriority(priority, entries).map((r) => (r.kind === 'custom' ? r.entry.id : r.id));

describe('customRefId / isValidPriorityEntry', () => {
  it('round-trips an entry id', () => {
    expect(customRefId(customRefFor('local-ollama'))).toBe('local-ollama');
  });

  it('rejects a bare or empty reference', () => {
    expect(customRefId('custom')).toBeNull();
    expect(customRefId('custom:')).toBeNull();
    expect(customRefId('custom:   ')).toBeNull();
  });

  it('accepts built-in ids, "custom", and custom refs only', () => {
    expect(isValidPriorityEntry('copilot')).toBe(true);
    expect(isValidPriorityEntry('custom')).toBe(true);
    expect(isValidPriorityEntry('custom:abc')).toBe(true);
    expect(isValidPriorityEntry('rule-based')).toBe(false);
    expect(isValidPriorityEntry(42)).toBe(false);
  });
});

describe('expandPriority', () => {
  it('places an individually referenced model at its own position', () => {
    const entries = [entry('a'), entry('b')];
    const order = names(['custom:b', 'copilot', 'custom:a'], entries);
    expect(order).toEqual(['b', 'copilot', 'a']);
  });

  it('expands a bare "custom" to every entry, in customModels order', () => {
    const entries = [entry('a'), entry('b')];
    expect(names(['copilot', 'custom'], entries)).toEqual(['copilot', 'a', 'b']);
  });

  it('does not re-expand a model that is already placed individually', () => {
    const entries = [entry('a'), entry('b')];
    expect(names(['custom:b', 'copilot', 'custom'], entries)).toEqual(['b', 'copilot', 'a']);
  });

  it('drops a reference to a model that no longer exists', () => {
    expect(names(['custom:gone', 'copilot'], [entry('a')])).toEqual(['copilot']);
  });

  it('emits a model at most once even if referenced twice', () => {
    expect(names(['custom:a', 'custom:a'], [entry('a')])).toEqual(['a']);
  });

  it('keeps disabled entries in the list so detection can report why they were skipped', () => {
    const entries = [entry('a', { enabled: false })];
    expect(names(['custom'], entries)).toEqual(['a']);
  });

  it('returns built-ins unchanged when no custom models exist', () => {
    expect(names(['copilot', 'claude', 'custom'], [])).toEqual(['copilot', 'claude']);
  });
});

describe('syncPriorityWithEntries', () => {
  it('migrates a bare "custom" into explicit per-model references', () => {
    const entries = [entry('a'), entry('b')];
    expect(syncPriorityWithEntries(['copilot', 'custom'], entries)).toEqual([
      'copilot',
      'custom:a',
      'custom:b'
    ]);
  });

  it('appends a newly added model that is referenced nowhere', () => {
    const entries = [entry('a'), entry('new')];
    expect(syncPriorityWithEntries(['custom:a', 'copilot'], entries)).toEqual([
      'custom:a',
      'copilot',
      'custom:new'
    ]);
  });

  it('drops references to deleted models', () => {
    expect(syncPriorityWithEntries(['custom:gone', 'copilot'], [])).toEqual(['copilot']);
  });

  it('keeps an explicit position rather than duplicating at the end', () => {
    const entries = [entry('a')];
    expect(syncPriorityWithEntries(['custom:a', 'copilot', 'custom'], entries)).toEqual([
      'custom:a',
      'copilot'
    ]);
  });
});

describe('filterPriorityTokens', () => {
  it('never adds a provider the user left out of the order', () => {
    const entries = [entry('a'), entry('b')];
    expect(filterPriorityTokens(['custom:a'], entries)).toEqual(['custom:a']);
  });

  it('drops malformed tokens, stale refs and duplicates', () => {
    const entries = [entry('a')];
    expect(filterPriorityTokens(['copilot', 'nonsense', 'custom:gone', 'copilot', 'custom:a'], entries)).toEqual([
      'copilot',
      'custom:a'
    ]);
  });
});

describe('pickEffectiveOrder', () => {
  const configured: PriorityEntry[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];

  it('prefers the panel-stored order', () => {
    expect(pickEffectiveOrder(['custom:a', 'copilot'], configured)).toEqual(['custom:a', 'copilot']);
  });

  it('falls back to the setting when nothing is stored yet', () => {
    expect(pickEffectiveOrder(undefined, configured)).toEqual(configured);
  });

  it('falls back when the stored order has no usable token left', () => {
    expect(pickEffectiveOrder(['nonsense', 42], configured)).toEqual(configured);
    expect(pickEffectiveOrder([], configured)).toEqual(configured);
  });

  it('drops malformed and duplicate tokens from a stored order', () => {
    expect(pickEffectiveOrder(['copilot', 'copilot', 'oops', 'custom:a'], configured)).toEqual([
      'copilot',
      'custom:a'
    ]);
  });
});

describe('describePriority', () => {
  it('lists included providers in order, then everything never tried', () => {
    const entries = [entry('a', { name: 'Local Ollama' }), entry('b', { name: 'Gemini' })];
    const rows = describePriority(['custom:b', 'copilot'], entries);

    expect(rows.filter((r) => r.included).map((r) => r.label)).toEqual(['Gemini', 'GitHub Copilot']);
    expect(rows.filter((r) => !r.included).map((r) => r.token)).toEqual([
      'claude',
      'kiro',
      'generic',
      'custom:a'
    ]);
  });

  it('reports a custom row as disabled so an untried enabled=false entry is visible', () => {
    const rows = describePriority(['custom'], [entry('a', { enabled: false })]);
    expect(rows[0]).toMatchObject({ token: 'custom:a', kind: 'custom', included: true, enabled: false });
  });

  it('falls back to model name then base URL when an entry has no display name', () => {
    const rows = describePriority(['custom'], [entry('a', { name: '', modelName: 'llama3' })]);
    expect(rows[0].label).toBe('llama3');
  });
});
