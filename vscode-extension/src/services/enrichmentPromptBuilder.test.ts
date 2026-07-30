/**
 * Unit tests for EnrichmentPromptBuilder
 */

import { EnrichmentPromptBuilder } from './enrichmentPromptBuilder';

describe('EnrichmentPromptBuilder', () => {
  let builder: EnrichmentPromptBuilder;

  beforeEach(() => {
    builder = new EnrichmentPromptBuilder();
  });

  describe('buildPrompt', () => {
    it('should generate a prompt with the provided markdown content', () => {
      const markdown = '# Test Document\n\nThis is a test.';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain(markdown);
    });

    it('should include the document type in the prompt', () => {
      const markdown = '# Test';
      const documentType = 'requirements';
      const prompt = builder.buildPrompt(markdown, documentType);

      expect(prompt).toContain('requirements');
    });

    it('should use default document type when not provided', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('document');
    });

    it('should include the complete JSON schema', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      // Check for key schema interfaces
      expect(prompt).toContain('interface EnrichedJSON');
      expect(prompt).toContain('interface Section');
      expect(prompt).toContain('interface Diagram');
      expect(prompt).toContain('interface DiagramComponent');
      expect(prompt).toContain('interface GlossaryEntry');
      expect(prompt).toContain('interface Summaries');
    });

    it('should include all required field definitions', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      // Check for required top-level fields
      expect(prompt).toContain('title: string');
      expect(prompt).toContain('abstract: string');
      expect(prompt).toContain('sections: Section[]');
      expect(prompt).toContain('diagrams: Diagram[]');
      expect(prompt).toContain('glossary: GlossaryEntry[]');
      expect(prompt).toContain('summaries: Summaries');
    });

    it('should specify evidence requirements prominently', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Evidence Requirements');
      expect(prompt).toContain('REQUIRED');
      expect(prompt).toContain('Verbatim');
      expect(prompt).toContain('evidence');
    });

    it('should include evidence examples', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Bad Evidence Examples');
      expect(prompt).toContain('Good Evidence Examples');
    });

    it('should include self-check instructions', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Self-Check Instructions');
      expect(prompt).toContain('Heading Preservation Check');
      expect(prompt).toContain('Evidence Validation Check');
      expect(prompt).toContain('Mermaid Syntax Check');
      expect(prompt).toContain('Schema Compliance Check');
    });

    it('should include diagram guidance', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Diagram Generation Guidance');
      expect(prompt).toContain('When to Create Diagrams');
      expect(prompt).toContain('Component Evidence');
      expect(prompt).toContain('Valid Mermaid Syntax');
    });

    it('should include glossary guidance', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Glossary Extraction Guidance');
      expect(prompt).toContain('What to Include');
      expect(prompt).toContain('Maximum 30 terms');
    });

    it('should include summary guidance', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Summary Generation Guidance');
      expect(prompt).toContain('Executive Summary');
      expect(prompt).toContain('Section Summaries');
    });

    it('should include complete examples', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Complete Example');
      expect(prompt).toContain('Authentication System Specification');
    });

    it('should specify all SectionType enum values', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      const sectionTypes = [
        'normal',
        'callout',
        'open_question',
        'task',
        'user_story',
        'design_decision'
      ];

      for (const type of sectionTypes) {
        expect(prompt).toContain(type);
      }
    });

    it('should specify all DiagramType enum values', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      const diagramTypes = [
        'architecture',
        'sequence',
        'state',
        'data_model',
        'flowchart'
      ];

      for (const type of diagramTypes) {
        expect(prompt).toContain(type);
      }
    });

    it('should mention fuzzy matching threshold', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('85%');
    });

    it('should specify diagram limits', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('0-10 diagrams');
    });

    it('should specify glossary term limit', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('30 terms');
    });

    it('should emphasize no paraphrasing for evidence', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('No Paraphrasing');
      expect(prompt).toContain('Do NOT reword');
    });

    it('should instruct to return only JSON without markdown fences', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Return ONLY the JSON object');
      expect(prompt).toContain('no markdown code fences');
      expect(prompt).toContain('Start with { and end with }');
    });

    it('should handle markdown with special characters', () => {
      const markdown = '# Test\n\nThis has `code` and **bold** and [links](url).';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain(markdown);
    });

    it('should handle large markdown documents', () => {
      const markdown = '# Large Document\n\n' + 'Lorem ipsum dolor sit amet. '.repeat(1000);
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain(markdown);
      expect(prompt.length).toBeGreaterThan(20000); // Should include all content plus instructions
    });

    it('should include Requirement 2.5 self-check instructions', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      // Per Requirement 2.5: Extension_AI shall self-check before returning
      expect(prompt).toContain('Before returning your JSON output');
      expect(prompt).toContain('verify the following');
      expect(prompt).toContain('FIX THEM before returning');
    });

    it('should have consistent structure across multiple builds', () => {
      const markdown = '# Test Document';
      const prompt1 = builder.buildPrompt(markdown, 'spec');
      const prompt2 = builder.buildPrompt(markdown, 'spec');

      expect(prompt1).toBe(prompt2);
    });
  });

  describe('prompt structure', () => {
    it('should have sections in logical order', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      const schemaIndex = prompt.indexOf('Required JSON Schema');
      const evidenceIndex = prompt.indexOf('Evidence Requirements');
      const diagramIndex = prompt.indexOf('Diagram Generation Guidance');
      const glossaryIndex = prompt.indexOf('Glossary Extraction Guidance');
      const summaryIndex = prompt.indexOf('Summary Generation Guidance');
      const selfCheckIndex = prompt.indexOf('Self-Check Instructions');
      const exampleIndex = prompt.indexOf('Complete Example');

      // Verify sections appear in expected order
      expect(schemaIndex).toBeLessThan(evidenceIndex);
      expect(evidenceIndex).toBeLessThan(diagramIndex);
      expect(diagramIndex).toBeLessThan(glossaryIndex);
      expect(glossaryIndex).toBeLessThan(summaryIndex);
      expect(summaryIndex).toBeLessThan(selfCheckIndex);
      expect(selfCheckIndex).toBeLessThan(exampleIndex);
    });

    it('should include clear task description at the start', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      const lines = prompt.split('\n');
      expect(lines[0]).toContain('Task');
      expect(prompt.substring(0, 500)).toContain('Transform Markdown Document');
    });

    it('should end with clear output format instructions', () => {
      const markdown = '# Test';
      const prompt = builder.buildPrompt(markdown);

      expect(prompt).toContain('Output Format');
      expect(prompt.substring(prompt.length - 500)).toContain('Begin your transformation now');
    });
  });
});
