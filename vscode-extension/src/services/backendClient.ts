/**
 * Backend API Client Service
 * Handles communication with Speckit backend API
 */

import {
  BackendClient as IBackendClient,
  CancellationSignal,
  StructuredJSON,
  IngestResponse,
  IngestRequest,
  PendingWork,
  ProcessRequest,
  ProcessResponse,
  ProjectFileEntry
} from '../types';
import { CancellationRequestedError } from './aiProvider';

/**
 * Client for Speckit backend API with retry logic
 */
/** Default timeout for lightweight endpoints (health checks, step pings). */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * /api/process does real, potentially slow server-side work - evidence
 * validation, diagram rendering (mmdc, per diagram), and WeasyPrint PDF
 * generation - for a document with several diagrams this routinely takes
 * well past 30 seconds. The old 30s timeout, combined with timeouts being
 * (incorrectly) treated as retriable, meant a legitimately-slow-but-
 * working request could never succeed: every attempt got cut off at the
 * same 30s mark, retried, and cut off again, producing ~90+ seconds of
 * apparent silence before finally failing outright - this is what showed
 * up as the pipeline "getting stuck" after using up its correction
 * attempts.
 */
const PROCESS_TIMEOUT_MS = 180000;

export class BackendClient implements IBackendClient {
  private backendUrl: string;
  private apiKey: string;
  private maxRetries: number = 3;
  private retryDelays: number[] = [1000, 2000, 4000]; // Exponential backoff

  constructor(backendUrl: string, apiKey: string = '') {
    this.backendUrl = backendUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  /**
   * Update backend URL
   */
  public setBackendUrl(url: string): void {
    this.backendUrl = url.replace(/\/$/, '');
  }

  /**
   * Update API key
   */
  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  /**
   * Ingest structured document to backend
   */
  public async ingest(data: StructuredJSON): Promise<IngestResponse> {
    // Construct request payload
    const payload: IngestRequest = {
      project_id: this.extractProjectId(data.source_path),
      source_path: data.source_path,
      structured_json: data
    };

    // Try ingestion with retry logic
    return await this.retryWithBackoff(async () => {
      const response = await this.makeRequest('/api/artifacts/ingest-structured', payload);
      return response as IngestResponse;
    });
  }

  /**
   * Submit an EnrichedJSON document to the agentic pipeline's /api/process
   * endpoint. Unlike ingest(), the caller (TransformPipeline) is responsible
   * for interpreting a "retry_needed" response and resubmitting with a
   * corrected payload and incremented retry_count -- this method only
   * handles the HTTP round trip and network-level retry/backoff.
   */
  public async process(request: ProcessRequest, cancellation?: CancellationSignal): Promise<ProcessResponse> {
    return await this.retryWithBackoff(async () => {
      const response = await this.makeRequest('/api/process', request, PROCESS_TIMEOUT_MS, cancellation);
      return response as ProcessResponse;
    });
  }

  /**
   * Report a client-side pipeline step (reading the file, calling the AI
   * provider, etc.) so the dashboard can show it before enough is known to
   * call process(). Best-effort telemetry, not part of the critical path:
   * swallows all errors rather than throwing, so a flaky/offline backend
   * never blocks or delays the actual transform-and-submit pipeline.
   *
   * Also doubles as the exclusion check: /api/processing-status responds
   * {status: "excluded"} for a path on the project's exceptions list
   * (see ExceptionsPanel) *before* any artifact is touched. The caller
   * uses this to skip the AI call entirely for an excluded file rather
   * than burning a real request and showing "processing" activity for
   * work the backend was always going to reject anyway - a failed ping
   * (network error, backend down) reports excluded: false rather than
   * throwing, since the ping is best-effort and the authoritative
   * exclusion check still happens server-side in process() regardless.
   */
  public async reportStep(
    projectId: string,
    sourcePath: string,
    step: string,
    attempt?: number,
    maxAttempts?: number
  ): Promise<{ excluded: boolean; cancelRequested: boolean; artifactId?: string }> {
    try {
      const response = await this.makeRequest('/api/processing-status', {
        project_id: projectId,
        source_path: sourcePath,
        step,
        attempt,
        max_attempts: maxAttempts
      });
      return {
        excluded: response?.status === 'excluded',
        cancelRequested: !!response?.artifact?.metadata?.cancel_requested,
        artifactId: response?.artifact?.id
      };
    } catch (error) {
      console.log('[BackendClient] reportStep failed (non-fatal):', error);
      return { excluded: false, cancelRequested: false };
    }
  }

  /**
   * Read-only check of whether cancellation has been requested for an
   * artifact - unlike reportStep, never mutates anything. Polled while the
   * extension's own AI call is still running (see TransformPipeline's
   * per-file cancel-poll), so a cancel requested mid-call can be noticed
   * without waiting for the call to finish and reach the next reportStep
   * checkpoint. Best-effort: a flaky/offline backend just means this poll
   * tick sees nothing, never a thrown error.
   */
  public async checkCancelRequested(artifactId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.backendUrl}/api/artifacts/${encodeURIComponent(artifactId)}/cancel-status`,
        { method: 'GET', headers: this.getHeaders(), signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );
      if (!response.ok) {
        return false;
      }
      const body: any = await response.json();
      return !!body?.cancel_requested;
    } catch (error) {
      console.log('[BackendClient] checkCancelRequested failed (non-fatal):', error);
      return false;
    }
  }

  /**
   * Poll for everything the dashboard has queued up for this project:
   * artifacts flagged for a full reprocess (the Retry button), markdown
   * files flagged for a first-time transform (the Context Files page's
   * "Transform to PDF" button), and the project's automatic/manual mode -
   * see extension.ts's pollForPendingWork.
   *
   * Best-effort: a flaky/offline backend just means nothing new is picked
   * up this tick, never a thrown error. Note the fallback mode is
   * "automatic" - an unreachable backend must not silently stop the file
   * watcher from processing saves.
   */
  public async getPendingWork(projectId: string): Promise<PendingWork> {
    const empty: PendingWork = { retryRequests: [], transformRequests: [], automationMode: 'automatic' };
    try {
      const response = await fetch(
        `${this.backendUrl}/api/projects/${encodeURIComponent(projectId)}/retry-requests`,
        { method: 'GET', headers: this.getHeaders(), signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) }
      );
      if (!response.ok) {
        return empty;
      }
      const body: any = await response.json();
      const retries = Array.isArray(body?.retry_requests) ? body.retry_requests : [];
      const transforms = Array.isArray(body?.transform_requests) ? body.transform_requests : [];
      return {
        retryRequests: retries.map((entry: any) => ({
          artifactId: entry.artifact_id,
          sourcePath: entry.source_path
        })),
        transformRequests: transforms.map((entry: any) => ({ sourcePath: entry.source_path })),
        automationMode: body?.automation_mode === 'manual' ? 'manual' : 'automatic'
      };
    } catch (error) {
      console.log('[BackendClient] getPendingWork failed (non-fatal):', error);
      return empty;
    }
  }

  /**
   * Push the project's complete current markdown inventory. Complete, not
   * a delta: the backend has no filesystem visibility of its own, so a
   * full replace is the only way a file deleted while the extension was
   * shut down ever disappears from the dashboard's Context Files page.
   *
   * Best-effort, like the other side-channel calls here - a failed sync
   * just means the tab is one tick stale, never a disrupted pipeline.
   */
  public async syncProjectFiles(projectId: string, files: ProjectFileEntry[]): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.backendUrl}/api/projects/${encodeURIComponent(projectId)}/files/sync`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            files: files.map((file) => ({
              source_path: file.sourcePath,
              size_bytes: file.sizeBytes,
              modified_at: file.modifiedAt
            }))
          }),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
        }
      );
      return response.ok;
    } catch (error) {
      console.log('[BackendClient] syncProjectFiles failed (non-fatal):', error);
      return false;
    }
  }

  /**
   * Relay a live task-progress signal (see progressFileWatcher.ts) to the
   * backend. Best-effort, like reportStep(): a task the board doesn't know
   * about yet (404, e.g. tasks.md hasn't been processed once already) or a
   * flaky/offline backend must never throw or otherwise disrupt anything -
   * this is a side-channel convenience signal, not part of the critical
   * processing pipeline.
   */
  public async reportKanbanProgress(
    projectId: string,
    sourcePath: string,
    taskKey: string,
    boardStatus: string
  ): Promise<void> {
    try {
      await this.makeRequest(`/api/projects/${encodeURIComponent(projectId)}/kanban-tasks/report-progress`, {
        source_path: sourcePath,
        task_key: taskKey,
        board_status: boardStatus
      });
    } catch (error) {
      console.log('[BackendClient] reportKanbanProgress failed (non-fatal):', error);
    }
  }

  /**
   * Check backend health/availability
   */
  public async checkHealth(): Promise<boolean> {
    try {
      // Try primary URL
      const primaryHealthy = await this.checkHealthEndpoint(this.backendUrl);
      if (primaryHealthy) {
        return true;
      }

      // Try bridge server URL if primary fails
      if (!this.backendUrl.includes('host.docker.internal')) {
        const bridgeUrl = this.backendUrl.replace('localhost', 'host.docker.internal');
        console.log('[BackendClient] Trying bridge server URL:', bridgeUrl);
        
        const bridgeHealthy = await this.checkHealthEndpoint(bridgeUrl);
        if (bridgeHealthy) {
          // Update backend URL to use bridge
          this.backendUrl = bridgeUrl;
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[BackendClient] Health check failed:', error);
      return false;
    }
  }

  /**
   * Check health of specific endpoint
   */
  private async checkHealthEndpoint(baseUrl: string): Promise<boolean> {
    try {
      const healthUrl = `${baseUrl}/health`;
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      return response.ok;
    } catch (error) {
      // Try alternative health endpoint
      try {
        const altHealthUrl = `${baseUrl}/api/health`;
        const response = await fetch(altHealthUrl, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(5000)
        });

        return response.ok;
      } catch (altError) {
        return false;
      }
    }
  }

  /**
   * Make HTTP request to backend
   */
  private async makeRequest(
    endpoint: string,
    payload: any,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    cancellation?: CancellationSignal
  ): Promise<any> {
    const url = `${this.backendUrl}${endpoint}`;

    console.log('[BackendClient] Making request to:', url);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
        signal: this.buildAbortSignal(timeoutMs, cancellation)
      });
    } catch (error: any) {
      // The user cancelling (speckit.stopProcessing) aborts the same
      // signal a timeout would - check which one actually happened so
      // cancellation is reported (and handled) as a cancellation, not a
      // generic timeout error.
      if (cancellation?.isCancellationRequested) {
        throw new CancellationRequestedError();
      }

      // A client-side timeout means the server is (probably) still working,
      // not that the request failed - retrying fires an entirely new
      // request while the old one may still be running server-side with no
      // way to cancel it, so a slow-but-legitimate submission could end up
      // being processed multiple times concurrently for no benefit (every
      // retry hits the exact same timeout for the exact same reason).
      // Surfacing it immediately, once, is both faster and safer than
      // retrying something retrying can't fix.
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        const timeoutError: any = new Error(
          `Request to ${endpoint} timed out after ${timeoutMs}ms`
        );
        timeoutError.cause = 'NO_RETRY';
        throw timeoutError;
      }
      throw error;
    }

    if (!response.ok) {
      const errorText = await response.text();

      // Check if this is a client error (4xx) - don't retry
      if (response.status >= 400 && response.status < 500) {
        const error: any = new Error(`Client error ${response.status}: ${errorText}`);
        error.cause = 'NO_RETRY';
        throw error;
      }

      // Server error (5xx) - will retry
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Builds a single AbortSignal that fires on whichever comes first: the
   * request's own timeout, or the caller's cancellation (if provided) -
   * so speckit.stopProcessing actually aborts an in-flight HTTP request
   * instead of only preventing a *future* one.
   */
  private buildAbortSignal(timeoutMs: number, cancellation?: CancellationSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!cancellation) {
      return timeoutSignal;
    }

    const cancelController = new AbortController();
    if (cancellation.isCancellationRequested) {
      cancelController.abort();
    } else {
      cancellation.onCancellationRequested(() => cancelController.abort());
    }

    return AbortSignal.any([timeoutSignal, cancelController.signal]);
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry on cancellation - the user asked everything to stop,
        // not for another attempt.
        if (error instanceof CancellationRequestedError) {
          throw error;
        }

        // Don't retry on client errors (4xx)
        if (error.cause === 'NO_RETRY' || (error.message && error.message.includes('Client error'))) {
          console.error('[BackendClient] Client error, not retrying:', error.message);
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries - 1) {
          break;
        }

        // Wait before retry
        const delay = this.retryDelays[attempt] || this.retryDelays[this.retryDelays.length - 1];
        console.log(`[BackendClient] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw new Error(`Backend request failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract project ID from source path
   */
  private extractProjectId(sourcePath: string): string {
    // Extract project name from path (first directory or filename)
    const parts = sourcePath.split(/[/\\]/);
    const projectName = parts.length > 1 ? parts[0] : parts[parts.length - 1].replace('.md', '');
    return projectName || 'default-project';
  }
}
