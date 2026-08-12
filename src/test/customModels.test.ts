import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeBaseUrl, normalizeEntriesForSave, readEntry } from '../ai/customModels';
import { describePriority, filterPriorityTokens } from '../ai/providerPriority';

/**
 * The rules behind the Custom AI Models panel.
 *
 * None of this imports vscode: the panel is the shell, and everything that
 * decides whether a hand-entered endpoint is usable - or where it sits in the
 * try order - lives here, which is why it can be tested at all.
 */

describe('base URL normalization', () => {
  it('strips the path each caller appends itself', () => {
    // Pasting a full endpoint out of a vendor's docs otherwise produces
    // ".../chat/completions/chat/completions" and a 404 with no visible cause.
    assert.equal(normalizeBaseUrl('http://localhost:11434/v1/chat/completions'), 'http://localhost:11434/v1');
    assert.equal(normalizeBaseUrl('http://localhost:11434/v1/models'), 'http://localhost:11434/v1');
    assert.equal(normalizeBaseUrl('  http://localhost:11434/v1/  '), 'http://localhost:11434/v1');
  });
});

describe('reading a stored entry', () => {
  it('understands what an earlier build wrote', () => {
    const entry = readEntry({
      id: 'local',
      enabled: true,
      label: 'Local Ollama',
      endpoint: 'http://localhost:11434/v1/chat/completions',
      model: 'llama3.1',
    });

    assert.deepEqual(entry, {
      id: 'local',
      enabled: true,
      name: 'Local Ollama',
      baseUrl: 'http://localhost:11434/v1',
      modelName: 'llama3.1',
      apiKey: undefined,
    });
  });

  it('drops an entry with no endpoint at all rather than offering one that can only fail', () => {
    assert.equal(readEntry({ id: 'broken', enabled: true }), null);
  });
});

describe('validating what the panel posts back', () => {
  it('requires a model name only for entries that are enabled', () => {
    const { entries, errors } = normalizeEntriesForSave([
      { id: 'a', enabled: true, baseUrl: 'http://localhost:1234/v1', modelName: '' },
      { id: 'b', enabled: false, baseUrl: 'http://localhost:1234/v1', modelName: '' },
    ]);

    // A half-filled draft is still saved, so the work is not lost; it is only
    // an error once the entry claims to be usable.
    assert.equal(entries.length, 2);
    assert.deepEqual(
      errors.map((error) => [error.id, error.field]),
      [['a', 'modelName']]
    );
  });

  it('rejects a base URL that is not a URL, and keeps the row so the typing survives', () => {
    const { entries, errors } = normalizeEntriesForSave([{ id: 'a', enabled: true, baseUrl: 'localhost:1234' }]);

    assert.equal(entries[0].baseUrl, 'localhost:1234');
    assert.equal(errors[0].field, 'baseUrl');
  });

  it('backfills and de-duplicates ids so a save always targets one row', () => {
    const { entries } = normalizeEntriesForSave([
      { enabled: false, baseUrl: 'http://a.test/v1' },
      { id: 'dup', enabled: false, baseUrl: 'http://b.test/v1' },
      { id: 'dup', enabled: false, baseUrl: 'http://c.test/v1' },
    ]);

    assert.equal(new Set(entries.map((entry) => entry.id)).size, 3);
  });
});

describe('the try order the panel shows', () => {
  const entries = [
    { id: 'one', enabled: true, name: 'Local Ollama', baseUrl: 'http://a.test/v1', modelName: 'llama3.1' },
    { id: 'two', enabled: false, name: 'Gateway', baseUrl: 'http://b.test/v1', modelName: 'gpt-4o' },
  ];

  it('expands a bare "custom" into one row per model', () => {
    const rows = describePriority(['copilot', 'custom'], entries);

    assert.deepEqual(
      rows.filter((row) => row.included).map((row) => row.token),
      ['copilot', 'custom:one', 'custom:two']
    );
  });

  it('lists a provider left out of the order rather than hiding it', () => {
    const rows = describePriority(['custom:one'], entries);
    const excluded = rows.filter((row) => !row.included).map((row) => row.token);

    // Hiding them was the old behaviour, and put a provider back out of reach
    // of anything but hand-edited JSON.
    assert.deepEqual(excluded, ['copilot', 'claude', 'kiro', 'generic', 'custom:two']);
  });

  it('never re-adds what the user removed, and drops references to deleted models', () => {
    const filtered = filterPriorityTokens(['copilot', 'custom:one', 'custom:gone', 'nonsense', 'copilot'], entries);

    assert.deepEqual(filtered, ['copilot', 'custom:one']);
  });
});
