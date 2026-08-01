/**
 * Diagram Coverage Checker
 *
 * The AI enrichment call is non-deterministic: a section that clearly
 * qualifies as diagrammable (per EnrichmentPromptBuilder's Diagram
 * Generation Guidance) sometimes gets skipped anyway, especially with
 * smaller/cheaper models. This is a cheap, deterministic, client-side
 * heuristic that flags sections which LOOK diagrammable by heading alone
 * but have no diagram referencing them, so the pipeline can ask the AI for
 * one targeted follow-up pass rather than silently shipping a PDF with a
 * missing diagram.
 *
 * Deliberately conservative: matches only against the (short, deliberate)
 * section heading, not body content, to avoid false positives from
 * incidental word matches in long prose.
 */

import { Section, Diagram } from '../types';

export type DiagramCategory = 'architecture' | 'sequence' | 'state' | 'data-model' | 'flowchart';

export interface CoverageGap {
  heading: string;
  category: DiagramCategory;
}

const CATEGORY_PATTERNS: Array<{ category: DiagramCategory; pattern: RegExp }> = [
  { category: 'architecture', pattern: /\b(architecture|system design|components?)\b/i },
  { category: 'sequence', pattern: /\b(flow|sequence|interaction)\b/i },
  { category: 'state', pattern: /\b(lifecycle|state|status|workflow)\b/i },
  { category: 'data-model', pattern: /\b(data model|schema|entit(y|ies))\b/i },
  { category: 'flowchart', pattern: /\b(algorithm|flowchart|decision logic)\b/i },
];

export class DiagramCoverageChecker {
  /**
   * Return sections whose heading matches a diagrammable category but that
   * no diagram's sectionRef covers.
   */
  public findGaps(sections: Section[], diagrams: Diagram[]): CoverageGap[] {
    const coveredHeadings = new Set(diagrams.map(d => this.normalize(d.sectionRef)));

    const gaps: CoverageGap[] = [];
    for (const section of sections) {
      if (coveredHeadings.has(this.normalize(section.heading))) {
        continue;
      }
      const category = this.matchCategory(section.heading);
      if (category) {
        gaps.push({ heading: section.heading, category });
      }
    }
    return gaps;
  }

  private matchCategory(heading: string): DiagramCategory | null {
    for (const { category, pattern } of CATEGORY_PATTERNS) {
      if (pattern.test(heading)) {
        return category;
      }
    }
    return null;
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase();
  }
}
