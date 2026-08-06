/**
 * Local (non-AI) markdown section parsing.
 *
 * Root-cause fix for large documents hitting the AI model's output-length
 * ceiling: the extension previously asked the AI to both classify AND
 * reproduce every section's content verbatim/reformatted in its JSON
 * response, which meant total AI output scaled with total document size -
 * for a large enough document, the model got cut off mid-response before
 * finishing valid JSON, consistently at the same point every retry
 * (confirmed in practice on a ~13KB document, always truncating around
 * ~17KB of JSON output, well within a single response's token ceiling).
 *
 * The fix: the extension already HAS the original markdown locally, so
 * there's no need to have the AI reproduce it at all - only its
 * classification (SectionType) is genuinely something the AI needs to
 * provide. This module splits the source markdown into sections locally
 * and merges each one's real content back in after the AI responds
 * (which now only needs to return `type` per heading, not `content`),
 * cutting the AI's required output size roughly in proportion to how much
 * of the document is body text vs. structural metadata - typically the
 * majority of it.
 */

import { Section, SectionType } from '../types';

export interface ParsedSection {
  heading: string;
  content: string;
  level: number;
}

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/;
const CODE_FENCE_LINE = /^\s*(```|~~~)/;

/**
 * Splits markdown into a flat list of sections, one per heading (any
 * level 1-6, matching how sections[] has always been flattened -
 * html_generator.py renders each one independently via its own `level`,
 * not as a nested tree). Content before the first heading is dropped
 * (it's what title/abstract are derived from, not a section body).
 *
 * Skips heading-like lines (`# ...`) inside fenced code blocks (``` or
 * ~~~) - this codebase's own docs are full of shell/Python comments
 * (`# like this`) inside code fences that would otherwise be misread as
 * document structure.
 */
export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const lines = markdown.split('\n');
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let buffer: string[] = [];
  let inCodeFence = false;

  const flush = () => {
    if (current) {
      current.content = buffer.join('\n').trim();
      sections.push(current);
    }
    buffer = [];
  };

  for (const line of lines) {
    if (CODE_FENCE_LINE.test(line)) {
      inCodeFence = !inCodeFence;
      if (current) {
        buffer.push(line);
      }
      continue;
    }

    if (!inCodeFence) {
      const match = HEADING_LINE.exec(line);
      if (match) {
        flush();
        current = { heading: match[2].trim(), content: '', level: match[1].length };
        continue;
      }
    }

    if (current) {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

function normalizeHeading(heading: string): string {
  return heading.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds the final sections[] array: content and heading/level come from
 * the local parse (authoritative - every heading in the source is
 * guaranteed to appear, regardless of what the AI did or didn't mention),
 * `type` comes from whichever AI-returned section has a matching heading
 * (normalized: trimmed, lowercased, whitespace-collapsed). No match
 * (the AI skipped classifying it, or the heading text drifted) falls back
 * to "normal" - a missed classification is a minor quality issue now,
 * not a correctness failure, since content/heading preservation no
 * longer depends on the AI getting every heading right.
 */
export function mergeSectionContent(
  markdown: string,
  aiSections: Array<{ heading?: string; type?: string }> | undefined
): Section[] {
  const localSections = parseMarkdownSections(markdown);
  const aiByHeading = new Map<string, string>();
  for (const aiSection of aiSections ?? []) {
    if (aiSection?.heading && aiSection?.type) {
      aiByHeading.set(normalizeHeading(aiSection.heading), aiSection.type);
    }
  }

  return localSections.map((local) => ({
    heading: local.heading,
    content: local.content,
    type: (aiByHeading.get(normalizeHeading(local.heading)) as SectionType) || 'normal',
    level: local.level
  }));
}
