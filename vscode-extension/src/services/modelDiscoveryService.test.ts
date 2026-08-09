/**
 * Unit tests for discoverModels - hitting a custom provider's
 * OpenAI-compatible GET {baseUrl}/models listing so a user can pick a real
 * model id instead of typing one by hand.
 */

import { discoverModels, probeChatCompletion } from './modelDiscoveryService';

describe('discoverModels', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('GETs {baseUrl}/models and returns the ids from data[]', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'llama3.1:70b' }, { id: 'qwen2.5' }] })
    });
    global.fetch = fetchMock as any;

    const result = await discoverModels('http://localhost:11434/v1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/models');
    expect(options.method).toBe('GET');
    expect(result).toEqual(['llama3.1:70b', 'qwen2.5']);
  });

  it('strips a trailing slash from baseUrl before appending /models', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'llama3' }] }) });
    global.fetch = fetchMock as any;

    await discoverModels('http://localhost:11434/v1/');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/models');
  });

  it('sends an Authorization header when an apiKey is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'llama3' }] }) });
    global.fetch = fetchMock as any;

    await discoverModels('http://localhost:11434/v1', 'secret-key');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer secret-key');
  });

  it('omits the Authorization header when no apiKey is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'llama3' }] }) });
    global.fetch = fetchMock as any;

    await discoverModels('http://localhost:11434/v1');

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('filters out entries with a missing or non-string id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'llama3' }, { id: 42 }, {}, { id: '' }] })
    });
    global.fetch = fetchMock as any;

    const result = await discoverModels('http://localhost:11434/v1');
    expect(result).toEqual(['llama3']);
  });

  it('throws a clear error on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'
    }) as any;

    await expect(discoverModels('https://ollama.com/v1', 'bad-key')).rejects.toThrow(
      'GET https://ollama.com/v1/models returned HTTP 401: invalid api key'
    );
  });

  it('throws a clear error when the response is not valid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Unexpected token');
      }
    }) as any;

    await expect(discoverModels('http://localhost:11434/v1')).rejects.toThrow('did not return valid JSON');
  });

  it('throws a clear error when the response has no data array', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) }) as any;

    await expect(discoverModels('http://localhost:11434/v1')).rejects.toThrow(
      'did not return the expected {"data": [...]} shape'
    );
  });

  it('throws a clear error when data is present but empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }) as any;

    await expect(discoverModels('http://localhost:11434/v1')).rejects.toThrow('returned no usable model ids');
  });

  it('throws a clear error when the endpoint is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    await expect(discoverModels('http://localhost:11434/v1')).rejects.toThrow(
      'Could not reach http://localhost:11434/v1/models: ECONNREFUSED'
    );
  });
});

describe('probeChatCompletion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const okResponse = (content: string) => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] })
  });

  it('POSTs a minimal completion to {baseUrl}/chat/completions', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('pong'));
    global.fetch = fetchMock as any;

    const result = await probeChatCompletion('http://localhost:11434/v1/', 'secret', 'llama3');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer secret');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('llama3');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(1);
    expect(result).toBe('pong');
  });

  it('omits the Authorization header when no key is configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse('pong'));
    global.fetch = fetchMock as any;

    await probeChatCompletion('http://localhost:11434/v1', undefined, 'llama3');

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('surfaces the status and body of a refused request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"error":{"status":"PERMISSION_DENIED"}}'
    }) as any;

    await expect(
      probeChatCompletion('https://generativelanguage.googleapis.com/v1beta/openai', 'k', 'gemini-2.0-flash')
    ).rejects.toThrow('HTTP 403: {"error":{"status":"PERMISSION_DENIED"}}');
  });

  it('rejects a 200 that is not in the chat-completions shape', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'hi' }) }) as any;

    await expect(probeChatCompletion('http://x.test/v1', undefined, 'm')).rejects.toThrow(
      'choices[0].message.content'
    );
  });

  it('reports an unreachable endpoint', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    await expect(probeChatCompletion('http://localhost:11434/v1', undefined, 'm')).rejects.toThrow(
      'Could not reach http://localhost:11434/v1/chat/completions: ECONNREFUSED'
    );
  });

  it('reports a timeout as a timeout, not as an unreachable host', async () => {
    global.fetch = jest.fn().mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('The operation was aborted')));
      });
    }) as any;

    await expect(probeChatCompletion('http://slow.test/v1', undefined, 'm', 10)).rejects.toThrow(
      'timed out after 0s'
    );
  });
});
