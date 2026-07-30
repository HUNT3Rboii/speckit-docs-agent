/**
 * Unit tests for RuleBasedProvider, in particular that its fallback output
 * (Requirement 2.6) is schema-valid against the EnrichedJSON contract: empty
 * diagrams/glossary arrays plus a populated summaries.executiveSummary, so a
 * structure-only document still passes the backend's evidence-grounding
 * validators (nothing to ground) instead of being rejected outright.
 */

import { RuleBasedProvider } from './ruleBasedProvider';

describe('RuleBasedProvider', () => {
  let provider: RuleBasedProvider;

  beforeEach(() => {
    provider = new RuleBasedProvider();
  });

  it('is always available', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('reports itself as not AI-enhanced', async () => {
    const result = await provider.transform('# Title\n\nSome content.', 'docs/test.md');
    expect(result.ai_enhanced).toBe(false);
    expect(result.agent_source).toBe('Rule-Based (Fallback)');
  });

  it('produces an empty (but present) diagrams array', async () => {
    const result = await provider.transform('# Title\n\nSome content.', 'docs/test.md');
    expect(Array.isArray(result.diagrams)).toBe(true);
    expect(result.diagrams).toHaveLength(0);
  });

  it('produces an empty (but present) glossary array', async () => {
    const result = await provider.transform('# Title\n\nSome content.', 'docs/test.md');
    expect(Array.isArray(result.glossary)).toBe(true);
    expect(result.glossary).toHaveLength(0);
  });

  it('produces a non-empty executiveSummary', async () => {
    const result = await provider.transform(
      '# Title\n\nThis document explains the system in detail.',
      'docs/test.md'
    );
    expect(result.summaries.executiveSummary.length).toBeGreaterThan(0);
  });

  it('assigns level 1 to the whole-document fallback section', async () => {
    const result = await provider.transform('# Title\n\nJust one paragraph, no H2s.', 'docs/test.md');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].level).toBe(1);
  });

  it('assigns level 2 to each H2-delimited section', async () => {
    const markdown = '# Title\n\n## First\n\nContent one.\n\n## Second\n\nContent two.';
    const result = await provider.transform(markdown, 'docs/test.md');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    for (const section of result.sections) {
      expect(section.level).toBe(2);
    }
  });

  it('extracts the title from the first H1', async () => {
    const result = await provider.transform('# My Title\n\nBody text.', 'docs/test.md');
    expect(result.title).toBe('My Title');
  });

  it('classifies a checklist section as task', async () => {
    const markdown = '# Title\n\n## Tasks\n\n- [ ] Do the thing\n- [x] Done thing';
    const result = await provider.transform(markdown, 'docs/test.md');
    const taskSection = result.sections.find(s => s.heading === 'Tasks');
    expect(taskSection?.type).toBe('task');
  });

  it('stamps the source_path onto the result', async () => {
    const result = await provider.transform('# Title\n\nBody.', 'specs/demo/spec.md');
    expect(result.source_path).toBe('specs/demo/spec.md');
  });
});
