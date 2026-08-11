import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as path from 'path';

import { MissingRuntimeError, UnsupportedPlatformError, assertRuntimesPresent, currentTarget, resolveRuntimes } from '../backend/paths';

describe('runtime paths', () => {
  it('maps supported platform/arch pairs to bundle targets', () => {
    assert.equal(currentTarget('win32', 'x64'), 'win32-x64');
    assert.equal(currentTarget('linux', 'x64'), 'linux-x64');
    assert.equal(currentTarget('darwin', 'arm64'), 'darwin-arm64');
  });

  it('names the platform it cannot serve', () => {
    assert.throws(() => currentTarget('linux', 'arm64'), (error: UnsupportedPlatformError) => {
      assert.match(error.message, /linux-arm64/);
      return true;
    });
  });

  it('puts the Windows interpreter beside python.exe and the others under bin/', () => {
    const windows = resolveRuntimes('/ext', 'win32-x64');
    assert.equal(windows.python, path.join('/ext', 'bin', 'win32-x64', 'python', 'python.exe'));
    assert.equal(windows.typst, path.join('/ext', 'bin', 'win32-x64', 'typst.exe'));

    const linux = resolveRuntimes('/ext', 'linux-x64');
    assert.equal(linux.python, path.join('/ext', 'bin', 'linux-x64', 'python', 'bin', 'python3'));
    assert.equal(linux.typst, path.join('/ext', 'bin', 'linux-x64', 'typst'));
  });

  it('fails before spawning, naming the missing piece', () => {
    // Spawn errors for a missing interpreter are opaque; this is what the user
    // actually reads when an install is incomplete.
    assert.throws(
      () => assertRuntimesPresent(resolveRuntimes('/nonexistent-extension-path', 'win32-x64')),
      (error: MissingRuntimeError) => {
        assert.match(error.message, /Python interpreter/);
        assert.match(error.message, /fetch-runtimes/);
        return true;
      }
    );
  });
});
