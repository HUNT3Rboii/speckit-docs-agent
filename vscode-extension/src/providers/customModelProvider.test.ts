/**
 * Unit tests for CustomModelProvider - the only provider with no vscode
 * import (it talks to an arbitrary HTTP endpoint via fetch, not
 * vscode.lm), so unlike Copilot/Claude/Kiro/Generic it's fully testable
 * here.
 */

import { CustomModelProvider } from './customModelProvider';
import { CancellationRequestedError } from '../services/aiProvider';
import type { CustomModelEntry, CancellationSignal } from '../types';

function baseSettings(overrides: Partial<CustomModelEntry> = {}): CustomModelEntry {
  return {
    id: 'my-ollama',
    enabled: true,
    name: 'My Ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    modelName: 'llama3',
    ...overrides
  };
}

function okResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] })
  };
}

describe('CustomModelProvider.isAvailable', () => {
  it('is available when enabled with a baseUrl and modelName', async () => {
    const provider = new CustomModelProvider(baseSettings());
    expect(await provider.isAvailable()).toBe(true);
  });

  it('is not available when disabled', async () => {
    const provider = new CustomModelProvider(baseSettings({ enabled: false }));
    expect(await provider.isAvailable()).toBe(false);
  });

  it('is not available with no baseUrl', async () => {
    const provider = new CustomModelProvider(baseSettings({ baseUrl: '' }));
    expect(await provider.isAvailable()).toBe(false);
  });

  it('is not available with no modelName', async () => {
    const provider = new CustomModelProvider(baseSettings({ modelName: '' }));
    expect(await provider.isAvailable()).toBe(false);
  });
});

describe('CustomModelProvider.getUnavailableReason', () => {
  it('returns null when fully configured', () => {
    const provider = new CustomModelProvider(baseSettings());
    expect(provider.getUnavailableReason()).toBeNull();
  });

  it('names "enabled" specifically when disabled, even if other fields are also set', () => {
    const provider = new CustomModelProvider(baseSettings({ enabled: false }));
    expect(provider.getUnavailableReason()).toBe('speckit.customModel.enabled is false');
  });

  it('names "baseUrl" specifically when enabled but baseUrl is empty', () => {
    const provider = new CustomModelProvider(baseSettings({ baseUrl: '' }));
    expect(provider.getUnavailableReason()).toBe('speckit.customModel.baseUrl is empty');
  });

  it('names "baseUrl" specifically when it is whitespace-only', () => {
    const provider = new CustomModelProvider(baseSettings({ baseUrl: '   ' }));
    expect(provider.getUnavailableReason()).toBe('speckit.customModel.baseUrl is empty');
  });

  it('names "modelName" specifically when enabled and baseUrl is set but modelName is empty', () => {
    const provider = new CustomModelProvider(baseSettings({ modelName: '' }));
    expect(provider.getUnavailableReason()).toBe('speckit.customModel.modelName is empty');
  });

  it('checks in a fixed order: enabled, then baseUrl, then modelName', () => {
    // All three are missing at once - the message should point at the
    // first one checked, not an arbitrary or combined one, so fixing it
    // and re-checking reveals the next problem one at a time.
    const provider = new CustomModelProvider(baseSettings({ enabled: false, baseUrl: '', modelName: '' }));
    expect(provider.getUnavailableReason()).toBe('speckit.customModel.enabled is false');
  });
});

describe('CustomModelProvider.getProviderName', () => {
  it('uses the configured display name when set', () => {
    const provider = new CustomModelProvider(baseSettings({ name: 'My Ollama' }));
    expect(provider.getProviderName()).toBe('My Ollama');
  });

  it('falls back to "Custom Model — {modelName}" when no name is set', () => {
    const provider = new CustomModelProvider(baseSettings({ name: '', modelName: 'llama3' }));
    expect(provider.getProviderName()).toBe('Custom Model — llama3');
  });
});

describe('CustomModelProvider timeout', () => {
  // Regression coverage for a live report: Ollama Cloud consistently timed
  // out on a tiny test document at the base class's 45s floor - a remote
  // HTTP endpoint's cold-start latency isn't proportional to document
  // size, so scaling alone can't fix it; the floor itself needed raising.
  it('floors the timeout at 90s for a small document, not the base class default of 45s', () => {
    const provider = new CustomModelProvider(baseSettings());
    expect((provider as any).computeTimeout('short markdown')).toBe(90000);
  });

  it('still scales up to the shared 180s cap for large documents', () => {
    const provider = new CustomModelProvider(baseSettings());
    expect((provider as any).computeTimeout('x'.repeat(100000))).toBe(180000);
  });

  it('scales linearly (3ms/char) between the 90s floor and 180s cap', () => {
    const provider = new CustomModelProvider(baseSettings());
    expect((provider as any).computeTimeout('x'.repeat(40000))).toBe(120000);
  });
});

describe('CustomModelProvider.transform', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs to {baseUrl}/chat/completions with the model name and prompt', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okResponse('{"title": "T", "abstract": "A", "sections": [], "diagrams": [], "glossary": [], "summaries": {"executiveSummary": "S"}}')
    );
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings());
    const result = await provider.transform('# Doc', 'docs/spec.md');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('llama3');
    expect(body.messages).toEqual([{ role: 'user', content: expect.any(String) }]);
    expect(result.title).toBe('T');
    expect(result.source_path).toBe('docs/spec.md');
    expect(result.ai_enhanced).toBe(true);
    expect(result.agent_source).toBe('My Ollama');
  });

  it('strips a trailing slash from baseUrl before appending /chat/completions', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('{"title": "T"}'));
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings({ baseUrl: 'http://localhost:11434/v1/' }));
    await provider.transform('# Doc', 'docs/spec.md').catch(() => undefined);

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('sends an Authorization header when an apiKey is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('{"title": "T"}'));
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings({ apiKey: 'sk-test-123' }));
    await provider.transform('# Doc', 'docs/spec.md').catch(() => undefined);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test-123');
  });

  it('omits the Authorization header when no apiKey is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('{"title": "T"}'));
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings({ apiKey: '' }));
    await provider.transform('# Doc', 'docs/spec.md').catch(() => undefined);

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('throws a clear error on a non-2xx HTTP response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error'
    });
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings());
    await expect(provider.transform('# Doc', 'docs/spec.md')).rejects.toThrow(/HTTP 500/);
  });

  it('throws a clear error when the response is missing choices[0].message.content', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const provider = new CustomModelProvider(baseSettings());
    await expect(provider.transform('# Doc', 'docs/spec.md')).rejects.toThrow(
      /choices\[0\]\.message\.content/
    );
  });

  it('throws CancellationRequestedError immediately if already cancelled', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const cancellation: CancellationSignal = {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose: () => undefined })
    };

    const provider = new CustomModelProvider(baseSettings());
    await expect(provider.transform('# Doc', 'docs/spec.md', undefined, cancellation)).rejects.toThrow(
      CancellationRequestedError
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports cancellation (not a generic error) when cancelled mid-request', async () => {
    let rejectFetch: (err: Error) => void = () => undefined;
    const fetchMock = jest.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        })
    );
    global.fetch = fetchMock as any;

    let requested = false;
    let cancelListener: (() => void) | undefined;
    const cancellation: CancellationSignal = {
      get isCancellationRequested() {
        return requested;
      },
      onCancellationRequested: (listener) => {
        cancelListener = listener;
        return { dispose: () => undefined };
      }
    };

    const provider = new CustomModelProvider(baseSettings());
    const promise = provider.transform('# Doc', 'docs/spec.md', undefined, cancellation);

    requested = true;
    cancelListener?.();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    rejectFetch(abortError);

    await expect(promise).rejects.toThrow(CancellationRequestedError);
  });
});
