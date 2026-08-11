import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEnrichment } from '../ai/parse';

/**
 * Model output is untrusted input. It arrives fenced, prefixed with commentary,
 * shaped wrongly, or truncated mid-sentence, and none of those may take a
 * conversion down - a document without a glossary is a fine outcome, a failed
 * build is not.
 */
describe('parsing model output', () => {
  it('reads a well-formed answer', () => {
    const result = parseEnrichment(
      JSON.stringify({
        summary: 'An order pipeline.',
        glossary: [{ term: 'idempotent', definition: 'Safe to retry.', evidence: 'replaying the same event' }],
        diagrams: [
          { id: 'd1', mermaid: 'graph TD\nA --> B', components: [{ name: 'Gateway', evidence: 'the API Gateway' }] },
        ],
      })
    );

    assert.equal(result.summary, 'An order pipeline.');
    assert.equal(result.glossary[0].term, 'idempotent');
    assert.equal(result.diagrams[0].components[0].name, 'Gateway');
  });

  it('unwraps a fenced code block', () => {
    const result = parseEnrichment('```json\n{"glossary": [], "diagrams": []}\n```');
    assert.deepEqual(result.glossary, []);
  });

  it('ignores commentary around the JSON', () => {
    const result = parseEnrichment('Here is the JSON you asked for:\n{"summary": "x"}\nHope that helps!');
    assert.equal(result.summary, 'x');
  });

  it('returns empty enrichment for unparseable output', () => {
    // Better a plain PDF than one built from half-parsed guesses.
    const result = parseEnrichment('I am unable to help with that request.');
    assert.equal(result.summary, undefined);
    assert.deepEqual(result.glossary, []);
    assert.deepEqual(result.diagrams, []);
  });

  it('returns empty enrichment for truncated JSON', () => {
    const result = parseEnrichment('{"glossary": [{"term": "idem');
    assert.deepEqual(result.glossary, []);
  });

  it('survives a glossary that is not a list', () => {
    const result = parseEnrichment('{"glossary": "none", "diagrams": 7}');
    assert.deepEqual(result.glossary, []);
    assert.deepEqual(result.diagrams, []);
  });

  it('drops entries missing a term or definition', () => {
    const result = parseEnrichment(
      '{"glossary": [{"term": "a"}, {"definition": "b"}, {"term": "c", "definition": "d", "evidence": "e"}]}'
    );
    assert.deepEqual(
      result.glossary.map((entry) => entry.term),
      ['c']
    );
  });

  it('keeps an entry with no evidence so the backend can report why it went', () => {
    // Dropping it here would lose the reason; the backend names what it removed.
    const result = parseEnrichment('{"glossary": [{"term": "a", "definition": "b"}]}');
    assert.equal(result.glossary[0].evidence, '');
  });

  it('drops a diagram with no mermaid source', () => {
    const result = parseEnrichment('{"diagrams": [{"id": "d1", "components": []}]}');
    assert.deepEqual(result.diagrams, []);
  });

  it('gives an unnamed diagram a stable id', () => {
    const result = parseEnrichment('{"diagrams": [{"mermaid": "graph TD"}]}');
    assert.equal(result.diagrams[0].id, 'ai-diagram-1');
  });

  it('accepts components given as bare strings', () => {
    const result = parseEnrichment('{"diagrams": [{"mermaid": "graph TD", "components": ["Gateway"]}]}');
    assert.deepEqual(result.diagrams[0].components, [{ name: 'Gateway', evidence: 'Gateway' }]);
  });

  it('treats an empty answer as no enrichment', () => {
    assert.deepEqual(parseEnrichment('').glossary, []);
    assert.deepEqual(parseEnrichment('   ').diagrams, []);
  });
});
