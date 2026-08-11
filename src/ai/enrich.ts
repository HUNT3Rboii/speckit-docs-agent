import * as vscode from 'vscode';

import { EMPTY_ENRICHMENT, ProposedEnrichment, parseEnrichment } from './parse';
import { NoProviderAvailableError, requestEnrichment } from './providers';

export { EMPTY_ENRICHMENT, parseEnrichment };
export type { ProposedComponent, ProposedDiagram, ProposedEnrichment, ProposedGlossaryEntry } from './parse';

/**
 * Enrichment via whatever model the user already has in their editor.
 *
 * VS Code's Language Model API is the whole reason this extension needs no API
 * key: Copilot, or anything else the user has authorised, answers the request
 * under their existing entitlement. Nothing is configured, nothing is billed
 * twice, and no key sits in settings waiting to be committed by accident.
 *
 * Everything produced here is a *proposal*. The backend revalidates every quote
 * against the source document and drops what it cannot back, so nothing in this
 * file needs to be trusted - which is just as well, because it is model output.
 */

// Long documents are truncated rather than refused: a partial glossary beats an
// error, and the interesting definitions are rarely in the last thousand lines.
const MAX_CHARS = 60_000;

const SYSTEM_PROMPT = `You annotate technical documents. You return JSON and nothing else.

Every claim you make must quote the document. The "evidence" field is a verbatim
excerpt copied from the document - not a paraphrase, not a summary, not your own
words. Anything whose evidence is not found in the document is discarded before
it reaches the reader, so inventing a plausible quote wastes the entry.

Return this shape:

{
  "summary": "one or two sentences describing the document",
  "glossary": [
    {"term": "...", "definition": "...", "evidence": "verbatim excerpt"}
  ],
  "diagrams": [
    {"id": "d1", "title": "...", "mermaid": "graph TD\\n  A --> B",
     "components": [{"name": "...", "evidence": "verbatim excerpt"}]}
  ]
}

Rules:
- Only define terms the document actually uses.
- Only draw diagrams for relationships the document actually states.
- Prefer fewer, well-supported entries over many weak ones.
- An empty list is a valid and correct answer.
- No markdown fences, no commentary, no explanation. JSON only.`;

/**
 * Ask the configured providers to annotate a document.
 *
 * Which provider answers is decided by speckitStandalone.providerPriority - the
 * editor's own models first by default, then any custom endpoint the user
 * added. A failure here is never fatal to a conversion: the caller falls back
 * to a plain PDF, which is what the document is anyway without annotation.
 */
export async function proposeEnrichment(
  markdown: string,
  token: vscode.CancellationToken,
  log: (message: string) => void
): Promise<ProposedEnrichment> {
  const document = markdown.length > MAX_CHARS ? markdown.slice(0, MAX_CHARS) : markdown;
  if (document.length < markdown.length) {
    log(`document truncated to ${MAX_CHARS} characters for enrichment`);
  }

  const answer = await requestEnrichment(
    { system: SYSTEM_PROMPT, user: `Document:

${document}` },
    token,
    log
  );

  if (!answer) {
    log('no provider produced usable enrichment; building a plain PDF');
    return EMPTY_ENRICHMENT;
  }

  log(`enriched by ${answer.provider}`);
  return answer.enrichment;
}

export { NoProviderAvailableError };
