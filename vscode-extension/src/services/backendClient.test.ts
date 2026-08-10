/**
 * Unit tests for BackendClient.reportStep - the best-effort status ping the
 * extension uses to surface its own pre-/api/process steps (reading the
 * file, calling the AI provider) on the dashboard. The critical invariant
 * is that it must never throw or delay the real pipeline, regardless of
 * what the backend does.
 */

import { BackendClient } from './backendClient';
import { CancellationRequestedError } from './aiProvider';
import { CancellationSignal } from '../types';

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

  it('never throws when the backend is unreachable, and reports excluded/cancelRequested: false', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false, cancelRequested: false });
  });

  it('never throws when the backend responds with an error status, and reports excluded/cancelRequested: false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false, cancelRequested: false });
  });

  it('reports excluded: true when the backend says the path is excluded', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'excluded' })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', '.specify/templates/spec-template.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: true, cancelRequested: false });
  });

  it('reports excluded: false for a normal (non-excluded) response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', artifact: { id: 'artifact-1' } })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false, cancelRequested: false, artifactId: 'artifact-1' });
  });

  it('reports cancelRequested: true when the artifact metadata flags it', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        artifact: { id: 'artifact-1', metadata: { cancel_requested: true } }
      })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false, cancelRequested: true, artifactId: 'artifact-1' });
  });

  it('reports cancelRequested: false when the artifact has no metadata at all', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', artifact: { id: 'artifact-1' } })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(
      client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai')
    ).resolves.toEqual({ excluded: false, cancelRequested: false, artifactId: 'artifact-1' });
  });

  it('surfaces the artifact id so the caller can start polling checkCancelRequested', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', artifact: { id: 'artifact-42' } })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai');
    expect(result.artifactId).toBe('artifact-42');
  });

  it('leaves artifactId undefined when the response has no artifact (e.g. excluded)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'excluded' })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.reportStep('proj-1', 'specs/demo/spec.md', 'transforming_with_ai');
    expect(result.artifactId).toBeUndefined();
  });
});

describe('BackendClient.checkCancelRequested', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('GETs /api/artifacts/{id}/cancel-status and returns the flag', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cancel_requested: true })
    });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.checkCancelRequested('artifact-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/artifacts/artifact-1/cancel-status');
    expect(options.method).toBe('GET');
    expect(result).toBe(true);
  });

  it('returns false when nothing was requested', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cancel_requested: false })
    }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.checkCancelRequested('artifact-1')).resolves.toBe(false);
  });

  it('returns false, never throws, when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.checkCancelRequested('artifact-1')).resolves.toBe(false);
  });

  it('returns false, never throws, on an error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.checkCancelRequested('artifact-1')).resolves.toBe(false);
  });

  it('URL-encodes the artifact id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ cancel_requested: false }) });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.checkCancelRequested('artifact 1');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/artifacts/artifact%201/cancel-status');
  });
});

describe('BackendClient.getPendingWork', () => {
  const originalFetch = global.fetch;
  const EMPTY = { retryRequests: [], transformRequests: [], automationMode: 'automatic' };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('GETs /api/projects/{projectId}/retry-requests and maps snake_case to camelCase', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retry_requests: [{ artifact_id: 'artifact-1', source_path: 'specs/demo/spec.md' }],
        transform_requests: [{ source_path: 'docs/notes.md' }],
        automation_mode: 'manual'
      })
    });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.getPendingWork('demo-project');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/projects/demo-project/retry-requests');
    expect(options.method).toBe('GET');
    expect(result).toEqual({
      retryRequests: [{ artifactId: 'artifact-1', sourcePath: 'specs/demo/spec.md' }],
      transformRequests: [{ sourcePath: 'docs/notes.md' }],
      automationMode: 'manual'
    });
  });

  it('URL-encodes the project id/name', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ retry_requests: [] }) });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await client.getPendingWork('my project');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/projects/my%20project/retry-requests');
  });

  it('reports nothing pending, never throws, when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.getPendingWork('demo-project')).resolves.toEqual(EMPTY);
  });

  it('reports nothing pending, never throws, on an error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.getPendingWork('demo-project')).resolves.toEqual(EMPTY);
  });

  it('reports nothing pending when the response has no request fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.getPendingWork('demo-project')).resolves.toEqual(EMPTY);
  });

  it('falls back to automatic mode rather than stalling the watcher when the backend is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const result = await client.getPendingWork('demo-project');

    expect(result.automationMode).toBe('automatic');
  });
});

describe('BackendClient.syncProjectFiles', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs the full inventory in snake_case to the project-scoped sync endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
    global.fetch = fetchMock as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const ok = await client.syncProjectFiles('demo-project', [
      { sourcePath: 'docs/notes.md', sizeBytes: 42, modifiedAt: '2024-03-15T10:30:00.000Z' }
    ]);

    expect(ok).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/projects/demo-project/files/sync');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      files: [{ source_path: 'docs/notes.md', size_bytes: 42, modified_at: '2024-03-15T10:30:00.000Z' }]
    });
  });

  it('reports failure, never throws, when the backend is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    await expect(client.syncProjectFiles('demo-project', [])).resolves.toBe(false);
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

  it('aborts the in-flight request and throws CancellationRequestedError (not retried) when the caller cancels', () => {
    // Mirrors what speckit.stopProcessing does: cancel a signal that's
    // already been handed to an in-flight process() call, and expect the
    // actual HTTP request to abort rather than being left to run to
    // completion in the background.
    const fetchMock = jest.fn().mockImplementation((_url: string, options: any) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const err: any = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
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

    const client = new BackendClient('http://localhost:8000', 'dev-key');
    const promise = client.process(minimalRequest(), cancellation);

    requested = true;
    cancelListener?.();

    return expect(promise).rejects.toThrow(CancellationRequestedError).then(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
