/**
 * Unit tests for JSONParser, focused on the EnrichedJSON schema validation
 * added to check diagrams/glossary/summaries and their evidence fields
 * client-side, before the network round trip to the backend.
 */

import { JSONParser } from './jsonParser';
import { StructuredJSON } from '../types';

function baseDoc(overrides: Partial<StructuredJSON> = {}): StructuredJSON {
  return {
    title: 'Doc',
    abstract: 'An abstract.',
    sections: [{ heading: 'Overview', content: 'Some content.', type: 'normal', level: 1 }],
    diagrams: [],
    glossary: [],
    summaries: { executiveSummary: 'Summary.' },
    source_path: 'docs/test.md',
    ai_enhanced: true,
    ...overrides
  };
}

describe('JSONParser', () => {
  let parser: JSONParser;

  beforeEach(() => {
    parser = new JSONParser();
  });

  describe('parse', () => {
    it('parses a plain JSON object', () => {
      const result = parser.parse('{"title": "T", "abstract": "A"}');
      expect(result.title).toBe('T');
    });

    it('strips markdown code fences before parsing', () => {
      const result = parser.parse('```json\n{"title": "T", "abstract": "A"}\n```');
      expect(result.title).toBe('T');
    });

    it('repairs a trailing comma', () => {
      const result = parser.parse('{"title": "T", "abstract": "A",}');
      expect(result.title).toBe('T');
    });

    it('repairs an unbalanced nested closing brace', () => {
      // At least one closing brace must be present for parse() to locate a
      // JSON object boundary at all; repair then balances the remaining count.
      const result = parser.parse('{"title": "T", "nested": {"a": 1}');
      expect(result.title).toBe('T');
    });

    it('throws when no JSON object is present', () => {
      expect(() => parser.parse('not json at all')).toThrow();
    });
  });

  describe('validate - enriched schema', () => {
    it('accepts a fully valid enriched document', () => {
      const result = parser.validate(baseDoc());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects a section missing level', () => {
      const doc = baseDoc({
        sections: [{ heading: 'H', content: 'C', type: 'normal' } as any]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('level'))).toBe(true);
    });

    it('rejects a section with an invalid type', () => {
      const doc = baseDoc({
        sections: [{ heading: 'H', content: 'C', type: 'bogus' as any, level: 1 }]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
    });

    it('accepts the new callout and open_question section types', () => {
      const doc = baseDoc({
        sections: [
          { heading: 'A', content: 'C', type: 'callout', level: 1 },
          { heading: 'B', content: 'C', type: 'open_question', level: 2 }
        ]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(true);
    });

    it('rejects a missing diagrams array', () => {
      const doc = baseDoc();
      delete (doc as any).diagrams;
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('diagrams'))).toBe(true);
    });

    it('rejects a diagram component missing evidence', () => {
      const doc = baseDoc({
        diagrams: [
          {
            type: 'architecture',
            mermaidCode: 'graph LR\nA-->B',
            sectionRef: 'Overview',
            location: 'after-section-1',
            components: [{ name: 'A' } as any]
          }
        ]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('evidence'))).toBe(true);
    });

    it('rejects a diagram with an empty components array', () => {
      const doc = baseDoc({
        diagrams: [
          {
            type: 'architecture',
            mermaidCode: 'graph LR\nA-->B',
            sectionRef: 'Overview',
            location: 'after-section-1',
            components: []
          }
        ]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
    });

    it('accepts a valid diagram with evidence-cited components', () => {
      const doc = baseDoc({
        diagrams: [
          {
            type: 'architecture',
            mermaidCode: 'graph LR\nA-->B',
            sectionRef: 'Overview',
            location: 'after-section-1',
            components: [{ name: 'A', evidence: 'text from source' }]
          }
        ]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(true);
    });

    it('rejects a glossary entry missing evidence', () => {
      const doc = baseDoc({
        glossary: [{ term: 'API', definition: 'Def' } as any]
      });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('evidence'))).toBe(true);
    });

    it('rejects missing summaries.executiveSummary', () => {
      const doc = baseDoc({ summaries: {} as any });
      const result = parser.validate(doc);
      expect(result.valid).toBe(false);
    });

    it('warns but does not fail on missing source_path', () => {
      const doc = baseDoc();
      delete (doc as any).source_path;
      const result = parser.validate(doc);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('source_path'))).toBe(true);
    });
  });

  describe('parseAndValidate', () => {
    it('throws with the specific validation errors on invalid input', () => {
      const invalidJson = JSON.stringify(baseDoc({ title: '' }));
      expect(() => parser.parseAndValidate(invalidJson)).toThrow(/title/);
    });

    it('returns the parsed object for valid input', () => {
      const validJson = JSON.stringify(baseDoc());
      const result = parser.parseAndValidate(validJson);
      expect(result.title).toBe('Doc');
    });
  });
});
