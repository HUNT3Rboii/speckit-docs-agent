import { EventEmitter } from 'events';

/**
 * Client half of the line-delimited JSON-RPC protocol the Python backend
 * speaks.
 *
 * Kept free of `vscode` and `child_process` imports so it can be driven by a
 * pair of streams in tests. Framing bugs are the kind that only show up under
 * partial reads, which is exactly what a test can force and a running editor
 * cannot.
 */

export interface RpcNotification {
  method: string;
  params: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  method: string;
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly method: string
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

export interface RpcStreams {
  /** Reads chunks from the backend's stdout. */
  onData(listener: (chunk: string) => void): void;
  /** Writes one framed message to the backend's stdin. */
  write(line: string): void;
}

export class RpcClient extends EventEmitter {
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, PendingRequest>();
  private closed = false;

  constructor(private readonly streams: RpcStreams) {
    super();
    streams.onData((chunk) => this.ingest(chunk));
  }

  /**
   * Feed raw output from the backend.
   *
   * Chunk boundaries have nothing to do with message boundaries: a single read
   * can carry half a message, or three of them.
   */
  ingest(chunk: string): void {
    this.buffer += chunk;

    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        this.dispatch(line);
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) {
      return Promise.reject(new RpcError('The backend is not running', -32000, method));
    }

    const id = this.nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, method });
    });

    this.streams.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return promise;
  }

  /** Reject everything still in flight; the backend will never answer now. */
  close(reason: string): void {
    this.closed = true;
    for (const [id, pending] of this.pending) {
      pending.reject(new RpcError(reason, -32000, pending.method));
      this.pending.delete(id);
    }
  }

  private dispatch(line: string): void {
    let message: {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: unknown;
      error?: { code: number; message: string };
    };

    try {
      message = JSON.parse(line);
    } catch {
      // A malformed line means the stream is no longer trustworthy, but it is
      // usually a stray print() in the backend rather than corruption - report
      // it and keep reading.
      this.emit('protocolError', new Error(`Backend sent a line that is not JSON: ${line.slice(0, 200)}`));
      return;
    }

    if (message.id === undefined) {
      if (message.method) {
        this.emit('notification', { method: message.method, params: message.params ?? {} } satisfies RpcNotification);
      }
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      this.emit('protocolError', new Error(`Backend replied to unknown request id ${message.id}`));
      return;
    }
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new RpcError(message.error.message, message.error.code, pending.method));
    } else {
      pending.resolve(message.result);
    }
  }
}
