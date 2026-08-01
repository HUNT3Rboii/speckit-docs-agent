/**
 * Project Framework Detector
 * Detects, from marker files/folders in a workspace root, which spec-driven
 * framework (if any) a project's markdown was authored with. This has to
 * run client-side: the backend has no filesystem visibility into the
 * caller's workspace, especially now that it runs containerized.
 *
 * Uses plain Node fs/path (not vscode.workspace.fs) so this stays pure
 * logic, testable under this project's Jest setup rather than requiring
 * the full VS Code Extension Host.
 */

import * as fs from 'fs';
import * as path from 'path';

export type AuthoringFramework = 'speckit' | 'kiro' | 'claude-code' | 'manual';

const DISPLAY_LABELS: Record<AuthoringFramework, string> = {
  speckit: 'Speckit',
  kiro: 'Kiro',
  'claude-code': 'Claude Code',
  manual: 'Manual',
};

/**
 * Marker files/folders checked at the workspace root, in priority order.
 * A project can legitimately have more than one marker present (e.g. this
 * very repo has both a .kiro/ folder and a CLAUDE.md file) - all matches
 * are reported rather than picking one arbitrarily.
 */
const MARKERS: Array<{ relativePath: string; framework: AuthoringFramework }> = [
  { relativePath: '.specify', framework: 'speckit' },
  { relativePath: '.kiro', framework: 'kiro' },
  { relativePath: 'CLAUDE.md', framework: 'claude-code' },
];

export class ProjectFrameworkDetector {
  /**
   * Detect authoring framework(s) present at a workspace root path.
   * Returns ['manual'] if no marker is found.
   */
  public async detect(workspaceRootPath: string): Promise<AuthoringFramework[]> {
    const detected: AuthoringFramework[] = [];

    for (const marker of MARKERS) {
      if (await this.exists(path.join(workspaceRootPath, marker.relativePath))) {
        detected.push(marker.framework);
      }
    }

    return detected.length > 0 ? detected : ['manual'];
  }

  /**
   * Human-readable, comma-joined label for a set of detected frameworks,
   * e.g. ["kiro", "claude-code"] -> "Kiro, Claude Code".
   */
  public formatLabel(frameworks: AuthoringFramework[]): string {
    return frameworks.map(f => DISPLAY_LABELS[f]).join(', ');
  }

  private async exists(fullPath: string): Promise<boolean> {
    try {
      await fs.promises.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
