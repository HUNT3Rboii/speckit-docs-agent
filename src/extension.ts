import * as path from 'path';
import * as vscode from 'vscode';

import { ConvertOutcome, DocumentEntry, MermaidResult } from '../shared/protocol';
import { BackendProcess } from './backend/process';
import { findMermaidBlocks } from './markdown/mermaid';
import { SpeckitPanel } from './webview/panel';

interface ConvertResponse {
  pdfPath: string;
  typstSource: string;
  warnings: string[];
}

const MARKDOWN_GLOB = '**/*.md';
const EXCLUDED = '**/{node_modules,.git,out,dist,.venv,bin}/**';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Speckit Preview');
  context.subscriptions.push(output);

  // Per-user, cleaned up by VS Code on uninstall. Never a path the extension
  // invents under the home directory.
  const storagePath = context.globalStorageUri.fsPath;

  const backend = new BackendProcess(context.extensionPath, storagePath, output);
  context.subscriptions.push(backend);

  const handleWebviewRequest = (method: string, params: Record<string, unknown>): Promise<unknown> =>
    routeWebviewRequest(method, params, backend, output);

  context.subscriptions.push(
    vscode.commands.registerCommand('speckitStandalone.convertCurrentFile', () =>
      convertCurrentFile(backend, output)
    ),
    vscode.commands.registerCommand('speckitStandalone.openPanel', () =>
      SpeckitPanel.createOrShow(context, handleWebviewRequest)
    ),
    SpeckitPanel.registerSerializer(context, handleWebviewRequest),
    { dispose: () => SpeckitPanel.active?.dispose() }
  );

  // The panel lists what is on disk, so it has to hear about files appearing
  // and disappearing rather than only refreshing when asked.
  const watcher = vscode.workspace.createFileSystemWatcher(MARKDOWN_GLOB);
  const notifyPanel = () => SpeckitPanel.active?.emit('documentsChanged', {});
  watcher.onDidCreate(notifyPanel);
  watcher.onDidDelete(notifyPanel);
  context.subscriptions.push(watcher);
}

export function deactivate(): void {
  // Disposal runs through context.subscriptions, including the child process.
  // The backend also exits when stdin closes, which covers the cases where
  // deactivate() never runs at all.
}

async function routeWebviewRequest(
  method: string,
  params: Record<string, unknown>,
  backend: BackendProcess,
  output: vscode.OutputChannel
): Promise<unknown> {
  switch (method) {
    case 'listDocuments':
      return { documents: await listDocuments() };

    case 'convertDocument': {
      const target = String(params.path ?? '');
      if (!target) {
        throw new Error('convertDocument needs a path');
      }
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      return convert(document, backend, output);
    }

    case 'openPdf': {
      const target = String(params.path ?? '');
      await vscode.env.openExternal(vscode.Uri.file(target));
      return { opened: true };
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

async function listDocuments(): Promise<DocumentEntry[]> {
  const found = await vscode.workspace.findFiles(MARKDOWN_GLOB, EXCLUDED, 2000);

  return found
    .map((uri) => ({
      path: uri.fsPath,
      label: path.basename(uri.fsPath),
      directory: vscode.workspace.asRelativePath(path.dirname(uri.fsPath), false),
    }))
    .sort((left, right) => left.directory.localeCompare(right.directory) || left.label.localeCompare(right.label));
}

/**
 * The conversion, shared by the command and the panel.
 *
 * Diagrams are rendered before the markdown reaches Python: mermaid needs a
 * DOM, the webview has one, and the backend does not.
 */
async function convert(
  document: vscode.TextDocument,
  backend: BackendProcess,
  output: vscode.OutputChannel
): Promise<ConvertOutcome> {
  const markdown = document.getText();
  const diagrams = await renderDiagrams(markdown, output);

  const result = await backend.request<ConvertResponse>('convert', {
    markdown,
    sourcePath: document.uri.fsPath,
    diagrams: diagrams.map((diagram) => ({ id: diagram.id, svg: diagram.svg, title: diagram.title })),
  });

  for (const warning of result.warnings) {
    output.appendLine(`[warning] ${warning}`);
  }

  return { pdfPath: result.pdfPath, warnings: result.warnings, diagramCount: diagrams.length };
}

async function renderDiagrams(markdown: string, output: vscode.OutputChannel): Promise<MermaidResult[]> {
  const blocks = findMermaidBlocks(markdown);
  if (!blocks.length) {
    return [];
  }

  const panel = SpeckitPanel.active;
  if (!panel) {
    // Without a panel there is no browser to render in. The backend prints the
    // diagram source instead, so the document still converts.
    output.appendLine(
      `[info] ${blocks.length} mermaid diagram(s) skipped: open the Speckit panel to render them.`
    );
    return [];
  }

  const rendered = await panel.renderMermaid(blocks);
  for (const diagram of rendered) {
    if (diagram.error) {
      output.appendLine(`[warning] mermaid could not render ${diagram.id}: ${diagram.error}`);
    }
  }

  return rendered.filter((diagram) => diagram.svg);
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

  if (!document.getText().trim()) {
    void vscode.window.showWarningMessage('This file is empty.');
    return;
  }

  try {
    const outcome = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Building PDF…', cancellable: false },
      () => convert(document, backend, output)
    );

    const openAction = 'Open PDF';
    const choice = await vscode.window.showInformationMessage(
      outcome.warnings.length
        ? `PDF ready, with ${outcome.warnings.length} warning(s). See the output channel.`
        : 'PDF ready.',
      openAction
    );

    if (choice === openAction) {
      await vscode.env.openExternal(vscode.Uri.file(outcome.pdfPath));
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
