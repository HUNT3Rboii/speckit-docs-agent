import { MermaidRequest } from '../../shared/protocol';

/**
 * Finds mermaid code blocks so they can be rendered before the document is
 * converted.
 *
 * The scan lives on the host rather than in Python because the host is what
 * talks to the webview, and rendering has to happen before the backend sees the
 * markdown at all.
 *
 * Fences are matched the way CommonMark defines them: three or more backticks,
 * closed by at least as many, with the info string on the opening line. A
 * regex over the whole document would happily match a fence inside another
 * fence, which is how mermaid inside a documentation example gets rendered by
 * mistake.
 */
export function findMermaidBlocks(markdown: string): MermaidRequest[] {
  const lines = markdown.split(/\r?\n/);
  const found: MermaidRequest[] = [];

  let index = 0;
  while (index < lines.length) {
    const opening = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)/.exec(lines[index]);
    if (!opening) {
      index += 1;
      continue;
    }

    const [, , fence, info] = opening;
    const isMermaid = info.toLowerCase() === 'mermaid';
    const closer = new RegExp(`^\\s{0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);

    const body: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length && !closer.test(lines[cursor])) {
      body.push(lines[cursor]);
      cursor += 1;
    }

    if (isMermaid && body.length) {
      found.push({
        id: `diagram-${found.length + 1}`,
        code: body.join('\n').trim(),
        title: titleFor(lines, index),
      });
    }

    // Skip the whole block, closing fence included, so nested fences inside it
    // are never treated as openings.
    index = cursor + 1;
  }

  return found;
}

/**
 * Use the nearest heading above the diagram as its caption.
 *
 * Mermaid has no title of its own, and an uncaptioned figure in a numbered
 * document is worse than a slightly generic one.
 */
function titleFor(lines: string[], fenceIndex: number): string | undefined {
  for (let cursor = fenceIndex - 1; cursor >= 0 && fenceIndex - cursor < 12; cursor -= 1) {
    const heading = /^#{1,6}\s+(.*\S)\s*$/.exec(lines[cursor]);
    if (heading) {
      return heading[1];
    }
  }
  return undefined;
}
