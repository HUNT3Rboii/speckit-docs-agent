/**
 * Watches .speckit-auto-ai/progress/*.json in a workspace folder for
 * task-progress signals dropped by an external agent (GitHub Copilot
 * running /speckit.implement, per the instructions copilotInstructionsMerge
 * provisions) and relays each valid one to a callback. Parsing/validation
 * itself lives in progressSignal.ts (pure, Jest-testable); this file is
 * just the thin vscode.FileSystemWatcher wiring around it.
 */
import * as vscode from 'vscode';
import { parseProgressSignal, ProgressSignal } from './progressSignal';

export class ProgressFileWatcher {
  private watchers: vscode.FileSystemWatcher[] = [];

  /** Starts watching one workspace folder's progress directory. Safe to
   * call once per folder; call dispose() before starting again. */
  public start(folder: vscode.WorkspaceFolder, onSignal: (signal: ProgressSignal) => void): void {
    const pattern = new vscode.RelativePattern(folder, '.speckit-auto-ai/progress/*.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handle = async (uri: vscode.Uri) => {
      let raw: string;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        raw = Buffer.from(bytes).toString('utf8');
      } catch {
        return; // File may have been deleted/renamed between the event and this read.
      }

      const signal = parseProgressSignal(raw);
      if (signal) {
        onSignal(signal);
      }
    };

    watcher.onDidCreate(handle);
    watcher.onDidChange(handle);
    this.watchers.push(watcher);
  }

  public dispose(): void {
    this.watchers.forEach((watcher) => watcher.dispose());
    this.watchers = [];
  }
}
