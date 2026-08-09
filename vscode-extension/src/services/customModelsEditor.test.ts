/**
 * Unit tests for the custom-models editor's validation/normalization -
 * the rules the webview form enforces before anything is written to
 * speckit.customModels.
 */

import {
  diagnoseEndpointError,
  generateEntryId,
  normalizeBaseUrl,
  normalizeEntriesForSave
} from './customModelsEditor';

describe('normalizeBaseUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:11434/v1/  ')).toBe('http://localhost:11434/v1');
  });

  it('strips a pasted /chat/completions suffix', () => {
    expect(normalizeBaseUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1'
    );
  });

  it('strips a pasted /models suffix', () => {
    expect(normalizeBaseUrl('https://api.example.com/v1/models')).toBe('https://api.example.com/v1');
  });

  it('leaves an already-correct base URL alone', () => {
    expect(normalizeBaseUrl('https://ollama.com/v1')).toBe('https://ollama.com/v1');
  });

  it('handles empty input', () => {
    expect(normalizeBaseUrl('')).toBe('');
  });
});

describe('normalizeEntriesForSave', () => {
  it('accepts a fully configured entry', () => {
    const { entries, errors } = normalizeEntriesForSave([
      {
        id: 'local-ollama',
        enabled: true,
        name: 'Local Ollama',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        modelName: 'llama3.1:70b'
      }
    ]);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: 'local-ollama',
      enabled: true,
      name: 'Local Ollama',
      baseUrl: 'http://localhost:11434/v1',
      modelName: 'llama3.1:70b'
    });
  });

  it('requires a base URL', () => {
    const { errors } = normalizeEntriesForSave([{ id: 'a', enabled: false, baseUrl: '  ' }]);
    expect(errors).toEqual([{ id: 'a', field: 'baseUrl', message: 'Base URL is required.' }]);
  });

  it('rejects a base URL that is not http(s)', () => {
    const { errors } = normalizeEntriesForSave([
      { id: 'a', enabled: false, baseUrl: 'localhost:11434/v1' }
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('baseUrl');
  });

  it('requires modelName only when the entry is enabled', () => {
    const disabled = normalizeEntriesForSave([
      { id: 'a', enabled: false, baseUrl: 'http://localhost:11434/v1', modelName: '' }
    ]);
    expect(disabled.errors).toEqual([]);

    const enabled = normalizeEntriesForSave([
      { id: 'a', enabled: true, baseUrl: 'http://localhost:11434/v1', modelName: '' }
    ]);
    expect(enabled.errors).toHaveLength(1);
    expect(enabled.errors[0].field).toBe('modelName');
  });

  it('normalizes a pasted full endpoint URL rather than rejecting it', () => {
    const { entries, errors } = normalizeEntriesForSave([
      {
        id: 'a',
        enabled: true,
        baseUrl: 'https://api.example.com/v1/chat/completions',
        modelName: 'gpt-4o'
      }
    ]);
    expect(errors).toEqual([]);
    expect(entries[0].baseUrl).toBe('https://api.example.com/v1');
  });

  it('backfills a missing id and de-duplicates repeated ones', () => {
    const { entries } = normalizeEntriesForSave([
      { enabled: false, baseUrl: 'http://a.test/v1' },
      { id: 'dupe', enabled: false, baseUrl: 'http://b.test/v1' },
      { id: 'dupe', enabled: false, baseUrl: 'http://c.test/v1' }
    ]);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('falls back to a positional display name', () => {
    const { entries } = normalizeEntriesForSave([
      { id: 'a', enabled: false, baseUrl: 'http://a.test/v1', name: '   ' }
    ]);
    expect(entries[0].name).toBe('Custom model 1');
  });

  it('keeps a discovered model list and drops non-string members', () => {
    const { entries } = normalizeEntriesForSave([
      {
        id: 'a',
        enabled: false,
        baseUrl: 'http://a.test/v1',
        models: ['llama3', 42, null, 'mistral']
      }
    ]);
    expect(entries[0].models).toEqual(['llama3', 'mistral']);
  });

  it('tolerates a non-array or malformed input', () => {
    expect(normalizeEntriesForSave(undefined).entries).toEqual([]);
    const { entries, errors } = normalizeEntriesForSave([null]);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

describe('generateEntryId', () => {
  it('never collides with an existing id', () => {
    const id = generateEntryId([{ id: 'custom-a' }, { id: 'custom-b' }]);
    expect(id).not.toBe('custom-a');
    expect(id).not.toBe('custom-b');
    expect(id.startsWith('custom-')).toBe(true);
  });
});

describe('diagnoseEndpointError', () => {
  const google = 'https://generativelanguage.googleapis.com/v1beta/openai';

  it('explains a Google 403 as a project-level block, not a bad request', () => {
    const hint = diagnoseEndpointError(google, 'HTTP 403: {"error":{"status":"PERMISSION_DENIED"}}');
    expect(hint).toContain('region');
    expect(hint).toContain('Generative Language API');
  });

  it('explains that a Google 404 can mean a missing API key', () => {
    const hint = diagnoseEndpointError(google, 'GET .../models returned HTTP 404');
    expect(hint).toContain('no API key');
  });

  it('gives a path-shaped hint for a 404 on any other host', () => {
    const hint = diagnoseEndpointError('https://api.example.com/v1', 'HTTP 404');
    expect(hint).toContain('/v1');
    expect(hint).not.toContain('Google');
  });

  it('tells a local server apart from an unreachable remote host', () => {
    expect(diagnoseEndpointError('http://localhost:11434/v1', 'Could not reach ...')).toContain(
      'ollama serve'
    );
    expect(diagnoseEndpointError('https://api.example.com/v1', 'Could not reach ...')).toContain(
      'network'
    );
  });

  it('covers auth, quota, timeout and server-side failures', () => {
    expect(diagnoseEndpointError('https://x.test/v1', 'HTTP 401')).toContain('credentials');
    expect(diagnoseEndpointError('https://x.test/v1', 'HTTP 429')).toContain('quota');
    expect(diagnoseEndpointError('https://x.test/v1', 'HTTP 503')).toContain('endpoint itself');
    expect(diagnoseEndpointError('https://x.test/v1', 'POST ... timed out after 45s')).toContain(
      'cold-starting'
    );
  });

  it('returns null rather than guessing at an unrecognised failure', () => {
    expect(diagnoseEndpointError('https://x.test/v1', 'something entirely new')).toBeNull();
  });
});
