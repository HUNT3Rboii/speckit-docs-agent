#!/usr/bin/env node
// Drives the compiled extension host against a stubbed `vscode` module.
//
// VS Code has no CLI that fires a command, so the integration between
// activate(), the spawned backend, and the convert command is otherwise only
// exercised by a human clicking a menu item. This runs the real host code -
// real spawn, real handshake, real RPC, real Typst - with only the editor API
// replaced, which leaves VS Code's own surface as the single unverified layer.
//
//   node scripts/smoke-host.mjs [path/to/document.md]
//   node scripts/smoke-host.mjs doc.md --extension-path ~/.vscode/extensions/<id>
//
// The second form runs against an installed VSIX rather than the working tree,
// which is what proves the *packaged* layout - .vscodeignore excluding a file
// the host needs looks identical to a passing test until then.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Module = require('node:module');

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--extension-path');
const extensionPath = flagIndex === -1 ? REPO_ROOT : args[flagIndex + 1];
// `flagIndex + 1` is only the flag's value when the flag is actually present;
// with no flag it is index 0, which would swallow the document argument.
const valueIndex = flagIndex === -1 ? -1 : flagIndex + 1;
const positional = args.filter((arg, index) => !arg.startsWith('--') && index !== valueIndex);

const source = positional[0] ?? join(REPO_ROOT, 'server', 'tests', 'fixtures', 'kitchen-sink.md');
const storagePath = join(REPO_ROOT, '.smoke-storage');

const withPanel = args.includes('--panel');

const log = [];
const notifications = [];
const commands = new Map();
let opened;
let panelRequests = 0;

// A canned diagram standing in for mermaid's output: real SVG text, no
// <foreignObject>, which is the shape the webview is configured to produce.
const STUB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 60">
  <rect x="1" y="1" width="218" height="58" fill="none" stroke="#333"/>
  <text x="14" y="34" font-family="DejaVu Sans" font-size="12">Gateway to Order Service</text>
</svg>`;

/**
 * Stands in for the webview.
 *
 * Everything up to and including the message bridge is real: the host builds
 * its HTML, posts a renderMermaid request, and waits for a reply keyed to the
 * id it sent. Only mermaid itself is replaced - rendering needs a browser, and
 * this is Node.
 */
function createStubWebviewPanel() {
  const listeners = [];
  const disposeListeners = [];

  const panel = {
    webview: {
      cspSource: 'vscode-webview://stub',
      html: '',
      asWebviewUri: (uri) => ({ toString: () => `https://stub/${uri.fsPath.replace(/\\/g, '/')}` }),
      onDidReceiveMessage(listener) {
        listeners.push(listener);
        return { dispose() {} };
      },
      postMessage(message) {
        if (message.kind === 'request' && message.method === 'renderMermaid') {
          panelRequests += 1;
          const rendered = message.params.diagrams.map((diagram) => ({
            id: diagram.id,
            svg: STUB_SVG,
            title: diagram.title,
          }));
          for (const listener of listeners) {
            listener({ kind: 'response', id: message.id, result: { rendered } });
          }
        }
        return Promise.resolve(true);
      },
    },
    reveal() {},
    onDidDispose(listener) {
      disposeListeners.push(listener);
      return { dispose() {} };
    },
    dispose() {
      for (const listener of disposeListeners.splice(0)) {
        listener();
      }
    },
  };

  return panel;
}

const vscodeStub = {
  Uri: {
    file: (fsPath) => ({ fsPath, scheme: 'file' }),
    joinPath: (base, ...segments) => ({ fsPath: join(base.fsPath, ...segments), scheme: 'file' }),
  },
  ViewColumn: { One: 1 },
  ProgressLocation: { Notification: 15 },
  CancellationTokenSource: class {
    token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
    cancel() {}
    dispose() {}
  },
  ConfigurationTarget: { Workspace: 2 },
  // No language model in Node, so enrichment is off here. The parser it feeds
  // is covered by its own tests; what this harness proves is the pipeline
  // around it.
  lm: { selectChatModels: () => Promise.resolve([]) },
  workspace: {
    getConfiguration: () => ({
      get: (key, fallback) => (key === 'enrich' ? false : fallback),
      update: () => Promise.resolve(),
    }),
    onDidSaveTextDocument: () => ({ dispose() {} }),
    getWorkspaceFolder: () => ({ uri: { fsPath: REPO_ROOT } }),
    findFiles: () => Promise.resolve([{ fsPath: source }]),
    asRelativePath: (target) => String(target?.fsPath ?? target),
    openTextDocument: (uri) =>
      Promise.resolve({
        languageId: 'markdown',
        uri,
        getText: () => readFileSync(uri.fsPath, 'utf8'),
      }),
    createFileSystemWatcher: () => ({
      onDidCreate() {},
      onDidDelete() {},
      onDidChange() {},
      dispose() {},
    }),
  },
  commands: {
    registerCommand(id, handler) {
      commands.set(id, handler);
      return { dispose() {} };
    },
  },
  env: {
    openExternal(uri) {
      opened = uri.fsPath;
      return Promise.resolve(true);
    },
  },
  window: {
    createOutputChannel(name) {
      return {
        name,
        appendLine: (line) => log.push(line),
        show() {},
        dispose() {},
      };
    },
    withProgress: (_options, task) => task({ report() {} }),
    showInformationMessage(message) {
      notifications.push(['info', message]);
      return Promise.resolve(undefined);
    },
    showWarningMessage(message) {
      notifications.push(['warn', message]);
      return Promise.resolve(undefined);
    },
    showErrorMessage(message) {
      notifications.push(['error', message]);
      return Promise.resolve(undefined);
    },
    createWebviewPanel: () => createStubWebviewPanel(),
    registerWebviewPanelSerializer: () => ({ dispose() {} }),
    activeTextEditor: {
      viewColumn: 1,
      document: {
        languageId: 'markdown',
        uri: { fsPath: source },
        getText: () => readFileSync(source, 'utf8'),
      },
    },
  },
};

// The host does `require('vscode')`, which only resolves inside a real editor.
const load = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return load.call(this, request, parent, isMain);
};

function fail(message) {
  process.stderr.write(`\nFAILED: ${message}\n\n`);
  if (log.length) {
    process.stderr.write('Output channel:\n' + log.map((line) => `  ${line}`).join('\n') + '\n');
  }
  process.exit(1);
}

async function main() {
  // Each run starts clean unless asked otherwise; --keep-storage is how the
  // rebuild-skipping path gets exercised, since it needs a previous build to
  // find.
  if (!args.includes('--keep-storage')) {
    rmSync(storagePath, { recursive: true, force: true });
  }

  process.stdout.write(`extension path: ${extensionPath}\n`);
  const extension = require(join(extensionPath, 'out', 'src', 'extension.js'));
  const context = {
    subscriptions: [],
    extensionPath,
    extensionUri: { fsPath: extensionPath, scheme: 'file' },
    globalStorageUri: { fsPath: storagePath },
  };

  extension.activate(context);
  const convertCommand = commands.get('speckitStandalone.convertCurrentFile');
  assert.ok(convertCommand, 'activate() did not register the convert command');
  process.stdout.write(`activate() registered ${[...commands.keys()].join(', ')}\n`);

  if (withPanel) {
    // Diagrams are only rendered when a panel exists to render them in.
    commands.get('speckitStandalone.openPanel')?.();
    process.stdout.write('opened stub panel\n');
  }

  const startedAt = Date.now();
  await convertCommand();
  const elapsed = Date.now() - startedAt;

  const errors = notifications.filter(([kind]) => kind === 'error');
  if (errors.length) {
    fail(errors.map(([, message]) => message).join('\n'));
  }

  const stem = source.replace(/\\/g, '/').split('/').pop().replace(/\.md$/i, '');
  const pdf = join(storagePath, 'pdf', `${stem}.pdf`);
  if (!existsSync(pdf)) {
    fail(`no PDF at ${pdf}`);
  }
  if (withPanel) {
    process.stdout.write(`panel render requests: ${panelRequests}\n`);
  }

  const header = readFileSync(pdf).subarray(0, 5).toString('latin1');
  assert.equal(header, '%PDF-', `file at ${pdf} is not a PDF`);

  process.stdout.write(`spawn + handshake + convert took ${elapsed}ms\n`);
  process.stdout.write(`wrote ${pdf} (${(statSync(pdf).size / 1024).toFixed(1)} KB)\n`);
  process.stdout.write(`notifications: ${JSON.stringify(notifications)}\n`);
  process.stdout.write(`openExternal target: ${opened ?? '(not clicked)'}\n`);

  // Disposal has to actually stop the child; an orphaned backend holding the
  // storage directory is the failure mode this whole design is arranged to
  // avoid.
  for (const disposable of context.subscriptions) {
    disposable.dispose?.();
  }
  process.stdout.write('disposed cleanly\n');

  process.stdout.write('\nBackend log:\n' + log.map((line) => `  ${line}`).join('\n') + '\n');
}

main().catch((error) => fail(error.stack ?? String(error)));
