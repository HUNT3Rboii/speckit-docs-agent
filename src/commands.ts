import * as vscode from 'vscode';

import { BackendProcess } from './backend/process';
import { CustomModel, discoverModels, readCustomModels, resolveProviders } from './ai/providers';

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
      { location: vscode.ProgressLocation.Notification, title: `Asking ${target.endpoint}…` },
      () => discoverModels(target)
    );

    if (!discovered.length) {
      void vscode.window.showWarningMessage('That endpoint reported no models.');
      return;
    }

    const chosen = await vscode.window.showQuickPick(discovered, {
      title: `Models available at ${target.endpoint}`,
      placeHolder: 'Pick one to save as this provider’s model',
    });
    if (!chosen) {
      return;
    }

    await updateCustomModel(target.id, (entry) => ({ ...entry, model: chosen }));
    output.appendLine(`[providers] ${target.id} now uses ${chosen}`);
    void vscode.window.showInformationMessage(`${target.label ?? target.id} will use ${chosen}.`);
  } catch (error) {
    const message = describe(error);
    output.appendLine(`[providers] discovery failed: ${message}`);
    void vscode.window.showErrorMessage(`Could not list models: ${message}`);
  }
}

/**
 * Add, edit, enable or reorder providers.
 *
 * Built from quick picks rather than a bespoke webview. The old panel existed
 * because the settings it edited were awkward to reach; these are ordinary
 * settings, and the editor already has good UI for those.
 */
export async function manageProviders(output: vscode.OutputChannel): Promise<void> {
  const available = await resolveProviders(() => {});
  const models = readCustomModels();

  const actions = [
    { label: '$(add) Add a provider…', action: 'add' as const },
    { label: '$(edit) Edit a provider…', action: 'edit' as const },
    { label: '$(list-ordered) Reorder which is tried first…', action: 'reorder' as const },
    { label: '$(search) Discover models for a provider…', action: 'discover' as const },
    { label: '$(settings-gear) Open these in Settings', action: 'settings' as const },
  ];

  const choice = await vscode.window.showQuickPick(actions, {
    title: 'AI providers',
    placeHolder: available.length
      ? `${available.length} available now: ${available.map((provider) => provider.label).join(', ')}`
      : 'No provider is currently available',
  });

  switch (choice?.action) {
    case 'add':
      return addProvider(output);
    case 'edit':
      return editProvider(models, output);
    case 'reorder':
      return reorderProviders();
    case 'discover':
      return discoverModelsCommand(output);
    case 'settings':
      await vscode.commands.executeCommand('workbench.action.openSettings', 'speckitStandalone');
      return;
    default:
      return;
  }
}

async function addProvider(output: vscode.OutputChannel): Promise<void> {
  const endpoint = await vscode.window.showInputBox({
    title: 'Add a provider (1 of 3)',
    prompt: 'Chat completions endpoint',
    placeHolder: 'http://localhost:11434/v1/chat/completions',
    validateInput: (value) => (value.trim().startsWith('http') ? undefined : 'Must be an http(s) URL'),
  });
  if (!endpoint) {
    return;
  }

  const model = await vscode.window.showInputBox({
    title: 'Add a provider (2 of 3)',
    prompt: 'Model name. Leave blank and use "Discover models" if you are not sure.',
    placeHolder: 'llama3.1',
  });
  if (model === undefined) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    title: 'Add a provider (3 of 3)',
    prompt: 'API key, if this endpoint needs one. Leave blank for a local model.',
    password: true,
  });
  if (apiKey === undefined) {
    return;
  }

  const entry: CustomModel = {
    id: `custom-${Date.now().toString(36)}`,
    enabled: true,
    label: new URL(endpoint).host,
    endpoint: endpoint.trim(),
    model: model.trim(),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  };

  const configuration = vscode.workspace.getConfiguration('speckitStandalone');
  await configuration.update('customModels', [...readCustomModels(), entry], vscode.ConfigurationTarget.Global);

  output.appendLine(`[providers] added ${entry.label} (${entry.endpoint})`);
  void vscode.window.showInformationMessage(`Added ${entry.label}.`);
}

async function editProvider(models: CustomModel[], output: vscode.OutputChannel): Promise<void> {
  const target = await pickCustomModel(models, 'Which provider?');
  if (!target) {
    return;
  }

  const action = await vscode.window.showQuickPick(
    [
      { label: target.enabled ? '$(circle-slash) Disable' : '$(check) Enable', action: 'toggle' as const },
      { label: '$(trash) Remove', action: 'remove' as const },
    ],
    { title: target.label ?? target.id }
  );

  const configuration = vscode.workspace.getConfiguration('speckitStandalone');
  if (action?.action === 'toggle') {
    await updateCustomModel(target.id, (entry) => ({ ...entry, enabled: !entry.enabled }));
    output.appendLine(`[providers] ${target.id} ${target.enabled ? 'disabled' : 'enabled'}`);
  } else if (action?.action === 'remove') {
    await configuration.update(
      'customModels',
      readCustomModels().filter((entry) => entry.id !== target.id),
      vscode.ConfigurationTarget.Global
    );
    output.appendLine(`[providers] removed ${target.id}`);
  }
}

async function reorderProviders(): Promise<void> {
  const kinds = ['copilot', 'claude', 'kiro', 'generic', 'custom'];
  const picked = await vscode.window.showQuickPick(kinds, {
    title: 'Provider priority',
    placeHolder: 'Pick them in the order they should be tried',
    canPickMany: true,
  });

  if (!picked?.length) {
    return;
  }

  await vscode.workspace
    .getConfiguration('speckitStandalone')
    .update('providerPriority', picked, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`Providers will be tried in this order: ${picked.join(', ')}.`);
}

async function pickCustomModel(models: CustomModel[], title: string): Promise<CustomModel | undefined> {
  const picked = await vscode.window.showQuickPick(
    models.map((entry) => ({
      label: entry.label ?? entry.id,
      description: `${entry.model || 'no model set'} · ${entry.enabled ? 'enabled' : 'disabled'}`,
      detail: entry.endpoint,
      entry,
    })),
    { title }
  );
  return picked?.entry;
}

async function updateCustomModel(id: string, change: (entry: CustomModel) => CustomModel): Promise<void> {
  const updated = readCustomModels().map((entry) => (entry.id === id ? change(entry) : entry));
  await vscode.workspace
    .getConfiguration('speckitStandalone')
    .update('customModels', updated, vscode.ConfigurationTarget.Global);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
