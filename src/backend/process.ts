import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as vscode from 'vscode';

import { RpcClient, RpcNotification } from './rpcClient';
import { RuntimePaths, assertRuntimesPresent, ensureExecutable, resolveRuntimes } from './paths';

const READY_TIMEOUT_MS = 30_000;

export interface BackendReady {
  protocol: number;
  python: string;
  storagePath: string;
}

/**
 * Owns the Python child process: spawn, handshake, shutdown.
 *
 * Spawn returning is not readiness - the interpreter still has to start and the
 * backend still has to import. The first request waits for the backend's own
 * `ready` notification instead of assuming.
 */
export class BackendProcess implements vscode.Disposable {
  private child?: ChildProcessWithoutNullStreams;
  private client?: RpcClient;
  private starting?: Promise<RpcClient>;
  private disposed = false;

  constructor(
    private readonly extensionPath: string,
    private readonly storagePath: string,
    private readonly output: vscode.OutputChannel
  ) {}

  /** Start if needed; concurrent callers share one spawn. */
  async ensureStarted(): Promise<RpcClient> {
    if (this.client) {
      return this.client;
    }
    this.starting ??= this.start();
    return this.starting;
  }

  private async start(): Promise<RpcClient> {
    const paths: RuntimePaths = resolveRuntimes(this.extensionPath);
    assertRuntimesPresent(paths);
    ensureExecutable(paths);

    this.output.appendLine(`Starting backend (${paths.target})`);

    const child = spawn(
      paths.python,
      [paths.serverEntry, '--stdio', '--storage-path', this.storagePath, '--typst', paths.typst],
      {
        cwd: this.extensionPath,
        // Without this the backend inherits whatever the editor was launched
        // with, and a user's PYTHONPATH or PYTHONHOME can shadow the vendored
        // dependencies or point the interpreter at a different stdlib.
        env: { ...process.env, PYTHONPATH: '', PYTHONHOME: '', PYTHONIOENCODING: 'utf-8' },
      }
    ) as ChildProcessWithoutNullStreams;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split('\n').filter(Boolean)) {
        this.output.appendLine(`[backend] ${line}`);
      }
    });

    const client = new RpcClient({
      onData: (listener) => child.stdout.on('data', listener),
      write: (line) => child.stdin.write(line),
    });
    client.on('protocolError', (error: Error) => this.output.appendLine(`[protocol] ${error.message}`));

    this.child = child;

    const ready = new Promise<BackendReady>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`The backend did not report ready within ${READY_TIMEOUT_MS / 1000}s.`));
      }, READY_TIMEOUT_MS);

      client.on('notification', (notification: RpcNotification) => {
        if (notification.method === 'ready') {
          clearTimeout(timer);
          resolve(notification.params as unknown as BackendReady);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Could not start the bundled Python: ${error.message}`));
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        const how = signal ? `signal ${signal}` : `exit code ${code}`;
        client.close(`The backend stopped (${how}).`);
        this.child = undefined;
        this.client = undefined;
        this.starting = undefined;
        if (!this.disposed) {
          this.output.appendLine(`Backend stopped (${how})`);
        }
        reject(new Error(`The backend stopped before it was ready (${how}). See the output channel.`));
      });
    });

    try {
      const info = await ready;
      this.output.appendLine(`Backend ready: Python ${info.python}, protocol ${info.protocol}`);
      this.client = client;
      return client;
    } catch (error) {
      this.starting = undefined;
      this.stopChild();
      throw error;
    }
  }

  async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const client = await this.ensureStarted();
    return client.request<T>(method, params);
  }

  dispose(): void {
    this.disposed = true;
    this.client?.close('The extension is shutting down.');
    this.stopChild();
  }

  private stopChild(): void {
    const child = this.child;
    if (!child) {
      return;
    }
    this.child = undefined;
    this.client = undefined;

    // Closing stdin is the backend's documented shutdown signal; kill() is the
    // backstop for a process that ignores it.
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2_000);
    child.on('exit', () => clearTimeout(timer));
  }
}
