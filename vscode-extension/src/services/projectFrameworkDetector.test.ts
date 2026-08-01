/**
 * Unit tests for ProjectFrameworkDetector.
 * Uses real temp directories on disk (not mocked fs) since the whole point
 * of this class is real marker-file detection.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectFrameworkDetector } from './projectFrameworkDetector';

describe('ProjectFrameworkDetector', () => {
  let detector: ProjectFrameworkDetector;
  let tmpDir: string;

  beforeEach(() => {
    detector = new ProjectFrameworkDetector();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pfd-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects speckit from a .specify folder', async () => {
    fs.mkdirSync(path.join(tmpDir, '.specify'));

    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['speckit']);
  });

  it('detects kiro from a .kiro folder', async () => {
    fs.mkdirSync(path.join(tmpDir, '.kiro'));

    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['kiro']);
  });

  it('detects claude-code from a CLAUDE.md file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Instructions');

    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['claude-code']);
  });

  it('returns manual when no marker is present', async () => {
    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['manual']);
  });

  it('reports every marker present, not just the first match', async () => {
    fs.mkdirSync(path.join(tmpDir, '.kiro'));
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Instructions');

    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['kiro', 'claude-code']);
  });

  it('reports all three markers when all are present', async () => {
    fs.mkdirSync(path.join(tmpDir, '.specify'));
    fs.mkdirSync(path.join(tmpDir, '.kiro'));
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Instructions');

    const result = await detector.detect(tmpDir);

    expect(result).toEqual(['speckit', 'kiro', 'claude-code']);
  });

  it('does not detect a marker from a nonexistent workspace root', async () => {
    const result = await detector.detect(path.join(tmpDir, 'does-not-exist'));

    expect(result).toEqual(['manual']);
  });

  describe('formatLabel', () => {
    it('formats a single framework', () => {
      expect(detector.formatLabel(['speckit'])).toBe('Speckit');
    });

    it('formats multiple frameworks as a comma-joined list', () => {
      expect(detector.formatLabel(['kiro', 'claude-code'])).toBe('Kiro, Claude Code');
    });

    it('formats manual', () => {
      expect(detector.formatLabel(['manual'])).toBe('Manual');
    });
  });
});
