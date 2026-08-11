import type { BridgeMessage, RequestMessage } from '../../shared/protocol';

/**
 * The webview half of the message bridge.
 *
 * `acquireVsCodeApi()` may be called exactly once per webview - a second call
 * throws - so it is captured here, at module scope, and everything else goes
 * through this file rather than reaching for it again.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi: VsCodeApi = acquireVsCodeApi();

type Handler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const handlers = new Map<string, Handler>();
const listeners = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
let nextId = 1;

window.addEventListener('message', (event: MessageEvent<BridgeMessage>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.kind === 'response') {
    const waiting = pending.get(message.id);
    if (!waiting) {
      return;
    }
    pending.delete(message.id);
    if (message.error) {
      waiting.reject(new Error(message.error));
    } else {
      waiting.resolve(message.result);
    }
    return;
  }

  if (message.kind === 'event') {
    for (const listener of listeners.get(message.event) ?? []) {
      listener(message.payload);
    }
    return;
  }

  if (message.kind === 'request') {
    void respond(message);
  }
});

async function respond(message: RequestMessage): Promise<void> {
  const handler = handlers.get(message.method);
  if (!handler) {
    vscodeApi.postMessage({ kind: 'response', id: message.id, error: `No handler for ${message.method}` });
    return;
  }

  try {
    const result = await handler(message.params);
    vscodeApi.postMessage({ kind: 'response', id: message.id, result });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    vscodeApi.postMessage({ kind: 'response', id: message.id, error: text });
  }
}

/** Call a method on the extension host. */
export function request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const id = nextId++;
  const promise = new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
  });
  vscodeApi.postMessage({ kind: 'request', id, method, params });
  return promise;
}

/** Serve a method the host calls on us - mermaid rendering, today. */
export function handle(method: string, handler: Handler): void {
  handlers.set(method, handler);
}

export function on(event: string, listener: (payload: Record<string, unknown>) => void): () => void {
  const set = listeners.get(event) ?? new Set();
  set.add(listener);
  listeners.set(event, set);
  return () => set.delete(listener);
}

/**
 * A hidden tab is destroyed, not paused. Anything worth surviving that has to
 * live here rather than in component state.
 */
export function saveState<T>(state: T): void {
  vscodeApi.setState(state);
}

export function loadState<T>(): T | undefined {
  return vscodeApi.getState<T>();
}
