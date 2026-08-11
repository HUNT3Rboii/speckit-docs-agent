import mermaid from 'mermaid';

import type { MermaidRequest, MermaidResult } from '../../shared/protocol';
import { handle } from './bridge';

/**
 * Mermaid rendering, served to the extension host.
 *
 * This is the reason the webview is involved in PDF generation at all: it is a
 * browser, and mermaid needs one. Doing it here removes the bundled Chromium
 * (~150MB per platform) and the third-party API call that would otherwise send
 * the user's documents off the machine.
 */

let initialised = false;

function initialise(): void {
  if (initialised) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    // Typst renders SVG, but not <foreignObject> - which is what mermaid emits
    // for labels by default. With HTML labels off, every label is real SVG
    // <text> that Typst can lay out.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
    // Restricted to a font Typst resolves without a --font-path: the SVG names
    // its font, and a name Typst cannot find silently falls back mid-diagram.
    fontFamily: 'DejaVu Sans, sans-serif',
    theme: 'neutral',
    securityLevel: 'strict',
  });

  initialised = true;
}

/**
 * Mermaid measures text against the live document, so the diagram has to be in
 * the DOM. It goes somewhere invisible but laid out - `display: none` would
 * make every measurement zero.
 */
function scratchContainer(): HTMLElement {
  const existing = document.getElementById('mermaid-scratch');
  if (existing) {
    return existing;
  }

  const container = document.createElement('div');
  container.id = 'mermaid-scratch';
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'absolute';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1200px';
  document.body.appendChild(container);
  return container;
}

export async function renderDiagrams(diagrams: MermaidRequest[]): Promise<MermaidResult[]> {
  initialise();
  const container = scratchContainer();
  const rendered: MermaidResult[] = [];

  for (const diagram of diagrams) {
    try {
      // The id must be unique per render or mermaid reuses a stale element.
      const { svg } = await mermaid.render(`mermaid-${diagram.id}-${Date.now()}`, diagram.code, container);
      rendered.push({ id: diagram.id, svg, title: diagram.title });
    } catch (error) {
      // One unparseable diagram must not fail the document; the backend leaves
      // the original code block in place and the user is told which.
      rendered.push({
        id: diagram.id,
        error: error instanceof Error ? error.message : String(error),
        title: diagram.title,
      });
    }
  }

  container.innerHTML = '';
  return rendered;
}

export function registerMermaidHandler(): void {
  handle('renderMermaid', async (params) => ({
    rendered: await renderDiagrams((params.diagrams as MermaidRequest[]) ?? []),
  }));
}
