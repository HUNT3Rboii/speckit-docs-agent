#!/usr/bin/env node
// Downloads the bundled runtimes into bin/<target>/ for one platform target.
//
// The VSIX carries its own Python and its own Typst so the user installs
// nothing. Both are pinned: an unpinned interpreter would change behaviour
// under users between releases, and Typst compiler upgrades are breaking
// changes for the markup we emit.
//
//   node scripts/fetch-runtimes.mjs                 # host platform
//   node scripts/fetch-runtimes.mjs win32-x64       # explicit target
//   node scripts/fetch-runtimes.mjs --all           # every target
//
// Checksums live in runtimes.lock.json. A target with no recorded checksum is
// downloaded and its hash printed, so the first fetch of a new target tells you
// exactly what to paste into the lockfile - it does not silently trust it.

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir, rename, chmod, access } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = join(REPO_ROOT, 'bin');
const LOCKFILE = join(REPO_ROOT, 'runtimes.lock.json');

const PYTHON_RELEASE = '20260807';
const PYTHON_VERSION = '3.12.13';
const TYPST_VERSION = 'v0.15.1';

// install_only_stripped is the smallest build that still runs arbitrary
// packages; the full/debug variants are several times the size.
const TARGETS = {
  'win32-x64': {
    pythonTriple: 'x86_64-pc-windows-msvc',
    pythonExe: 'python/python.exe',
    typstAsset: `typst-x86_64-pc-windows-msvc.zip`,
    typstExe: 'typst.exe',
  },
  'linux-x64': {
    pythonTriple: 'x86_64-unknown-linux-gnu',
    pythonExe: 'python/bin/python3',
    typstAsset: `typst-x86_64-unknown-linux-musl.tar.xz`,
    typstExe: 'typst',
  },
  'darwin-x64': {
    pythonTriple: 'x86_64-apple-darwin',
    pythonExe: 'python/bin/python3',
    typstAsset: `typst-x86_64-apple-darwin.tar.xz`,
    typstExe: 'typst',
  },
  'darwin-arm64': {
    pythonTriple: 'aarch64-apple-darwin',
    pythonExe: 'python/bin/python3',
    typstAsset: `typst-aarch64-apple-darwin.tar.xz`,
    typstExe: 'typst',
  },
};

function pythonUrl(target) {
  const asset = `cpython-${PYTHON_VERSION}+${PYTHON_RELEASE}-${TARGETS[target].pythonTriple}-install_only_stripped.tar.gz`;
  return `https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_RELEASE}/${asset}`;
}

function typstUrl(target) {
  return `https://github.com/typst/typst/releases/download/${TYPST_VERSION}/${TARGETS[target].typstAsset}`;
}

function hostTarget() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  const target = `${platform}-${arch}`;
  if (!TARGETS[target]) {
    throw new Error(`No runtime mapping for host ${target}. Pass a target explicitly.`);
  }
  return target;
}

async function readLock() {
  try {
    return JSON.parse(await readFile(LOCKFILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return { python: {}, typst: {} };
    throw err;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

async function sha256(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

// tar and unzip are both present on Windows 10+ (bsdtar ships in System32), so
// this avoids pulling an archive library in as a build dependency.
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) => {
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`));
    });
  });
}

// Archives are named relative to their own directory: the `tar` Windows ships
// reads `C:\path` as host:path and tries to resolve a remote host.
//
// Only the Typst Windows build is a .zip, and which `tar` is first on PATH
// there is not predictable - Git Bash puts GNU tar ahead of System32's bsdtar,
// and GNU tar cannot read zip. PowerShell's Expand-Archive always can.
async function extract(archive) {
  const where = dirname(archive);
  const name = basename(archive);

  if (!name.endsWith('.zip')) {
    await run('tar', ['-xf', name], where);
    return;
  }

  try {
    await run('unzip', ['-q', name], where);
  } catch {
    await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${name}' -DestinationPath . -Force`], where);
  }
}

async function fetchOne(kind, url, expected, into, after) {
  // Beside the destination, not in the system temp directory: the unpacked
  // runtime is moved into place with rename(), which cannot cross volumes.
  // GitHub's Windows runners put TEMP on C: and the workspace on D:, so every
  // fetch there died with "EXDEV: cross-device link not permitted".
  await mkdir(into, { recursive: true });
  const scratch = await mkdtemp(join(into, '.colophon-runtime-'));
  try {
    const archive = join(scratch, url.split('/').pop());
    process.stdout.write(`  ${kind}: downloading ${url.split('/').pop()}\n`);
    await download(url, archive);

    const actual = await sha256(archive);
    if (expected && expected !== actual) {
      throw new Error(
        `${kind} checksum mismatch\n  expected ${expected}\n  actual   ${actual}\n` +
          `Refusing to unpack. Either the pin moved or the download was tampered with.`
      );
    }
    if (!expected) {
      process.stdout.write(`  ${kind}: no pin recorded, sha256 is ${actual}\n`);
    }

    await extract(archive);
    await after(scratch, into);
    return actual;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function placePython(scratch, into) {
  // The archive unpacks to a single `python/` directory.
  const target = join(into, 'python');
  await rm(target, { recursive: true, force: true });
  await rename(join(scratch, 'python'), target);
}

async function placeTypst(scratch, into, config) {
  // Typst archives unpack to typst-<triple>/typst[.exe]; only the binary is
  // needed - the bundled docs and LICENSE would ride along into the VSIX.
  const entries = await readdir(scratch, { withFileTypes: true });
  const dir = entries.find((entry) => entry.isDirectory() && entry.name.startsWith('typst-'));
  if (!dir) throw new Error('Typst archive did not contain the expected typst-* directory');

  const source = join(scratch, dir.name, config.typstExe);
  const destination = join(into, config.typstExe);
  await rm(destination, { force: true });
  await rename(source, destination);
  if (!config.typstExe.endsWith('.exe')) {
    await chmod(destination, 0o755);
  }
}

async function fetchTarget(target, lock) {
  const config = TARGETS[target];
  if (!config) throw new Error(`Unknown target ${target}. Known: ${Object.keys(TARGETS).join(', ')}`);

  const into = join(BIN_DIR, target);
  await mkdir(into, { recursive: true });
  process.stdout.write(`${target}\n`);

  const pythonHash = await fetchOne('python', pythonUrl(target), lock.python?.[target], into, placePython);
  const typstHash = await fetchOne('typst', typstUrl(target), lock.typst?.[target], into, (scratch, dest) =>
    placeTypst(scratch, dest, config)
  );

  // Fail loudly here rather than at extension activation, where the user sees
  // an opaque spawn error.
  for (const relative of [config.pythonExe, config.typstExe]) {
    await access(join(into, relative)).catch(() => {
      throw new Error(`Expected ${relative} under bin/${target} after extraction, but it is missing`);
    });
  }

  return { pythonHash, typstHash };
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.includes('--all') ? Object.keys(TARGETS) : [args.find((a) => !a.startsWith('--')) ?? hostTarget()];

  const lock = await readLock();
  lock.python ??= {};
  lock.typst ??= {};
  lock.pins = { python: `${PYTHON_VERSION}+${PYTHON_RELEASE}`, typst: TYPST_VERSION };

  for (const target of targets) {
    const { pythonHash, typstHash } = await fetchTarget(target, lock);
    lock.python[target] = pythonHash;
    lock.typst[target] = typstHash;
  }

  await writeFile(LOCKFILE, JSON.stringify(lock, null, 2) + '\n');
  process.stdout.write(`\nRuntimes ready. Checksums recorded in runtimes.lock.json\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch-runtimes failed: ${err.message}\n`);
  process.exit(1);
});
