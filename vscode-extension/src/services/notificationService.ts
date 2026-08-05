/**
 * Notification Service
 * Handles user notifications with rate limiting and output logging
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { NotificationService as INotificationService, IngestResponse, ProcessResponse } from '../types';

/**
 * Manages user notifications and extension logging
 */
export class NotificationService implements INotificationService {
  private outputChannel: vscode.OutputChannel;
  private lastNotificationTime: number = 0;
  private notificationRateLimit: number = 10000; // 10 seconds
  private queuedNotifications: string[] = [];
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Speckit Auto-AI');
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  }

  /**
   * Show processing started notification
   */
  public processing(fileName: string): void {
    this.info(`Processing: ${fileName}`);
    this.statusBarItem.text = `$(sync~spin) Speckit: Processing ${fileName}`;
    this.statusBarItem.show();
  }

  /**
   * Show success notification with rate limiting
   */
  public success(result: IngestResponse): void {
    const now = Date.now();
    const message = `PDF generated: ${result.pdf_location}`;

    this.info(message);
    this.statusBarItem.text = `$(check) Speckit: Success`;
    this.statusBarItem.show();

    // Hide status after 3 seconds
    setTimeout(() => this.statusBarItem.hide(), 3000);

    // Check rate limiting
    if (now - this.lastNotificationTime < this.notificationRateLimit) {
      // Queue notification
      this.queuedNotifications.push(message);
      return;
    }

    this.lastNotificationTime = now;

    // Show notification with PDF link
    vscode.window.showInformationMessage(
      message,
      'Open PDF',
      'Show Logs'
    ).then(selection => {
      if (selection === 'Open PDF') {
        this.openPDF(result.pdf_location);
      } else if (selection === 'Show Logs') {
        this.showLogs();
      }
    });

    // Show aggregate if queued notifications exist
    if (this.queuedNotifications.length > 0) {
      setTimeout(() => this.showAggregateNotifications(), 1000);
    }
  }

  /**
   * Show a partial-success notification: the PDF was generated, but the
   * backend dropped one or more ungrounded diagrams/glossary entries after
   * retries were exhausted (Requirement 10.4's "Partial Success" case).
   */
  public partial(response: ProcessResponse): void {
    const dropped = response.dropped_items ?? {};
    const droppedCount = Object.values(dropped).reduce(
      (total, items) => total + (Array.isArray(items) ? items.length : 0),
      0
    );
    const message = `PDF generated with ${droppedCount} item(s) excluded (evidence not grounded): ${response.pdf_location}`;

    this.info(message, dropped);
    this.statusBarItem.text = '$(warning) Speckit: Partial Success';
    this.statusBarItem.show();
    setTimeout(() => this.statusBarItem.hide(), 5000);

    vscode.window.showWarningMessage(message, 'Open PDF', 'Show Logs').then(selection => {
      if (selection === 'Open PDF' && response.pdf_location) {
        this.openPDF(response.pdf_location);
      } else if (selection === 'Show Logs') {
        this.showLogs();
      }
    });
  }

  /**
   * Show error notification. `onRetry`, when provided, adds a "Retry"
   * action that re-runs whatever failed - the caller (TransformPipeline)
   * owns what "retry" actually means (re-processing the same file), this
   * service only surfaces the button and invokes the callback.
   */
  public error(error: Error, onRetry?: () => void): void {
    const message = `Speckit processing failed: ${error.message}`;

    this.logError(message, error);
    this.statusBarItem.text = `$(error) Speckit: Error`;
    this.statusBarItem.show();

    // Hide status after 5 seconds
    setTimeout(() => this.statusBarItem.hide(), 5000);

    const actions = onRetry ? ['Retry', 'Show Details', 'Show Logs'] : ['Show Details', 'Show Logs'];
    vscode.window.showErrorMessage(message, ...actions).then(selection => {
      if (selection === 'Retry') {
        onRetry?.();
      } else if (selection === 'Show Details') {
        this.outputChannel.show();
      } else if (selection === 'Show Logs') {
        this.showLogs();
      }
    });
  }

  /**
   * Show progress for multiple files
   */
  public progress(current: number, total: number): void {
    const message = `Processing files: ${current}/${total}`;
    this.info(message);
    this.statusBarItem.text = `$(sync~spin) Speckit: ${current}/${total}`;
    this.statusBarItem.show();
  }

  /**
   * Show extension logs
   */
  public showLogs(): void {
    this.outputChannel.show();
  }

  /**
   * Warn that a file was processed with the rule-based (non-AI) fallback -
   * no AI summarization, diagrams, glossary, or (for tasks.md) friendly
   * task descriptions. Unlike warn() (output-channel log only, easy to miss
   * since nothing prompts the user to go look), this also shows a popup:
   * a document silently degrading to the crude fallback with zero visible
   * indication was the exact failure mode Requirement-driven fixes here are
   * meant to close.
   */
  public fallbackWarning(sourcePath: string): void {
    const message = `${sourcePath} was processed with the rule-based fallback (no AI provider available or the AI request failed) - PDF/board content will be lower quality than usual for this file.`;
    this.warn(message);

    vscode.window.showWarningMessage(message, 'Show Logs').then(selection => {
      if (selection === 'Show Logs') {
        this.showLogs();
      }
    });
  }

  /**
   * Log info message
   */
  public info(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] INFO: ${message}`;
    this.outputChannel.appendLine(formatted);
    
    if (args.length > 0) {
      this.outputChannel.appendLine(JSON.stringify(args, null, 2));
    }
  }

  /**
   * Log warning message
   */
  public warn(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] WARN: ${message}`;
    this.outputChannel.appendLine(formatted);
    
    if (args.length > 0) {
      this.outputChannel.appendLine(JSON.stringify(args, null, 2));
    }
  }

  /**
   * Log error message
   */
  public logError(message: string, error: Error): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] ERROR: ${message}`;
    this.outputChannel.appendLine(formatted);
    this.outputChannel.appendLine(`  ${error.message}`);
    
    if (error.stack) {
      this.outputChannel.appendLine(`  Stack: ${error.stack}`);
    }
  }

  /**
   * Log debug message (only if debug logging is enabled)
   */
  public debug(message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] DEBUG: ${message}`;
    this.outputChannel.appendLine(formatted);
    
    if (args.length > 0) {
      this.outputChannel.appendLine(JSON.stringify(args, null, 2));
    }
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.outputChannel.dispose();
    this.statusBarItem.dispose();
  }

  /**
   * Open PDF in default viewer.
   *
   * The backend (both /api/process and the legacy /api/artifacts/ingest-*
   * endpoints) returns pdf_location as an absolute filesystem path on the
   * machine running the backend (e.g. DOC_OUTPUT_DIR/{artifact_id}.pdf) -
   * not a path relative to the VS Code workspace. Joining an absolute path
   * onto the workspace root URI silently produces a nonexistent path, which
   * is why "PDF file not found" showed up even though the PDF was created.
   *
   * On Windows, pdf_location can be a driveless absolute path (e.g.
   * "/tmp/doc-output/x.pdf", from a Linux-style DOC_OUTPUT_DIR bind-mounted
   * from Docker). path.resolve() and Node's fs APIs quietly resolve that
   * against the current drive, so vscode.workspace.fs.stat() below succeeds
   * - but vscode.env.openExternal() hands the path to the OS shell
   * (ShellExecute), which does NOT do that same implicit drive resolution
   * and fails with a generic "error opening external program" even though
   * the file genuinely exists. path.resolve() first to force in the drive
   * letter so both APIs agree on the same real path.
   */
  private async openPDF(pdfPath: string): Promise<void> {
    try {
      const fullPath = path.isAbsolute(pdfPath)
        ? vscode.Uri.file(path.resolve(pdfPath))
        : this.resolveRelativeToWorkspace(pdfPath);

      if (!fullPath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      // Check if file exists
      try {
        await vscode.workspace.fs.stat(fullPath);
      } catch {
        vscode.window.showErrorMessage(`PDF file not found: ${pdfPath}`);
        return;
      }

      // Open in external viewer
      await vscode.env.openExternal(fullPath);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open PDF: ${error.message}`);
    }
  }

  /**
   * Resolve a workspace-relative pdf_location against the first open
   * workspace folder. Only used as a fallback for relative paths; the
   * backend currently always returns absolute paths.
   */
  private resolveRelativeToWorkspace(pdfPath: string): vscode.Uri | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }
    return vscode.Uri.joinPath(workspaceFolders[0].uri, pdfPath);
  }

  /**
   * Show aggregate notifications for queued items
   */
  private showAggregateNotifications(): void {
    if (this.queuedNotifications.length === 0) {
      return;
    }

    const count = this.queuedNotifications.length;
    const message = `${count} additional PDF${count > 1 ? 's' : ''} generated successfully`;

    vscode.window.showInformationMessage(
      message,
      'Show Logs'
    ).then(selection => {
      if (selection === 'Show Logs') {
        this.showLogs();
      }
    });

    // Clear queue
    this.queuedNotifications = [];
  }
}
