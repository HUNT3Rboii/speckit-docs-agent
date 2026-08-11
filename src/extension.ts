import * as path from 'path';
import * as vscode from 'vscode';

import { ConvertOutcome, DocumentEntry, MermaidResult } from '../shared/protocol';
import { EMPTY_ENRICHMENT, ProposedEnrichment, proposeEnrichment } from './ai/enrich';
import { BackendProcess } from './backend/process';
import { findMermaidBlocks } from './markdown/mermaid';
import { SaveWatcher } from './watcher';
import { SpeckitPanel } from './webview/panel';

interface ConvertResponse {
  pdfPath: string;
  typstSource: string | null;
  warnings: string[];
  dropped?: { kind: string; label: string; reason: string }[];
  reused: boolean;
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
    vscode.commands.registerCommand('speckitStandalone.toggleConvertOnSave', () => toggleConvertOnSave()),
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

  context.subscriptions.push(
    new SaveWatcher(
      async (document) => {
        await convert(document, backend, output);
        SpeckitPanel.active?.emit('documentsChanged', {});
      },
      (document) => shouldConvertOnSave(document, backend),
      (message) => output.appendLine(message),
      vscode.workspace.getConfiguration('speckitStandalone').get<number>('debounceMs', 1500)
    )
  );
}

/**
 * Whether a saved file should be converted without being asked for.
 *
 * Two gates, and both are the user's: the setting, and the per-file exception
 * list. Converting a file someone has explicitly excluded is worse than not
 * converting at all.
 */
async function shouldConvertOnSave(document: vscode.TextDocument, backend: BackendProcess): Promise<boolean> {
  if (!vscode.workspace.getConfiguration('speckitStandalone').get<boolean>('convertOnSave', false)) {
    return false;
  }

  const { excluded } = await backend.request<{ excluded: boolean }>('isExcepted', {
    projectId: workspaceKeyFor(document.uri),
    sourcePath: document.uri.fsPath,
  });
  return !excluded;
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
  output: vscode.OutputChannel,
  options: { force?: boolean } = {}
): Promise<ConvertOutcome> {
  const markdown = document.getText();
  const enrichment = await enrich(markdown, output);

  // AI-proposed diagrams are appended to the ones already written by hand, so
  // both kinds render through the same path.
  const inlineBlocks = findMermaidBlocks(markdown);
  const proposedBlocks = enrichment.diagrams.map((diagram, index) => ({
    id: `ai-${index + 1}`,
    code: diagram.mermaid,
    title: diagram.title,
  }));

  const diagrams = await renderDiagrams([...inlineBlocks, ...proposedBlocks], output);

  const result = await backend.request<ConvertResponse>('convert', {
    markdown,
    sourcePath: document.uri.fsPath,
    projectId: workspaceKeyFor(document.uri),
    projectName: projectNameFor(document.uri),
    force: options.force ?? false,
    enrichment,
    diagrams: diagrams.map((diagram) => ({ id: diagram.id, svg: diagram.svg, title: diagram.title })),
  });

  for (const item of result.dropped ?? []) {
    // Naming what was removed is the point: a silent drop looks like a bug, and
    // the user is the only one who can tell whether the model was wrong or the
    // document was unclear.
    output.appendLine(`[dropped] ${item.kind} "${item.label}" - ${item.reason}`);
  }

  if (result.reused) {
    output.appendLine(`[info] ${path.basename(document.uri.fsPath)} is unchanged; kept the existing PDF.`);
  }

  for (const warning of result.warnings) {
    output.appendLine(`[warning] ${warning}`);
  }

  return {
    pdfPath: result.pdfPath,
    warnings: result.warnings,
    diagramCount: diagrams.length,
    reused: result.reused,
  };
}

/**
 * Scope key for stored state.
 *
 * A path is only unique within a workspace: the same checkout opened twice, or
 * two clones of one repository, are different projects with different
 * exceptions and history.
 */
function workspaceKeyFor(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? '';
}

/** The folder name is what the dashboard shows; the path is what identifies it. */
function projectNameFor(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.name ?? 'Workspace';
}

/**
 * Ask the editor's model to annotate the document.
 *
 * Enrichment is optional in every sense: switched off by setting, absent when
 * no model is available, and skipped on any failure. A plain PDF is the
 * document without annotation, which is a perfectly good outcome; a failed
 * conversion is not.
 */
async function enrich(markdown: string, output: vscode.OutputChannel): Promise<ProposedEnrichment> {
  const enabled = vscode.workspace.getConfiguration('speckitStandalone').get<boolean>('enrich', true);
  if (!enabled) {
    return EMPTY_ENRICHMENT;
  }

  const cancellation = new vscode.CancellationTokenSource();
  try {
    return await proposeEnrichment(markdown, cancellation.token, (message) => output.appendLine(`[ai] ${message}`));
  } catch (error) {
    output.appendLine(`[ai] enrichment skipped: ${error instanceof Error ? error.message : String(error)}`);
    return EMPTY_ENRICHMENT;
  } finally {
    cancellation.dispose();
  }
}

async function renderDiagrams(
  blocks: { id: string; code: string; title?: string }[],
  output: vscode.OutputChannel
): Promise<MermaidResult[]> {
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

async function toggleConvertOnSave(): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('speckitStandalone');
  const next = !configuration.get<boolean>('convertOnSave', false);

  // Workspace scope, not global: whether a project rebuilds its PDFs on every
  // save is a property of the project, not of the person.
  await configuration.update('convertOnSave', next, vscode.ConfigurationTarget.Workspace);
  void vscode.window.showInformationMessage(`Convert on save is now ${next ? 'on' : 'off'} for this workspace.`);
}

/** Typst errors are multi-line with source excerpts; a toast gets the headline. */
function firstLine(message: string): string {
  return message.split('\n')[0].trim();
}
