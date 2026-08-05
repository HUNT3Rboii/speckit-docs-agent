/**
 * Unit tests for BackendClient.reportStep - the best-effort status ping the
 * extension uses to surface its own pre-/api/process steps (reading the
 * file, calling the AI provider) on the dashboard. The critical invariant
 * is that it must never throw or delay the real pipeline, regardless of
 * what the backend does.
 */

import { BackendClient } from './backendClient';

describe('BackendClient.reportStep', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs to /api/processing-status with the project, source path, and step', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' })
    });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/processing-status');
    expect(JSON.parse(options.body)).toEqual({
      project_id: 'proj-1',
      source_path: 'specs/demo/spec.md',
      step: 'transforming_with_ai'
    });
  });

  it('includes attempt/max_attempts when reporting a client-side correction loop step', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' })
    });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.reportStep('proj-1', 'specs/demo/spec.md', 'correcting', 2, 5);

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      project_id: 'proj-1',
      source_path: 'specs/demo/spec.md',
      step: 'correcting',
      attempt: 2,
      max_attempts: 5
    });
  });

  it('never throws when the backend is unreachable, and reports excluded: false', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false });
  });

  it('never throws when the backend responds with an error status, and reports excluded: false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false });
  });

  it('reports excluded: true when the backend says the path is excluded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'excluded' })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', '.specify/templates/spec-template.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: true });
  });

  it('reports excluded: false for a normal (non-excluded) response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', artifact: { id: 'artifact-1' } })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false });
  });
});

describe('BackendClient.reportKanbanProgress', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs to the project-scoped report-progress endpoint with the task key and status', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ task: { id: 1, board_status: 'in_progress' } })
    });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.reportKanbanProgress('proj-1', 'specs/demo/tasks.md', 'T003', 'in_progress');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/projects/proj-1/kanban-tasks/report-progress');
    expect(JSON.parse(options.body)).toEqual({
      source_path: 'specs/demo/tasks.md',
      task_key: 'T003',
      board_status: 'in_progress'
    });
  });

  it('URL-encodes the project id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.reportKanbanProgress('my project', 'specs/demo/tasks.md', 'T003', 'done');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/projects/my%20project/kanban-tasks/report-progress');
  });

  it('never throws when the task is not yet known to the board (404)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Task not found'
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportKanbanProgress('proj-1', 'specs/demo/tasks.md', 'T003', 'in_progress')
    ).resolves.toBeUndefined();
  });

  it('never throws when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportKanbanProgress('proj-1', 'specs/demo/tasks.md', 'T003', 'done')
    ).resolves.toBeUndefined();
  });
});

describe('BackendClient.process', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function minimalRequest() {
    return {
      project_id: 'proj-1',
      source_path: 'specs/demo/spec.md',
      source_markdown: '# Demo',
      enriched_json: {
        title: 'Demo',
        abstract: 'A demo doc.',
        sections: [],
        diagrams: [],
        glossary: [],
        summaries: { executiveSummary: 'Demo.' }
      },
      retry_count: 0
    } as any;
  }

  it('does not retry when the request times out - a slow-but-working request should not be resubmitted', async () => {
    // Mirrors what AbortSignal.timeout() firing actually produces: fetch
    // rejects with a DOMException named "TimeoutError". Previously this
    // wasn't recognized as non-retriable, so retryWithBackoff retried it
    // up to 3 times - each doomed to the exact same timeout for the exact
    // same reason, with no way to cancel the still-running server-side
    // work, producing ~90+ seconds of apparent "stuck" before finally
    // failing regardless.
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    const fetchMock = jest.fn().mockRejectedValue(timeoutError);
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.process(minimalRequest())).rejects.toThrow(/timed out/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does retry on a real server error (5xx), unlike a timeout', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'unavailable' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.process(minimalRequest());

    expect(result).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses a longer timeout than the default 30s for /api/process specifically', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }) as any;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.process(minimalRequest());

    expect(timeoutSpy).toHaveBeenCalledWith(180000);
  });

  it('reportStep still uses the shorter default timeout, not the /api/process one', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }) as any;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai');

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
  });
});
