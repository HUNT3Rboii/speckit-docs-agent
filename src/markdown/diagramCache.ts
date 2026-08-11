import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { MermaidRequest, MermaidResult } from '../../shared/protocol';

/**
 * Rendered diagrams, keyed by the mermaid source that produced them.
 *
 * Rendering is a round trip to the webview and back, and most conversions are
 * re-conversions where the diagrams did not change. Keying on content rather
 * than on document or position means an unchanged diagram survives being moved,
 * renamed, or copied into another file.
 *
 * The cache is on disk under the extension's storage so it survives a window
 * reload - the case where the panel has to be reopened is exactly when the
 * round trip is most expensive.
 */
export class DiagramCache {
  private readonly memory = new Map<string, string>();

  constructor(private readonly directory: string) {}

  private keyFor(code: string): string {
    return crypto.createHash('sha256').update(code.trim()).digest('hex');
  }

  private fileFor(key: string): string {
    return path.join(this.directory, `${key}.svg`);
  }

  get(code: string): string | undefined {
    const key = this.keyFor(code);

    const remembered = this.memory.get(key);
    if (remembered) {
      return remembered;
    }

    try {
      const svg = fs.readFileSync(this.fileFor(key), 'utf8');
      this.memory.set(key, svg);
      return svg;
    } catch {
      // A missing or unreadable entry is a miss, never an error: the worst case
      // is rendering something that was already rendered.
      return undefined;
    }
  }

  set(code: string, svg: string): void {
    const key = this.keyFor(code);
    this.memory.set(key, svg);

    try {
      fs.mkdirSync(this.directory, { recursive: true });
      fs.writeFileSync(this.fileFor(key), svg, 'utf8');
    } catch {
      // In-memory is still useful for the rest of this session.
    }
  }

  /**
   * Split a batch into what is already known and what has to be rendered.
   *
   * Returned in the caller's order, so a diagram's position in the document is
   * unaffected by whether it happened to be cached.
   */
  partition(diagrams: MermaidRequest[]): { cached: MermaidResult[]; missing: MermaidRequest[] } {
    const cached: MermaidResult[] = [];
    const missing: MermaidRequest[] = [];

    for (const diagram of diagrams) {
      const svg = this.get(diagram.code);
      if (svg) {
        cached.push({ id: diagram.id, svg, title: diagram.title });
      } else {
        missing.push(diagram);
      }
    }

    return { cached, missing };
  }

  /** Store a fresh batch, ignoring the ones that failed to render. */
  remember(diagrams: MermaidRequest[], rendered: MermaidResult[]): void {
    const byId = new Map(diagrams.map((diagram) => [diagram.id, diagram.code]));

    for (const result of rendered) {
      const code = byId.get(result.id);
      if (code && result.svg) {
        this.set(code, result.svg);
      }
    }
  }
}
