import * as crypto from 'crypto';
import * as vscode from 'vscode';

import { BridgeMessage, MermaidResult, RequestMessage, WEBVIEW_VIEW_TYPE } from '../../shared/protocol';

type RequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

interface PendingHostRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const RENDER_TIMEOUT_MS = 20_000;

/**
 * The webview panel and the message bridge across it.
 *
 * Both directions are request/response with matching ids: postMessage carries
 * no ordering or delivery guarantee, so a reply is only recognisable by the id
 * it quotes.
 */
export class SpeckitPanel {
  private static current?: SpeckitPanel;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly pending = new Map<number, PendingHostRequest>();
  private nextRequestId = 1;
  private disposed = false;

  static createOrShow(context: vscode.ExtensionContext, handler: RequestHandler): SpeckitPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SpeckitPanel.current) {
      SpeckitPanel.current.panel.reveal(column);
      return SpeckitPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(WEBVIEW_VIEW_TYPE, 'Speckit', column, {
      enableScripts: true,
      // The alternative to a serializer is holding the entire DOM in memory for
      // every hidden tab; restoring state on reveal is cheaper.
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
    });

    SpeckitPanel.current = new SpeckitPanel(panel, context, handler);
    return SpeckitPanel.current;
  }

  /** A panel open when the window closed is restored by VS Code, not recreated. */
  static registerSerializer(context: vscode.ExtensionContext, handler: RequestHandler): vscode.Disposable {
    return vscode.window.registerWebviewPanelSerializer(WEBVIEW_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel) {
        panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')],
        };
        SpeckitPanel.current = new SpeckitPanel(panel, context, handler);
      },
    });
  }

  static get active(): SpeckitPanel | undefined {
    return SpeckitPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly handler: RequestHandler
  ) {
    this.panel.webview.html = this.render(context.extensionUri);

    this.panel.webview.onDidReceiveMessage(
      (message: BridgeMessage) => void this.receive(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  /**
   * Ask the webview to render mermaid.
   *
   * Rendering needs a DOM. The host does not have one, and the alternatives -
   * a headless browser, or a third-party HTTP API - were both rejected: one is
   * 150MB per platform, the other sends the user's documents elsewhere.
   */
  async renderMermaid(diagrams: { id: string; code: string; title?: string }[]): Promise<MermaidResult[]> {
    if (!diagrams.length) {
      return [];
    }

    const result = await this.request<{ rendered: MermaidResult[] }>('renderMermaid', { diagrams });
    return result.rendered;
  }

  emit(event: string, payload: Record<string, unknown>): void {
    if (!this.disposed) {
      void this.panel.webview.postMessage({ kind: 'event', event, payload });
    }
  }

  private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (this.disposed) {
      return Promise.reject(new Error('The Speckit panel is closed.'));
    }

    const id = this.nextRequestId++;
    const promise = new Promise<T>((resolve, reject) => {
      // A webview that never answers must not leave the conversion hanging
      // forever - a broken diagram is recoverable, a wedged command is not.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The panel did not answer ${method} within ${RENDER_TIMEOUT_MS / 1000}s.`));
      }, RENDER_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });

    void this.panel.webview.postMessage({ kind: 'request', id, method, params });
    return promise;
  }

  private async receive(message: BridgeMessage): Promise<void> {
    if (message.kind === 'response') {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.kind !== 'request') {
      return;
    }

    const { id, method, params } = message as RequestMessage;
    try {
      const result = await this.handler(method, params);
      void this.panel.webview.postMessage({ kind: 'response', id, result });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      void this.panel.webview.postMessage({ kind: 'response', id, error: text });
    }
  }

  private render(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist');

    // Local files are unreachable by path from a webview; every one has to be
    // converted, or it 404s with nothing in the console to say why.
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'index.js'));
    const nonce = crypto.randomBytes(16).toString('base64');

    // No stylesheet link: the bundle is a single IIFE and Vite inlines the CSS
    // into it, so a <link> here would point at a file that does not exist - and
    // a webview reports that as nothing at all.
    //
    // 'unsafe-inline' for styles is therefore load-bearing twice over: the
    // injected stylesheet, and mermaid measuring text by styling live nodes.
    // Scripts stay nonce-gated, so the concession never extends to executable
    // code.
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <title>Speckit</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    SpeckitPanel.current = undefined;

    for (const pending of this.pending.values()) {
      pending.reject(new Error('The Speckit panel was closed.'));
    }
    this.pending.clear();

    this.panel.dispose();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}
