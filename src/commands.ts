import * as vscode from 'vscode';

import { BackendProcess } from './backend/process';
import { CustomModelEntry } from './ai/customModels';
import { discoverModels } from './ai/endpoints';
import { readCustomModels } from './ai/providers';
import { CustomModelsPanel } from './webview/customModelsPanel';

/**
 * The commands that are not the conversion itself.
 *
 * All of these existed before; what they talk to has changed. "Check Backend
 * Status" pinged an HTTP server and now pings a child process, and "Manage AI
 * Providers" edits settings rather than a server's configuration.
 */

export function showLogs(output: vscode.OutputChannel): void {
  output.show(true);
}

/**
 * Report whether the backend is alive.
 *
 * There is no URL to be wrong any more, so the failure this surfaces is a
 * process that would not start - a damaged install, or a platform build that
 * cannot execute - rather than a misconfigured address.
 */
export async function checkBackendStatus(backend: BackendProcess, output: vscode.OutputChannel): Promise<void> {
  try {
    const result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Checking the Speckit backend…' },
      () => backend.request<{ ok: boolean; protocol: number }>('ping', {})
    );

    output.appendLine(`[status] backend responded, protocol ${result.protocol}`);
    void vscode.window.showInformationMessage(`Speckit backend is running (protocol ${result.protocol}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[status] backend did not respond: ${message}`);

    const showLog = 'Show Log';
    const choice = await vscode.window.showErrorMessage(`Speckit backend is not responding: ${message}`, showLog);
    if (choice === showLog) {
      output.show(true);
    }
  }
}

/**
 * Stop work that is already running.
 *
 * Best-effort, as it always was: a model request in flight is cancelled through
 * its token, and anything the backend has queued is cleared. Work already
 * inside Typst finishes - it is milliseconds, and interrupting a compile leaves
 * a half-written PDF.
 */
export async function stopProcessing(
  cancellations: Set<vscode.CancellationTokenSource>,
  backend: BackendProcess,
  output: vscode.OutputChannel
): Promise<void> {
  const count = cancellations.size;
  for (const source of cancellations) {
    source.cancel();
  }
  cancellations.clear();

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder) {
    try {
      await backend.request('takeTransformRequests', { projectId: folder.uri.fsPath });
    } catch (error) {
      output.appendLine(`[stop] could not clear queued work: ${describe(error)}`);
    }
  }

  output.appendLine(`[stop] cancelled ${count} in-flight request(s)`);
  void vscode.window.showInformationMessage(
    count ? `Stopped ${count} in-flight request(s).` : 'Nothing was running.'
  );
}

/**
 * Ask a configured endpoint what models it serves, and offer to save one.
 *
 * This exists so a model name can be picked from a list instead of guessed;
 * guessing produces a 404 with nothing useful in it.
 */
export async function discoverModelsCommand(output: vscode.OutputChannel): Promise<void> {
  const models = readCustomModels();
  if (!models.length) {
    const add = 'Add a Provider';
    const choice = await vscode.window.showWarningMessage(
      'No custom providers are configured yet.',
      add
    );
    if (choice === add) {
      await manageProviders(output);
    }
    return;
  }

  const target =
    models.length === 1
      ? models[0]
      : await pickCustomModel(models, 'Which provider should be asked for its model list?');
  if (!target) {
    return;
  }

  try {
    const discovered = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Asking ${target.baseUrl}…` },
      () => discoverModels(target.baseUrl, target.apiKey)
    );

    if (!discovered.length) {
      void vscode.window.showWarningMessage('That endpoint reported no models.');
      return;
    }

    const chosen = await vscode.window.showQuickPick(discovered, {
      title: `Models available at ${target.baseUrl}`,
      placeHolder: 'Pick one to save as this provider’s model',
    });
    if (!chosen) {
      return;
    }

    // The full listing is stored alongside the choice, so the panel's model
    // picker has something to show without going back to the network.
    await updateCustomModel(target.id, (entry) => ({ ...entry, modelName: chosen, models: discovered }));
    output.appendLine(`[providers] ${target.id} now uses ${chosen}`);
    void vscode.window.showInformationMessage(`${target.name} will use ${chosen}.`);
  } catch (error) {
    const message = describe(error);
    output.appendLine(`[providers] discovery failed: ${message}`);
    void vscode.window.showErrorMessage(`Could not list models: ${message}`);
  }
}

/**
 * Add, edit, enable or reorder providers.
 *
 * This is the panel, not a series of quick picks. Quick picks can collect three
 * strings; they cannot show a base URL being rejected, list what an endpoint
 * actually serves, prove it will answer before the first document depends on
 * it, or let every provider - each custom model individually - be dragged into
 * the order it should be tried in.
 */
export async function manageProviders(output: vscode.OutputChannel): Promise<void> {
  CustomModelsPanel.show(output);
}

async function pickCustomModel(
  models: CustomModelEntry[],
  title: string
): Promise<CustomModelEntry | undefined> {
  const picked = await vscode.window.showQuickPick(
    models.map((entry) => ({
      label: entry.name,
      description: `${entry.modelName || 'no model set'} · ${entry.enabled ? 'enabled' : 'disabled'}`,
      detail: entry.baseUrl,
      entry,
    })),
    { title }
  );
  return picked?.entry;
}

/**
 * Rewrites one entry, leaving the rest as they are.
 *
 * The whole array is written back in the normalized shape, so an entry stored
 * by an earlier build is migrated the first time anything touches it rather
 * than being read through the compatibility path forever.
 */
async function updateCustomModel(
  id: string,
  change: (entry: CustomModelEntry) => CustomModelEntry
): Promise<void> {
  const updated = readCustomModels().map((entry) => (entry.id === id ? change(entry) : entry));
  await vscode.workspace
    .getConfiguration('speckitStandalone')
    .update('customModels', updated, vscode.ConfigurationTarget.Global);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
