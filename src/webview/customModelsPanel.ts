/**
 * Custom AI Models editor (webview panel).
 *
 * Adding a custom model otherwise means hand-editing the
 * colophon.customModels array in settings.json: the VS Code settings
 * UI renders an array-of-objects setting as an "Edit in settings.json" link and
 * nothing else, so every field - including which of them are required and what
 * a valid baseUrl looks like - has to be typed blind, with no feedback until an
 * actual document transform fails. This panel is that same setting with a real
 * form: add/remove entries, discover the endpoint's real model ids, test
 * reachability before saving, and order every provider - each custom model
 * individually, by name, alongside Copilot/Claude/Kiro/Generic - instead of
 * ordering one opaque "custom" token that stands for all of them at once.
 *
 * All validation/normalization lives in ai/customModels.ts and
 * ai/providerPriority.ts so it can be unit-tested; this file is the
 * vscode-facing shell (panel lifecycle, message plumbing, settings writes).
 */

import * as vscode from 'vscode';

import { diagnoseEndpointError, normalizeBaseUrl, normalizeEntriesForSave } from '../ai/customModels';
import { discoverModels, probeChatCompletion } from '../ai/endpoints';
import { describePriority, filterPriorityTokens } from '../ai/providerPriority';
import { readCustomModels, readPriority } from '../ai/providers';

export class CustomModelsPanel {
  public static readonly viewType = 'colophon.customModelsEditor';
  private static current: CustomModelsPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  /** True while the form holds edits the user hasn't saved yet, so an external
   * settings change (e.g. the discovery command writing back a model list)
   * doesn't reload the panel out from under them. */
  private dirty = false;

  /**
   * Opens the editor, revealing the existing panel if one is already open - two
   * panels editing the same settings would let the second one silently
   * overwrite the first one's save.
   */
  public static show(output: vscode.OutputChannel): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (CustomModelsPanel.current) {
      CustomModelsPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      CustomModelsPanel.viewType,
      'Colophon: Custom AI Models',
      column,
      {
        enableScripts: true,
        // The form holds unsaved edits; without this VS Code tears the webview
        // down whenever the tab is hidden and they are lost.
        retainContextWhenHidden: true,
      }
    );

    CustomModelsPanel.current = new CustomModelsPanel(panel, output);
  }

  public static get active(): CustomModelsPanel | undefined {
    return CustomModelsPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly output: vscode.OutputChannel
  ) {
    this.panel.webview.html = this.buildHtml(this.panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this.disposables
    );

    // Keeps the form in sync when settings change elsewhere (settings.json, the
    // "Discover Models" command) - but never while the user has unsaved edits
    // open.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!this.dirty && event.affectsConfiguration('colophon')) {
          this.postState();
        }
      })
    );
  }

  public dispose(): void {
    CustomModelsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this.postState();
        return;

      case 'dirty':
        this.dirty = Boolean(message.value);
        return;

      case 'save':
        await this.save(message.entries, message.priority);
        return;

      case 'discover':
        await this.discover(message.rowId, message.baseUrl, message.apiKey);
        return;

      case 'test':
        await this.test(message.rowId, message.baseUrl, message.apiKey, message.modelName);
        return;

      case 'openSettingsJson':
        await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        return;

      default:
        return;
    }
  }

  private postState(): void {
    const entries = readCustomModels();
    void this.panel.webview.postMessage({
      type: 'state',
      entries,
      // describePriority expands a bare "custom" token into one row per model,
      // so the list the user sees is always per-model even when the stored
      // setting is still the shipped default.
      priorityRows: describePriority(readPriority(), entries),
    });
  }

  private async save(rawEntries: unknown, rawPriority: unknown): Promise<void> {
    const { entries, errors } = normalizeEntriesForSave(rawEntries);

    if (errors.length > 0) {
      void this.panel.webview.postMessage({ type: 'validation', errors });
      return;
    }

    const priority = filterPriorityTokens(Array.isArray(rawPriority) ? rawPriority : [], entries);
    const configuration = vscode.workspace.getConfiguration('colophon');

    try {
      // Global scope for both: which endpoints exist and which is tried first
      // is a property of the person, not of the checkout they happen to have
      // open.
      await configuration.update('customModels', entries, vscode.ConfigurationTarget.Global);
      await configuration.update('providerPriority', priority, vscode.ConfigurationTarget.Global);
    } catch (error) {
      void this.panel.webview.postMessage({
        type: 'saveFailed',
        message: `Could not write settings: ${describe(error)}`,
      });
      return;
    }

    this.dirty = false;
    const message =
      `Saved ${entries.length} custom model entr${entries.length === 1 ? 'y' : 'ies'} ` +
      `(${entries.filter((entry) => entry.enabled).length} enabled). Try order: ${priority.join(' > ')}`;
    this.output.appendLine(`[providers] ${message}`);
    void vscode.window.showInformationMessage(message);
    void this.panel.webview.postMessage({ type: 'saved' });
    this.postState();
  }

  private async discover(rowId: string, baseUrl: string, apiKey: string): Promise<void> {
    const url = normalizeBaseUrl(baseUrl ?? '');
    if (!url) {
      void this.panel.webview.postMessage({
        type: 'discovered',
        rowId,
        error: 'Enter a base URL first.',
      });
      return;
    }

    this.output.appendLine(`[providers] discovering models at ${url}`);
    try {
      const models = await discoverModels(url, apiKey || undefined);
      this.output.appendLine(`[providers] ${url} serves ${models.length} model(s): ${models.join(', ')}`);
      void this.panel.webview.postMessage({ type: 'discovered', rowId, models });
    } catch (error) {
      const message = describe(error);
      this.output.appendLine(`[providers] model discovery failed for ${url}: ${message}`);
      void this.panel.webview.postMessage({
        type: 'discovered',
        rowId,
        error: withHint(url, message, message),
      });
    }
  }

  /**
   * Tests an entry by sending a real (tiny) chat completion, not by listing
   * models: a /models listing succeeding says nothing about whether generation
   * is permitted - a live Google AI Studio endpoint listed its models while
   * every transform came back 403 PERMISSION_DENIED, so this button reported
   * "Endpoint reachable" for a provider that could not process a single
   * document.
   *
   * The listing is still fetched, but only to populate the model picker and to
   * note a modelName the endpoint does not advertise; the verdict comes from the
   * completion.
   */
  private async test(rowId: string, baseUrl: string, apiKey: string, modelName: string): Promise<void> {
    const url = normalizeBaseUrl(baseUrl ?? '');
    if (!url) {
      void this.panel.webview.postMessage({
        type: 'tested',
        rowId,
        ok: false,
        message: 'Enter a base URL first.',
      });
      return;
    }

    const model = (modelName ?? '').trim();
    const key = apiKey || undefined;

    let models: string[] | undefined;
    let listingError: string | undefined;
    try {
      models = await discoverModels(url, key);
    } catch (error) {
      listingError = describe(error);
    }

    // Nothing to send a completion for yet - report the listing so the user can
    // pick a model, and be explicit that this is not a pass.
    if (!model) {
      const message = models
        ? `Listed ${models.length} model(s). Pick one in Model name, then Test again to send a real request.`
        : `Could not list models: ${listingError}`;
      void this.panel.webview.postMessage({
        type: 'tested',
        rowId,
        ok: false,
        message: withHint(url, message, listingError),
        models,
      });
      return;
    }

    this.output.appendLine(`[providers] testing ${url} with model "${model}"`);
    try {
      const sample = await probeChatCompletion(url, key, model);
      const unlisted =
        models && !models.includes(model)
          ? ` (the endpoint's /models listing doesn't advertise "${model}", but it answered anyway)`
          : '';
      const preview = sample.trim().slice(0, 60);
      this.output.appendLine(`[providers] test succeeded for ${url} (model: ${model})`);
      void this.panel.webview.postMessage({
        type: 'tested',
        rowId,
        ok: true,
        message: `"${model}" answered a real request${unlisted}${preview ? ` - replied "${preview}"` : ''}.`,
        models,
      });
    } catch (error) {
      const message = describe(error);
      this.output.appendLine(`[providers] test failed for ${url} (model: ${model}): ${message}`);
      void this.panel.webview.postMessage({
        type: 'tested',
        rowId,
        ok: false,
        message: withHint(url, `Request failed - ${message}`, message),
        models,
      });
    }
  }

  /**
   * The whole UI is inlined rather than shipped as separate media files: the
   * extension's build is `tsc` plus the React app's own bundle, and a media/
   * directory next to this file would never reach out/, so the packaged
   * extension would load a blank panel.
   */
  private buildHtml(webview: vscode.Webview): string {
    const nonce = makeNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Custom AI Models</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 16px 20px 48px;
    margin: 0;
  }
  h1 { font-size: 1.3em; margin: 0 0 4px; }
  h2 { font-size: 1.05em; margin: 24px 0 4px; }
  p.intro { margin: 0 0 12px; color: var(--vscode-descriptionForeground); max-width: 78ch; }
  .entry, .prow {
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    background: var(--vscode-editorWidget-background, transparent);
  }
  .entry { padding: 12px 14px; margin-bottom: 12px; }
  .entry.disabled { opacity: 0.72; }
  .entry-head, .prow {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .entry-head { margin-bottom: 10px; }
  .prow { padding: 7px 10px; margin-bottom: 6px; }
  .prow.excluded { opacity: 0.65; border-style: dashed; }
  .prow .label { flex: 1 1 auto; }
  .prow.draggable { cursor: grab; }
  .prow.dragging { opacity: 0.4; }
  /* Drop indicator: a line on the edge the row would land against, rather
     than moving rows around mid-drag - the list is short enough that a
     live-reflow preview reads as jitter. */
  .prow.drop-before { box-shadow: 0 -2px 0 0 var(--vscode-focusBorder); }
  .prow.drop-after { box-shadow: 0 2px 0 0 var(--vscode-focusBorder); }
  .grip {
    color: var(--vscode-descriptionForeground);
    cursor: grab;
    user-select: none;
    line-height: 1;
  }
  .section-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 24px 0 4px; }
  .section-head h2 { margin: 0; }
  .entry-head .title { font-weight: 600; flex: 1 1 auto; }
  .order { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; min-width: 2ch; }
  .badge {
    font-size: 0.78em;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
  }
  .badge.warn {
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
    border-color: var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 16px; }
  /* The caret sits inside the input's right edge, so the input needs room
     reserved for it and a positioning context to hang it off. */
  .model-input-wrap { position: relative; }
  .model-input-wrap input[type="text"] { padding-right: 26px; }
  .model-caret {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    width: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--vscode-input-foreground);
    cursor: pointer;
    font-size: 0.7em;
    line-height: 1;
  }
  /* Qualified by the wrapper to outweigh the generic button:hover /
     button:disabled rules further down, which would otherwise repaint the
     caret as a filled button on hover. */
  .model-input-wrap .model-caret:hover { color: var(--vscode-textLink-foreground); background: transparent; }
  .model-input-wrap .model-caret:disabled { opacity: 0.4; cursor: default; background: transparent; }
  /* Overlaid rather than in flow: an expanded list used to push the API
     key field and the row's buttons down the card every time it opened. */
  .model-list {
    position: absolute;
    z-index: 5;
    left: 0;
    right: 0;
    max-height: 168px;
    overflow-y: auto;
    margin-top: 2px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 3px;
    background: var(--vscode-input-background);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
  }
  .model-option {
    padding: 3px 8px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model-option:hover { background: var(--vscode-list-hoverBackground); }
  .model-option.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .model-option.empty {
    cursor: default;
    color: var(--vscode-descriptionForeground);
    white-space: normal;
  }
  .model-option.empty:hover { background: transparent; }
  /* Webviews get the plain Chromium scrollbar otherwise, which reads as
     foreign next to every other list in the editor. */
  .model-list::-webkit-scrollbar { width: 10px; }
  .model-list::-webkit-scrollbar-track { background: transparent; }
  .model-list::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
  .model-list::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
  .model-list::-webkit-scrollbar-thumb:active { background: var(--vscode-scrollbarSlider-activeBackground); }
  label { display: block; font-size: 0.9em; margin-bottom: 3px; color: var(--vscode-descriptionForeground); }
  input[type="text"], input[type="password"] {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 7px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    font-family: inherit;
    font-size: inherit;
  }
  input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .field.invalid input { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
  /* pre-wrap so a diagnosis appended after a blank line stays on its own
     line instead of running into the raw server error. */
  .hint { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-top: 3px; white-space: pre-wrap; }
  .error { font-size: 0.85em; color: var(--vscode-errorForeground); margin-top: 3px; white-space: pre-wrap; }
  .ok { font-size: 0.85em; color: var(--vscode-testing-iconPassed, var(--vscode-charts-green, #2ea043)); margin-top: 3px; white-space: pre-wrap; }
  button {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none;
    padding: 5px 11px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .row-actions { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
  .toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    position: sticky;
    bottom: 0;
    padding: 12px 0 4px;
    background: var(--vscode-editor-background);
    flex-wrap: wrap;
  }
  .status { color: var(--vscode-descriptionForeground); }
  .status.error { color: var(--vscode-errorForeground); }
  .empty { color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .checkbox { display: flex; align-items: center; gap: 6px; }
  .checkbox label { margin: 0; color: var(--vscode-foreground); }
</style>
</head>
<body>
  <h1>Custom AI Models</h1>
  <p class="intro">
    Each entry is a server speaking the OpenAI chat-completions API shape (Ollama, LM Studio,
    Together, Groq, Google AI Studio, OpenAI itself, most self-hosted gateways). Saving writes
    <code>colophon.customModels</code> and the try order below into your user settings,
    so this panel is the only place either needs to be edited.
  </p>

  <div id="entries"></div>
  <p id="empty" class="empty" hidden>No custom models configured yet.</p>
  <button id="add" class="secondary">+ Add model</button>

  <div class="section-head">
    <h2>Try order</h2>
    <button id="add-provider" class="secondary">+ Add provider</button>
  </div>
  <p class="intro">
    Every configured provider is listed here. They're tried top to bottom; the first available one
    transforms the document. Drag a row to reorder (or use ↑/↓) - put a custom model above GitHub
    Copilot to make it the primary. Removing a row means that provider is never tried at all.
  </p>
  <div id="priority"></div>
  <div id="excluded"></div>

  <div class="toolbar">
    <button id="save">Save</button>
    <span id="status" class="status"></span>
    <span style="flex:1"></span>
    <button id="open-json" class="secondary">Edit in settings.json</button>
  </div>

<script nonce="${nonce}">
(function () {
  const vscode = acquireVsCodeApi();
  const entriesEl = document.getElementById('entries');
  const emptyEl = document.getElementById('empty');
  const statusEl = document.getElementById('status');
  const priorityEl = document.getElementById('priority');
  const excludedEl = document.getElementById('excluded');

  /** @type {Array<Object>} working copy of colophon.customModels */
  let entries = [];
  /** @type {Array<string>} tokens in try-order: builtin ids and custom:<entry id> */
  let priority = [];
  /** @type {Array<string>} tokens deliberately left out of the order */
  let excluded = [];
  /** token -> label, for the built-in providers (custom labels come from entries) */
  let builtinLabels = {};
  /** rowId -> transient discover/test feedback */
  let feedback = {};
  /**
   * rowId -> whether its model list is expanded. Kept out here rather than
   * on the DOM because render() rebuilds every card from scratch, and
   * closed is the default: picking a model, or clicking anywhere else,
   * puts the list away until the caret is clicked again.
   */
  let modelListOpen = {};
  /**
   * One "close me if the click landed outside" callback per rendered model
   * list. A single document-level listener drives them all, rather than
   * each row registering (and having to unregister) its own.
   */
  let modelListClosers = [];
  /** rowId -> { field: message } from the last rejected save */
  let fieldErrors = {};
  /** index of the try-order row currently being dragged, or null */
  let dragFrom = null;

  function newId() {
    return 'custom-' + Math.random().toString(36).slice(2, 10);
  }

  function refFor(id) { return 'custom:' + id; }

  function entryForToken(token) {
    if (token.indexOf('custom:') !== 0) { return null; }
    const id = token.slice('custom:'.length);
    return entries.filter(function (e) { return e.id === id; })[0] || null;
  }

  function labelFor(token) {
    const entry = entryForToken(token);
    if (entry) {
      return entry.name || entry.modelName || entry.baseUrl || entry.id;
    }
    return builtinLabels[token] || token;
  }

  function markDirty() {
    vscode.postMessage({ type: 'dirty', value: true });
    setStatus('Unsaved changes.');
  }

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.className = isError ? 'status error' : 'status';
  }

  function makeField(labelText, value, hint, onInput, options) {
    const opts = options || {};
    const wrap = document.createElement('div');
    wrap.className = 'field' + (opts.error ? ' invalid' : '');
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = opts.password ? 'password' : 'text';
    input.value = value || '';
    if (opts.inputId) { input.id = opts.inputId; }
    if (opts.placeholder) { input.placeholder = opts.placeholder; }
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(label);
    wrap.appendChild(input);
    if (hint) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = hint;
      wrap.appendChild(h);
    }
    if (opts.error) {
      const e = document.createElement('div');
      e.className = 'error';
      e.textContent = opts.error;
      wrap.appendChild(e);
    }
    return wrap;
  }

  function renderEntry(entry, index) {
    const errs = fieldErrors[entry.id] || {};
    const fb = feedback[entry.id] || {};

    const card = document.createElement('div');
    card.className = entry.enabled ? 'entry' : 'entry disabled';
    card.id = 'entry-' + entry.id;

    const head = document.createElement('div');
    head.className = 'entry-head';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = entry.name || entry.modelName || entry.baseUrl || 'Untitled model';
    head.appendChild(title);

    if (priority.indexOf(refFor(entry.id)) === -1) {
      const warn = document.createElement('span');
      warn.className = 'badge warn';
      warn.textContent = 'not in try order';
      head.appendChild(warn);
    }

    const check = document.createElement('div');
    check.className = 'checkbox';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'enabled-' + entry.id;
    box.checked = !!entry.enabled;
    box.addEventListener('change', function () {
      entry.enabled = box.checked;
      markDirty();
      render();
    });
    const boxLabel = document.createElement('label');
    boxLabel.setAttribute('for', box.id);
    boxLabel.textContent = 'Enabled';
    check.appendChild(box);
    check.appendChild(boxLabel);
    head.appendChild(check);

    card.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'grid';

    // Updates the card heading and the try-order row in place rather than
    // re-rendering: a full render() on every keystroke rebuilds this input
    // and throws away focus and caret position mid-word.
    grid.appendChild(makeField(
      'Display name',
      entry.name,
      'Shown in logs, notifications and the try order below.',
      function (v) {
        entry.name = v;
        markDirty();
        title.textContent = v || entry.modelName || entry.baseUrl || 'Untitled model';
        updatePriorityLabel(refFor(entry.id));
      },
      { placeholder: 'Local Ollama', inputId: 'name-' + entry.id }
    ));

    grid.appendChild(makeField(
      'Base URL',
      entry.baseUrl,
      'Up to but not including /chat/completions.',
      function (v) { entry.baseUrl = v; markDirty(); },
      { placeholder: 'http://localhost:11434/v1', error: errs.baseUrl }
    ));

    // Model name: a free-text input (an endpoint with no /models listing
    // still has to be typable) with a caret that drops down a scrollable
    // list of whatever Discover returned. A <datalist> was tried first and
    // is the wrong control here: its popup shows only a handful of rows
    // with no scrollbar, so an endpoint offering dozens of models
    // presented a truncated list with no way to reach the rest.
    //
    // The list is collapsed until the caret is clicked, and collapses
    // again the moment one is picked - left permanently expanded it
    // covered the fields below it with a list the user was already done
    // with.
    const modelWrap = document.createElement('div');
    modelWrap.className = 'field' + (errs.modelName ? ' invalid' : '');
    const modelLabel = document.createElement('label');
    modelLabel.textContent = 'Model name';
    const inputWrap = document.createElement('div');
    inputWrap.className = 'model-input-wrap';
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.value = entry.modelName || '';
    modelInput.placeholder = 'llama3.1:70b';
    const caretBtn = document.createElement('button');
    caretBtn.className = 'model-caret';
    caretBtn.type = 'button';
    inputWrap.appendChild(modelInput);
    inputWrap.appendChild(caretBtn);
    modelWrap.appendChild(modelLabel);
    modelWrap.appendChild(inputWrap);

    const known = (fb.models || entry.models || []);
    const listBox = document.createElement('div');
    listBox.className = 'model-list';
    const modelHint = document.createElement('div');
    modelHint.className = 'hint';

    function isOpen() { return known.length > 0 && !!modelListOpen[entry.id]; }

    function setOpen(open) {
      modelListOpen[entry.id] = open && known.length > 0;
      paintModelList();
    }

    function paintModelList() {
      listBox.textContent = '';
      caretBtn.disabled = known.length === 0;
      caretBtn.textContent = isOpen() ? '▲' : '▼';
      caretBtn.title = known.length === 0
        ? 'Run Discover models first to list what this endpoint supports'
        : (isOpen() ? 'Hide discovered models' : 'Show discovered models');
      caretBtn.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
      caretBtn.setAttribute('aria-label', 'Show discovered models');

      if (known.length === 0) {
        listBox.hidden = true;
        modelHint.textContent = 'Exactly as the endpoint expects it. Use Discover to list what it supports.';
        return;
      }

      const filter = (entry.modelName || '').trim().toLowerCase();
      const shown = filter
        ? known.filter(function (m) { return m.toLowerCase().indexOf(filter) !== -1; })
        : known;

      // The hint stays visible while the list is collapsed - it's the only
      // thing telling you Discover found anything at all.
      modelHint.textContent = shown.length === known.length
        ? known.length + ' model(s) discovered - use the arrow to pick one.'
        : shown.length + ' of ' + known.length + ' match what you typed.';

      listBox.hidden = !isOpen();
      if (!isOpen()) {
        return;
      }

      shown.forEach(function (model) {
        const option = document.createElement('div');
        option.className = 'model-option' + (model === entry.modelName ? ' selected' : '');
        option.textContent = model;
        option.title = model;
        option.addEventListener('click', function () {
          entry.modelName = model;
          modelInput.value = model;
          markDirty();
          updatePriorityLabel(refFor(entry.id));
          // Picking one is the end of the interaction - collapse rather
          // than leaving the list sitting open over the fields below it.
          setOpen(false);
        });
        listBox.appendChild(option);
      });

      if (shown.length === 0) {
        const none = document.createElement('div');
        none.className = 'model-option empty';
        none.textContent = 'No discovered model matches that text - it is still sent exactly as typed.';
        listBox.appendChild(none);
      }
    }

    caretBtn.addEventListener('click', function (event) {
      // Without this the panel-wide outside-click handler below sees the
      // same click and closes what this just opened.
      event.stopPropagation();
      setOpen(!isOpen());
    });

    // Typing filters the list instead of re-rendering the card, so the
    // input keeps focus and caret while narrowing dozens of ids down. It
    // deliberately doesn't open a collapsed list: the arrow is the only
    // thing that opens one.
    modelInput.addEventListener('input', function () {
      entry.modelName = modelInput.value;
      markDirty();
      updatePriorityLabel(refFor(entry.id));
      paintModelList();
    });

    // A click anywhere else - another card, the try order, the text input
    // itself - closes the list, the way every other dropdown in the editor
    // behaves. Clicks on the list's own options are excluded: those are
    // handled above, and closing here first would cancel the pick.
    modelListClosers.push(function (target) {
      if (isOpen() && !listBox.contains(target)) {
        setOpen(false);
      }
    });

    paintModelList();
    inputWrap.appendChild(listBox);
    modelWrap.appendChild(modelHint);
    if (errs.modelName) {
      const e = document.createElement('div');
      e.className = 'error';
      e.textContent = errs.modelName;
      modelWrap.appendChild(e);
    }
    grid.appendChild(modelWrap);

    grid.appendChild(makeField(
      'API key',
      entry.apiKey,
      'Sent as Authorization: Bearer. Leave empty for a local server.',
      function (v) { entry.apiKey = v; markDirty(); },
      { password: true, placeholder: '(none)' }
    ));

    card.appendChild(grid);

    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const discoverBtn = document.createElement('button');
    discoverBtn.className = 'secondary';
    discoverBtn.textContent = 'Discover models';
    discoverBtn.addEventListener('click', function () {
      feedback[entry.id] = { pending: 'Querying ' + (entry.baseUrl || '') + '/models...' };
      render();
      vscode.postMessage({ type: 'discover', rowId: entry.id, baseUrl: entry.baseUrl, apiKey: entry.apiKey });
    });
    actions.appendChild(discoverBtn);

    const testBtn = document.createElement('button');
    testBtn.className = 'secondary';
    testBtn.textContent = 'Test connection';
    testBtn.addEventListener('click', function () {
      feedback[entry.id] = { pending: 'Testing ' + (entry.baseUrl || '') + '...' };
      render();
      vscode.postMessage({
        type: 'test',
        rowId: entry.id,
        baseUrl: entry.baseUrl,
        apiKey: entry.apiKey,
        modelName: entry.modelName
      });
    });
    actions.appendChild(testBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', function () {
      entries.splice(index, 1);
      priority = priority.filter(function (t) { return t !== refFor(entry.id); });
      excluded = excluded.filter(function (t) { return t !== refFor(entry.id); });
      delete feedback[entry.id];
      delete fieldErrors[entry.id];
      markDirty();
      render();
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);

    if (fb.pending) {
      const p = document.createElement('div');
      p.className = 'hint';
      p.textContent = fb.pending;
      card.appendChild(p);
    }
    if (fb.error) {
      const e = document.createElement('div');
      e.className = 'error';
      e.textContent = fb.error;
      card.appendChild(e);
    }
    if (fb.ok) {
      const o = document.createElement('div');
      o.className = 'ok';
      o.textContent = fb.ok;
      card.appendChild(o);
    }

    return card;
  }

  function renderPriorityRow(token, index) {
    const row = document.createElement('div');
    row.className = 'prow draggable';
    row.draggable = true;
    row.addEventListener('dragstart', function (event) {
      dragFrom = index;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      // Firefox-derived webviews ignore a drag that sets no data at all.
      event.dataTransfer.setData('text/plain', token);
    });
    row.addEventListener('dragend', function () {
      dragFrom = null;
      clearDropMarkers();
      row.classList.remove('dragging');
    });
    row.addEventListener('dragover', function (event) {
      if (dragFrom === null || dragFrom === index) { return; }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const box = row.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      clearDropMarkers();
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('dragleave', function () {
      row.classList.remove('drop-before', 'drop-after');
    });
    row.addEventListener('drop', function (event) {
      if (dragFrom === null) { return; }
      event.preventDefault();
      const box = row.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      dropAt(dragFrom, index + (after ? 1 : 0));
    });

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = 'Drag to reorder';
    row.appendChild(grip);

    const order = document.createElement('span');
    order.className = 'order';
    order.textContent = (index + 1) + '.';
    row.appendChild(order);

    const label = document.createElement('span');
    label.className = 'label';
    label.setAttribute('data-token', token);
    label.textContent = labelFor(token);
    row.appendChild(label);

    const entry = entryForToken(token);
    if (entry) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'custom model';
      row.appendChild(badge);
      if (!entry.enabled) {
        const off = document.createElement('span');
        off.className = 'badge warn';
        off.textContent = 'disabled - skipped';
        row.appendChild(off);
      }
    }

    const up = document.createElement('button');
    up.className = 'secondary';
    up.textContent = '↑';
    up.title = 'Try earlier';
    up.disabled = index === 0;
    up.addEventListener('click', function () { movePriority(index, -1); });
    row.appendChild(up);

    const down = document.createElement('button');
    down.className = 'secondary';
    down.textContent = '↓';
    down.title = 'Try later';
    down.disabled = index === priority.length - 1;
    down.addEventListener('click', function () { movePriority(index, 1); });
    row.appendChild(down);

    const drop = document.createElement('button');
    drop.className = 'secondary';
    drop.textContent = 'Remove';
    drop.title = 'Never try this provider';
    drop.addEventListener('click', function () {
      priority.splice(index, 1);
      excluded.push(token);
      markDirty();
      render();
    });
    row.appendChild(drop);

    return row;
  }

  function renderExcludedRow(token, index) {
    const row = document.createElement('div');
    row.className = 'prow excluded';

    const label = document.createElement('span');
    label.className = 'label';
    label.setAttribute('data-token', token);
    label.textContent = labelFor(token);
    row.appendChild(label);

    const badge = document.createElement('span');
    badge.className = 'badge warn';
    badge.textContent = 'never tried';
    row.appendChild(badge);

    const add = document.createElement('button');
    add.className = 'secondary';
    add.textContent = '+ Add to try order';
    add.addEventListener('click', function () {
      excluded.splice(index, 1);
      priority.push(token);
      markDirty();
      render();
    });
    row.appendChild(add);

    return row;
  }

  function movePriority(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= priority.length) { return; }
    const moved = priority.splice(index, 1)[0];
    priority.splice(target, 0, moved);
    markDirty();
    render();
  }

  /** Live-updates one try-order row's text while its model is being renamed. */
  function updatePriorityLabel(token) {
    const selector = '.label[data-token="' + token + '"]';
    const nodes = document.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].textContent = labelFor(token);
    }
  }

  function clearDropMarkers() {
    const marked = priorityEl.querySelectorAll('.drop-before, .drop-after');
    for (let i = 0; i < marked.length; i++) {
      marked[i].classList.remove('drop-before', 'drop-after');
    }
  }

  /**
   * Moves the dragged row to a slot *between* rows. The "to" argument is
   * that gap index in the pre-removal list, so it's decremented when the
   * row is dragged downward - otherwise every downward drag lands one
   * position short.
   */
  function dropAt(from, to) {
    let target = to;
    if (from < target) { target -= 1; }
    if (target === from) {
      dragFrom = null;
      clearDropMarkers();
      render();
      return;
    }
    const moved = priority.splice(from, 1)[0];
    priority.splice(target, 0, moved);
    dragFrom = null;
    markDirty();
    render();
  }

  /**
   * Adds a blank model and puts the cursor in it. Shared by both "+ Add"
   * buttons: the one in the try-order section exists because that's where
   * a missing provider is actually noticed, and it would be a dead end if
   * it only scrolled somewhere.
   */
  function addModel() {
    const entry = { id: newId(), enabled: true, name: '', baseUrl: '', apiKey: '', modelName: '' };
    entries.push(entry);
    // Added to the try order immediately: a model that's configured but
    // absent from the order is silently never used, which is the exact
    // trap this editor exists to remove.
    priority.push(refFor(entry.id));
    markDirty();
    render();

    const card = document.getElementById('entry-' + entry.id);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    const nameInput = document.getElementById('name-' + entry.id);
    if (nameInput) { nameInput.focus(); }
  }

  function render() {
    // The cards about to be discarded own these, so they'd otherwise
    // accumulate one stale entry per render.
    modelListClosers = [];
    entriesEl.textContent = '';
    entries.forEach(function (entry, index) {
      entriesEl.appendChild(renderEntry(entry, index));
    });
    emptyEl.hidden = entries.length > 0;

    priorityEl.textContent = '';
    priority.forEach(function (token, index) {
      priorityEl.appendChild(renderPriorityRow(token, index));
    });

    excludedEl.textContent = '';
    excluded.forEach(function (token, index) {
      excludedEl.appendChild(renderExcludedRow(token, index));
    });
  }

  // Releasing below the last row (on the container's own padding rather
  // than on a row) means "move to the end" - without this the drag just
  // silently snaps back.
  priorityEl.addEventListener('dragover', function (event) {
    if (dragFrom !== null && event.target === priorityEl) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  });
  priorityEl.addEventListener('drop', function (event) {
    if (dragFrom !== null && event.target === priorityEl) {
      event.preventDefault();
      dropAt(dragFrom, priority.length);
    }
  });

  document.getElementById('add').addEventListener('click', addModel);
  document.getElementById('add-provider').addEventListener('click', addModel);

  document.getElementById('save').addEventListener('click', function () {
    fieldErrors = {};
    setStatus('Saving...');
    vscode.postMessage({ type: 'save', entries: entries, priority: priority });
  });

  document.getElementById('open-json').addEventListener('click', function () {
    vscode.postMessage({ type: 'openSettingsJson' });
  });

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.type === 'state') {
      entries = (msg.entries || []).map(function (e) {
        return {
          id: e.id, enabled: !!e.enabled, name: e.name || '', baseUrl: e.baseUrl || '',
          apiKey: e.apiKey || '', modelName: e.modelName || '', models: e.models || []
        };
      });
      const rows = msg.priorityRows || [];
      priority = rows.filter(function (r) { return r.included; }).map(function (r) { return r.token; });
      excluded = rows.filter(function (r) { return !r.included; }).map(function (r) { return r.token; });
      builtinLabels = {};
      rows.forEach(function (r) {
        if (r.kind === 'builtin') { builtinLabels[r.token] = r.label; }
      });
      render();
    } else if (msg.type === 'discovered') {
      if (msg.error) {
        feedback[msg.rowId] = { error: msg.error };
      } else {
        feedback[msg.rowId] = {
          models: msg.models,
          ok: 'Found ' + msg.models.length + ' model(s). Pick one in Model name.'
        };
        const entry = entries.filter(function (e) { return e.id === msg.rowId; })[0];
        if (entry) {
          entry.models = msg.models;
          // One model available and nothing chosen yet: the choice is
          // unambiguous, so make it rather than asking.
          if (!entry.modelName && msg.models.length === 1) {
            entry.modelName = msg.models[0];
          }
          markDirty();
        }
      }
      render();
    } else if (msg.type === 'tested') {
      feedback[msg.rowId] = msg.ok
        ? { ok: msg.message, models: msg.models }
        : { error: msg.message, models: msg.models };
      render();
    } else if (msg.type === 'validation') {
      fieldErrors = {};
      (msg.errors || []).forEach(function (err) {
        fieldErrors[err.id] = fieldErrors[err.id] || {};
        fieldErrors[err.id][err.field] = err.message;
      });
      setStatus('Not saved - fix the highlighted field(s).', true);
      render();
    } else if (msg.type === 'saveFailed') {
      setStatus(msg.message, true);
    } else if (msg.type === 'saved') {
      fieldErrors = {};
      setStatus('Saved to settings.');
      render();
    }
  });

  document.addEventListener('click', function (event) {
    modelListClosers.forEach(function (close) { close(event.target); });
  });

  vscode.postMessage({ type: 'ready' });
}());
</script>
</body>
</html>`;
  }
}

/** Appends the actionable interpretation of a failure, when there is one. */
function withHint(baseUrl: string, message: string, rawError: string | undefined): string {
  const hint = rawError ? diagnoseEndpointError(baseUrl, rawError) : null;
  return hint ? `${message}\n\n${hint}` : message;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
