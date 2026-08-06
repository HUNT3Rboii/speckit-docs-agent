import { parseMarkdownSections, mergeSectionContent } from './markdownSectionParser';

describe('parseMarkdownSections', () => {
  it('splits on headings of every level (1-6)', () => {
    const markdown = `# H1
a

## H2
b

### H3
c

#### H4
d

##### H5
e

###### H6
f`;
    const sections = parseMarkdownSections(markdown);
    expect(sections.map((s) => [s.heading, s.level])).toEqual([
      ['H1', 1],
      ['H2', 2],
      ['H3', 3],
      ['H4', 4],
      ['H5', 5],
      ['H6', 6]
    ]);
  });

  it('assigns each heading the content between it and the next heading', () => {
    const markdown = `# Title

## Overview
This is the overview.
It has two lines.

## Details
More text here.`;
    const sections = parseMarkdownSections(markdown);
    expect(sections).toEqual([
      { heading: 'Title', content: '', level: 1 },
      { heading: 'Overview', content: 'This is the overview.\nIt has two lines.', level: 2 },
      { heading: 'Details', content: 'More text here.', level: 2 }
    ]);
  });

  it('drops content before the first heading', () => {
    const markdown = `Some preamble text with no heading.

## First Heading
Body.`;
    const sections = parseMarkdownSections(markdown);
    expect(sections).toEqual([{ heading: 'First Heading', content: 'Body.', level: 2 }]);
  });

  it('returns an empty array for markdown with no headings at all', () => {
    expect(parseMarkdownSections('Just a paragraph, no headings.')).toEqual([]);
  });

  it('gives a heading immediately followed by another heading an empty content string', () => {
    const markdown = `## A
## B
Body of B.`;
    const sections = parseMarkdownSections(markdown);
    expect(sections).toEqual([
      { heading: 'A', content: '', level: 2 },
      { heading: 'B', content: 'Body of B.', level: 2 }
    ]);
  });

  it('does not treat a "#" inside a fenced code block as a heading', () => {
    // This project's own docs are full of shell/Python comments like this
    // inside code fences - misreading them as document structure was the
    // actual, real risk being guarded against here.
    const markdown = `## Real Heading
Some text.

\`\`\`python
# This is a Python comment, not a heading
print("hello")
\`\`\`

More text after the fence.`;
    const sections = parseMarkdownSections(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe('Real Heading');
    expect(sections[0].content).toContain('# This is a Python comment, not a heading');
    expect(sections[0].content).toContain('More text after the fence.');
  });

  it('handles a code fence using ~~~ the same way as ```', () => {
    const markdown = `## Heading
~~~bash
# not a heading
~~~
after`;
    const sections = parseMarkdownSections(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('# not a heading');
  });

  it('trims trailing/leading blank lines from content but preserves internal blank lines', () => {
    const markdown = `## Heading

Paragraph one.

Paragraph two.

`;
    const sections = parseMarkdownSections(markdown);
    expect(sections[0].content).toBe('Paragraph one.\n\nParagraph two.');
  });
});

describe('mergeSectionContent', () => {
  const markdown = `## Overview
Body of overview.

## Login Flow
Body of login flow.`;

  it('builds sections using local content and the AI-provided type, matched by heading', () => {
    const result = mergeSectionContent(markdown, [
      { heading: 'Overview', type: 'normal' },
      { heading: 'Login Flow', type: 'design_decision' }
    ]);

    expect(result).toEqual([
      { heading: 'Overview', content: 'Body of overview.', type: 'normal', level: 2 },
      { heading: 'Login Flow', content: 'Body of login flow.', type: 'design_decision', level: 2 }
    ]);
  });

  it('matches headings case-insensitively and ignoring extra whitespace', () => {
    const result = mergeSectionContent(markdown, [
      { heading: '  overview  ', type: 'callout' },
      { heading: 'LOGIN FLOW', type: 'task' }
    ]);

    expect(result[0].type).toBe('callout');
    expect(result[1].type).toBe('task');
  });

  it('defaults to "normal" when the AI never classified a heading', () => {
    const result = mergeSectionContent(markdown, [{ heading: 'Overview', type: 'callout' }]);

    expect(result[0].type).toBe('callout');
    expect(result[1].type).toBe('normal'); // "Login Flow" was never classified
  });

  it('defaults every section to "normal" when the AI section list is empty or undefined', () => {
    expect(mergeSectionContent(markdown, []).every((s) => s.type === 'normal')).toBe(true);
    expect(mergeSectionContent(markdown, undefined).every((s) => s.type === 'normal')).toBe(true);
  });

  it('ignores AI-provided headings that do not match anything in the source (extras are dropped, not invented)', () => {
    const result = mergeSectionContent(markdown, [
      { heading: 'Overview', type: 'callout' },
      { heading: 'A Heading That Does Not Exist', type: 'task' }
    ]);

    expect(result).toHaveLength(2); // only the two real headings, never 3
    expect(result.map((s) => s.heading)).toEqual(['Overview', 'Login Flow']);
  });

  it('guarantees every source heading is present even if the AI omitted every classification', () => {
    // This is the actual correctness guarantee the whole change is built
    // on: heading/content preservation no longer depends on the AI
    // remembering every heading.
    const result = mergeSectionContent(markdown, [{ heading: 'Unrelated', type: 'normal' }]);
    expect(result.map((s) => s.heading)).toEqual(['Overview', 'Login Flow']);
  });
});
