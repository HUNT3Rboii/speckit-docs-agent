import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findMermaidBlocks } from '../markdown/mermaid';

describe('mermaid block scanning', () => {
  it('finds a fenced mermaid block and numbers it', () => {
    const blocks = findMermaidBlocks('# Doc\n\n```mermaid\ngraph TD\nA --> B\n```\n');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].id, 'diagram-1');
    assert.equal(blocks[0].code, 'graph TD\nA --> B');
  });

  it('numbers blocks in document order, matching the emitter', () => {
    const blocks = findMermaidBlocks('```mermaid\na\n```\n\ntext\n\n```mermaid\nb\n```\n');
    assert.deepEqual(
      blocks.map((block) => block.id),
      ['diagram-1', 'diagram-2']
    );
  });

  it('ignores other languages', () => {
    assert.deepEqual(findMermaidBlocks('```python\nx = 1\n```\n'), []);
  });

  it('does not treat a mermaid fence inside a longer fence as its own block', () => {
    // Documentation about mermaid is exactly where this bites: the inner fence
    // is an example, not a diagram to render.
    const markdown = '````markdown\n```mermaid\ngraph TD\n```\n````\n';
    assert.deepEqual(findMermaidBlocks(markdown), []);
  });

  it('handles tilde fences', () => {
    const blocks = findMermaidBlocks('~~~mermaid\ngraph TD\n~~~\n');
    assert.equal(blocks.length, 1);
  });

  it('captions a diagram with the nearest heading above it', () => {
    const blocks = findMermaidBlocks('## Request Flow\n\nSome prose.\n\n```mermaid\ngraph TD\n```\n');
    assert.equal(blocks[0].title, 'Request Flow');
  });

  it('leaves the caption empty when no heading is near', () => {
    assert.equal(findMermaidBlocks('```mermaid\ngraph TD\n```\n')[0].title, undefined);
  });

  it('skips an empty mermaid block', () => {
    assert.deepEqual(findMermaidBlocks('```mermaid\n```\n'), []);
  });

  it('tolerates an unclosed fence at end of file', () => {
    const blocks = findMermaidBlocks('```mermaid\ngraph TD\nA --> B\n');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].code, 'graph TD\nA --> B');
  });
});
