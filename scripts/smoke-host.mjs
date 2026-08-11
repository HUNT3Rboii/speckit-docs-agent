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
const positional = args.filter((arg, index) => !arg.startsWith('--') && index !== flagIndex + 1);

const source = positional[0] ?? join(REPO_ROOT, 'server', 'tests', 'fixtures', 'kitchen-sink.md');
const storagePath = join(REPO_ROOT, '.smoke-storage');

const log = [];
const notifications = [];
let registeredCommand;
let opened;

const vscodeStub = {
  Uri: {
    file: (fsPath) => ({ fsPath, scheme: 'file' }),
  },
  ProgressLocation: { Notification: 15 },
  commands: {
    registerCommand(id, handler) {
      registeredCommand = { id, handler };
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
    activeTextEditor: {
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
  rmSync(storagePath, { recursive: true, force: true });

  process.stdout.write(`extension path: ${extensionPath}\n`);
  const extension = require(join(extensionPath, 'out', 'src', 'extension.js'));
  const context = {
    subscriptions: [],
    extensionPath,
    globalStorageUri: { fsPath: storagePath },
  };

  extension.activate(context);
  assert.ok(registeredCommand, 'activate() registered no command');
  assert.equal(registeredCommand.id, 'speckitStandalone.convertCurrentFile');
  process.stdout.write(`activate() registered ${registeredCommand.id}\n`);

  const startedAt = Date.now();
  await registeredCommand.handler();
  const elapsed = Date.now() - startedAt;

  const errors = notifications.filter(([kind]) => kind === 'error');
  if (errors.length) {
    fail(errors.map(([, message]) => message).join('\n'));
  }

  const pdf = join(storagePath, 'pdf', 'kitchen-sink.pdf');
  if (!existsSync(pdf)) {
    fail(`no PDF at ${pdf}`);
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
