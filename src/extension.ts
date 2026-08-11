import * as vscode from 'vscode';

import { BackendProcess } from './backend/process';

interface ConvertResult {
  pdfPath: string;
  typstSource: string;
  warnings: string[];
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Speckit Preview');
  context.subscriptions.push(output);

  // Per-user, cleaned up by VS Code on uninstall. Never a path the extension
  // invents under the home directory.
  const storagePath = context.globalStorageUri.fsPath;

  const backend = new BackendProcess(context.extensionPath, storagePath, output);
  context.subscriptions.push(backend);

  context.subscriptions.push(
    vscode.commands.registerCommand('speckitStandalone.convertCurrentFile', () =>
      convertCurrentFile(backend, output)
    )
  );
}

export function deactivate(): void {
  // Disposal is handled through context.subscriptions, including the child
  // process. The backend also exits on stdin close, which covers the cases
  // where deactivate() never runs at all.
}

async function convertCurrentFile(backend: BackendProcess, output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showWarningMessage('Open a markdown file first.');
    return;
  }

  const document = editor.document;
  if (document.languageId !== 'markdown') {
    void vscode.window.showWarningMessage('The active file is not markdown.');
    return;
  }

  const markdown = document.getText();
  if (!markdown.trim()) {
    void vscode.window.showWarningMessage('This file is empty.');
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Building PDF…',
        cancellable: false,
      },
      () =>
        backend.request<ConvertResult>('convert', {
          markdown,
          sourcePath: document.uri.fsPath,
        })
    );

    for (const warning of result.warnings) {
      output.appendLine(`[warning] ${warning}`);
    }

    const openAction = 'Open PDF';
    const choice = await vscode.window.showInformationMessage(
      result.warnings.length
        ? `PDF ready, with ${result.warnings.length} warning(s). See the output channel.`
        : 'PDF ready.',
      openAction
    );

    if (choice === openAction) {
      await vscode.env.openExternal(vscode.Uri.file(result.pdfPath));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[error] ${message}`);

    const showLog = 'Show Log';
    const choice = await vscode.window.showErrorMessage(`Could not build the PDF: ${firstLine(message)}`, showLog);
    if (choice === showLog) {
      output.show();
    }
  }
}

/** Typst errors are multi-line with source excerpts; a toast gets the headline. */
function firstLine(message: string): string {
  return message.split('\n')[0].trim();
}
