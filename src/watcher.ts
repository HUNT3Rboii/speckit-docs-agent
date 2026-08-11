import * as vscode from 'vscode';

/**
 * Converts markdown on save, when the user has asked for that.
 *
 * Saves arrive in bursts - format-on-save, a multi-file replace, a branch
 * switch - so each document is debounced rather than converted per keystroke of
 * autosave. Conversions are also serialised per document: two builds of the
 * same file writing one PDF is a corrupt PDF.
 */
export class SaveWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly convert: (document: vscode.TextDocument) => Promise<void>,
    private readonly shouldConvert: (document: vscode.TextDocument) => Promise<boolean>,
    private readonly log: (message: string) => void,
    private readonly debounceMs = 1_500
  ) {
    this.disposables.push(vscode.workspace.onDidSaveTextDocument((document) => this.schedule(document)));
  }

  private schedule(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
      return;
    }

    const key = document.uri.fsPath;
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.run(document);
      }, this.debounceMs)
    );
  }

  private async run(document: vscode.TextDocument): Promise<void> {
    const key = document.uri.fsPath;
    if (this.inFlight.has(key)) {
      return;
    }

    try {
      if (!(await this.shouldConvert(document))) {
        return;
      }
      this.inFlight.add(key);
      await this.convert(document);
    } catch (error) {
      // A save is not a request; failing one must not raise a dialog over
      // whatever the user is actually doing. The log is where this belongs.
      this.log(`[error] automatic conversion of ${key} failed: ${describe(error)}`);
    } finally {
      this.inFlight.delete(key);
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
