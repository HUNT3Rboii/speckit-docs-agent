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

/**
 * Emoji and the joining characters that build composed emoji sequences.
 * Extended_Pictographic covers the pictographs themselves (🏗, ⚡, ™);
 * Emoji_Modifier plus the explicit range cover skin tones and regional
 * indicators (flags), and U+FE0E/U+FE0F/U+200D are the text and emoji
 * variation selectors and the zero-width joiner that glue sequences together.
 */
/* Written as an alternation rather than one character class: a class holding
 * both pictographs and the modifiers that combine with them trips
 * no-misleading-character-class, which exists to catch exactly the case where
 * a class looks like it matches whole emoji but matches their pieces. Matching
 * the pieces individually is the intent here, since all of them are removed. */
const DECORATION_PATTERN =
  /\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u{1F1E6}-\u{1F1FF}]|\uFE0E|\uFE0F|\u200D/gu;

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

  /**
   * Headings and sectionRefs have to compare equal for coverage to be
   * detected at all, and documents routinely decorate headings with emoji
   * ("## 🏗️ Architecture") that the AI then omits from the sectionRef it
   * reports ("Architecture"). Comparing raw text makes every such section look
   * uncovered, so a diagram gets requested for a section that already has one.
   *
   * Emoji are dropped, along with the variation selectors, ZWJs and skin-tone
   * modifiers that make up composed sequences; whitespace left behind by the
   * removal is collapsed. Digits and "#"/"*" are deliberately NOT treated as
   * emoji here - they carry Emoji_Component in Unicode, and stripping them
   * would mangle ordinary headings like "Step 2: Data Flow".
   */
  private normalize(text: string): string {
    return (text ?? '')
      .replace(DECORATION_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}
