/**
 * Shapes and parsing for model-proposed enrichment.
 *
 * Deliberately free of any `vscode` import: this is pure data handling over
 * untrusted text, which means it can be tested in plain Node rather than only
 * inside a running editor. The model call itself lives in enrich.ts.
 *
 * Everything here is a *proposal*. The backend revalidates every quote against
 * the source document and drops what it cannot back, so nothing in this file
 * needs to be trusted - which is just as well, because it is model output.
 */

export interface ProposedGlossaryEntry {
  term: string;
  definition: string;
  evidence: string;
}

export interface ProposedComponent {
  name: string;
  evidence: string;
}

export interface ProposedDiagram {
  id: string;
  mermaid: string;
  title?: string;
  components: ProposedComponent[];
}

export interface ProposedEnrichment {
  summary?: string;
  glossary: ProposedGlossaryEntry[];
  diagrams: ProposedDiagram[];
  /**
   * Which provider answered, for the cover page's "Enriched By" line. Not part
   * of what the model returns - it is filled in afterwards by whoever asked,
   * and is absent when nothing answered at all.
   */
  provider?: string;
}

export const EMPTY_ENRICHMENT: ProposedEnrichment = { glossary: [], diagrams: [] };

/**
 * Parse a model's answer into an enrichment proposal.
 *
 * Models wrap JSON in fences, prefix it with "Here is the JSON:", and
 * occasionally emit a trailing comma. The first two are cheap to survive; the
 * rest is left to fail, because a document without a glossary is a much better
 * outcome than one built from half-parsed guesses.
 */
export function parseEnrichment(raw: string): ProposedEnrichment {
  const text = stripFences(raw).trim();
  if (!text) {
    return EMPTY_ENRICHMENT;
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return EMPTY_ENRICHMENT;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return EMPTY_ENRICHMENT;
  }

  if (!parsed || typeof parsed !== 'object') {
    return EMPTY_ENRICHMENT;
  }

  const source = parsed as Record<string, unknown>;
  return {
    summary: typeof source.summary === 'string' ? source.summary : undefined,
    glossary: asArray(source.glossary).flatMap(toGlossaryEntry),
    diagrams: asArray(source.diagrams).flatMap(toDiagram),
  };
}

function stripFences(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return fenced ? fenced[1] : text;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toGlossaryEntry(value: unknown): ProposedGlossaryEntry[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const entry = value as Record<string, unknown>;
  const term = typeof entry.term === 'string' ? entry.term.trim() : '';
  const definition = typeof entry.definition === 'string' ? entry.definition.trim() : '';
  const evidence = typeof entry.evidence === 'string' ? entry.evidence.trim() : '';

  return term && definition ? [{ term, definition, evidence }] : [];
}

function toDiagram(value: unknown, index: number): ProposedDiagram[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  const diagram = value as Record<string, unknown>;
  const mermaid = typeof diagram.mermaid === 'string' ? diagram.mermaid.trim() : '';
  if (!mermaid) {
    return [];
  }

  return [
    {
      id: typeof diagram.id === 'string' && diagram.id ? diagram.id : `ai-diagram-${index + 1}`,
      mermaid,
      title: typeof diagram.title === 'string' ? diagram.title : undefined,
      components: asArray(diagram.components).flatMap(toComponent),
    },
  ];
}

function toComponent(value: unknown): ProposedComponent[] {
  if (typeof value === 'string') {
    return value.trim() ? [{ name: value.trim(), evidence: value.trim() }] : [];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const component = value as Record<string, unknown>;
  const name = typeof component.name === 'string' ? component.name.trim() : '';
  const evidence = typeof component.evidence === 'string' ? component.evidence.trim() : name;
  return name ? [{ name, evidence }] : [];
}
