import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Locations of the runtimes bundled into the VSIX.
 *
 * The VSIX is built per platform, so exactly one `bin/<target>` directory ships
 * in any given install. Resolving the target here rather than probing the
 * filesystem means a missing runtime fails with the target name in the message.
 */

export type Target = 'win32-x64' | 'linux-x64' | 'darwin-x64' | 'darwin-arm64';

export class UnsupportedPlatformError extends Error {
  constructor(platform: string, arch: string) {
    super(`No bundled runtime for ${platform}-${arch}. Supported: win32-x64, linux-x64, darwin-x64, darwin-arm64.`);
    this.name = 'UnsupportedPlatformError';
  }
}

export class MissingRuntimeError extends Error {
  constructor(what: string, expectedAt: string) {
    super(
      `The bundled ${what} is missing from this installation (expected at ${expectedAt}). ` +
        `If you are running from source, run: npm run fetch-runtimes`
    );
    this.name = 'MissingRuntimeError';
  }
}

export function currentTarget(platform: NodeJS.Platform = process.platform, arch: string = process.arch): Target {
  const candidate = `${platform}-${arch}`;
  switch (candidate) {
    case 'win32-x64':
    case 'linux-x64':
    case 'darwin-x64':
    case 'darwin-arm64':
      return candidate;
    default:
      throw new UnsupportedPlatformError(platform, arch);
  }
}

export interface RuntimePaths {
  target: Target;
  python: string;
  typst: string;
  serverEntry: string;
}

export function resolveRuntimes(extensionPath: string, target: Target = currentTarget()): RuntimePaths {
  const binDir = path.join(extensionPath, 'bin', target);
  const isWindows = target.startsWith('win32');

  return {
    target,
    python: isWindows
      ? path.join(binDir, 'python', 'python.exe')
      : path.join(binDir, 'python', 'bin', 'python3'),
    typst: path.join(binDir, isWindows ? 'typst.exe' : 'typst'),
    serverEntry: path.join(extensionPath, 'server', 'main.py'),
  };
}

/** Fail before spawning, so the user sees which piece is missing. */
export function assertRuntimesPresent(paths: RuntimePaths): void {
  const checks: Array<[string, string]> = [
    ['Python interpreter', paths.python],
    ['Typst binary', paths.typst],
    ['backend entry point', paths.serverEntry],
  ];

  for (const [what, location] of checks) {
    if (!fs.existsSync(location)) {
      throw new MissingRuntimeError(what, location);
    }
  }
}

/**
 * Restore the executable bit on the bundled binaries.
 *
 * A VSIX is a zip, and the format's permission bits do not survive installation
 * on macOS or Linux - the interpreter and Typst arrive as 0644 and spawn fails
 * with EACCES. Windows does not use the bit at all, so this is a no-op there.
 */
export function ensureExecutable(paths: RuntimePaths): void {
  if (paths.target.startsWith('win32')) {
    return;
  }

  for (const binary of [paths.python, paths.typst]) {
    try {
      fs.chmodSync(binary, 0o755);
    } catch {
      // Read-only installs exist; let the spawn produce the real error rather
      // than failing here on a permission we may not have needed to change.
    }
  }
}

/** Fallback storage location for contexts that have no globalStorageUri. */
export function fallbackStoragePath(): string {
  return path.join(os.tmpdir(), 'speckit-standalone');
}
