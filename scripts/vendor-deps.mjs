#!/usr/bin/env node
// Installs server/requirements.txt into server/vendor/ using the bundled
// interpreter.
//
// Vendoring rather than installing into bin/<target>/python keeps the shipped
// interpreter byte-identical to what was downloaded and checksummed, and makes
// the dependency set one directory the VSIX either has or does not.
//
// Everything currently vendored is pure Python, so one run covers all four
// targets. Add a package with compiled artefacts and this has to run per target
// instead - which is exactly why the list is kept short.

import { spawn } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(REPO_ROOT, 'server', 'vendor');
const REQUIREMENTS = join(REPO_ROOT, 'server', 'requirements.txt');

function hostTarget() {
  return `${process.platform === 'win32' ? 'win32' : process.platform}-${process.arch}`;
}

function pythonPath(target) {
  const base = join(REPO_ROOT, 'bin', target, 'python');
  return process.platform === 'win32' ? join(base, 'python.exe') : join(base, 'bin', 'python3');
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function main() {
  const target = process.argv[2] ?? hostTarget();
  const python = pythonPath(target);

  await access(python).catch(() => {
    throw new Error(`No bundled interpreter at ${python}. Run: npm run fetch-runtimes ${target}`);
  });

  // Reinstalling over an existing tree leaves removed dependencies behind.
  await rm(VENDOR, { recursive: true, force: true });

  await run(python, ['-m', 'pip', 'install', '--quiet', '--target', VENDOR, '-r', REQUIREMENTS]);
  process.stdout.write(`Vendored server dependencies into server/vendor using ${target}\n`);
}

main().catch((err) => {
  process.stderr.write(`vendor-deps failed: ${err.message}\n`);
  process.exit(1);
});
