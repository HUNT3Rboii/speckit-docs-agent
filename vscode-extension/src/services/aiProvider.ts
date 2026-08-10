/**
 * AI Provider Base Classes and Abstractions
 * Defines common functionality for all AI providers
 */

import { AIProvider, CancellationSignal, StructuredError, StructuredJSON } from '../types';
import { EnrichmentPromptBuilder } from './enrichmentPromptBuilder';
import { repairAIGeneratedJSON } from './jsonParser';

/**
 * Thrown when the user cancels an in-flight transform (via
 * speckit.stopProcessing or the status bar item). Distinct from a normal
 * Error so callers up the stack (TransformPipeline) can tell "the user
 * asked to stop" apart from "something actually went wrong" and report it
 * accordingly, instead of showing a scary-looking failure notification for
 * something the user asked for.
 */
export class CancellationRequestedError extends Error {
  constructor() {
    super('Processing was cancelled.');
    this.name = 'CancellationRequestedError';
  }
}

/**
 * Base implementation with common functionality for all AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  protected timeout: number = 15000; // 15 seconds default timeout, per design
  private promptBuilder = new EnrichmentPromptBuilder();

  /**
   * Check if this provider is available in the current environment
   */
  public abstract isAvailable(): Promise<boolean>;

  /**
   * Get provider name/identifier
   */
  public abstract getProviderName(): string;

  /**
   * Transform markdown to structured JSON using AI
   */
  public abstract transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError,
    cancellation?: CancellationSignal
  ): Promise<StructuredJSON>;

  /**
   * Throws a recognizable "Cancelled" error if cancellation has already
   * been requested. Callers check this before starting expensive work
   * (rather than only reacting to it via a listener) so an already-stale
   * request never even starts a new AI call.
   */
  protected throwIfCancelled(cancellation?: CancellationSignal): void {
    if (cancellation?.isCancellationRequested) {
      throw new CancellationRequestedError();
    }
  }

  /**
   * Build the single-call enrichment prompt (title/abstract/sections with all
   * original headings preserved, evidence-cited diagrams/glossary, summaries).
   * See EnrichmentPromptBuilder for the full schema/evidence/self-check
   * instructions included.
   */
  protected createPrompt(markdown: string, documentType: string = 'document'): string {
    return this.promptBuilder.buildPrompt(markdown, documentType);
  }

  /**
   * Build a correction prompt for a retry: includes the original enrichment
   * request plus the backend's structured error, asking the AI to fix only
   * the flagged items (missing headings / ungrounded evidence / invalid
   * Mermaid syntax) and resubmit the complete corrected JSON.
   */
  protected createCorrectionPrompt(
    markdown: string,
    structuredError: StructuredError,
    documentType: string = 'document'
  ): string {
    const basePrompt = this.promptBuilder.buildPrompt(markdown, documentType);
    return `${basePrompt}

## Correction Required (Retry ${structuredError.retry_count})

Your previous submission failed backend validation. Fix ONLY the items below and
return the complete, corrected JSON object (all other fields unchanged):

${JSON.stringify(structuredError.errors, null, 2)}

Reminders:
- "schema_errors": your previous response was malformed or missing required fields, as listed
  above (e.g. "Section 7: Missing or invalid content" means section index 7 needs a non-empty
  content string). Fix each named issue directly and return the complete, valid JSON object.
- "missing_headings": add these headings back into sections[], preserving their original text.
- "ungrounded_diagrams": replace the named component's evidence with the correct verbatim quote
  from the source. Do NOT delete the component or the diagram to make this error go away - a
  diagram you already judged the content warranted is worth more than a clean validation pass,
  and if the quote genuinely cannot be found the backend drops that item on the final attempt
  and reports it to the user. Deleting it yourself hides that from them entirely.
  To re-quote: locate the sentence in the source that actually describes this component, and
  copy it character for character - including markdown markers like ** and \` - trimming only
  from the start or end, never from the middle. A longer quote that is exact beats a short one
  you tightened up.
- "ungrounded_glossary": same - replace the named term's evidence with the exact sentence from
  the source that defines or first uses it, rather than removing the entry.
- "mermaid_syntax_errors": fix the named diagram's mermaidCode so it parses correctly.
- "missing_diagrams": these named sections clearly warrant a diagram per the Diagram Generation
  Guidance above (architecture/sequence/state/data-model/flowchart content) but your previous
  response didn't include one for them. Add a diagram for EACH named section now, following the
  same evidence rules as every other diagram (every component needs a verbatim evidence quote).
  Do not remove or change any diagram that was already present.

Return ONLY the corrected JSON object, no explanations.`;
  }

  /**
   * Chooses the initial enrichment prompt or, if a prior /api/process call
   * returned a structured error, the correction prompt for a retry. Shared by
   * every VS Code Language Model-backed provider (Copilot/Claude/Kiro/Generic)
   * so each only needs a one-line call instead of duplicating this branch.
   *
   * sourcePath (when provided) is used to infer the document type so the
   * prompt can ask for task-list-specific output (see
   * inferDocumentType/taskDescriptions) - without it every call defaulted to
   * the literal string 'document', so the AI never actually knew when it was
   * looking at a tasks.md.
   */
  protected buildTransformPrompt(
    markdown: string,
    structuredError?: StructuredError,
    sourcePath?: string
  ): string {
    const documentType = sourcePath ? this.inferDocumentType(sourcePath) : 'document';
    return structuredError
      ? this.createCorrectionPrompt(markdown, structuredError, documentType)
      : this.createPrompt(markdown, documentType);
  }

  /**
   * Classify a document by its path for prompt purposes. Mirrors the
   * backend's IngestionService.classify() 'task' rule (source_path's
   * filename is tasks.md, or it lives under a tasks/ directory) closely
   * enough for prompt-selection purposes - it doesn't need to be identical,
   * just needs to catch the same tasks.md files the backend will later parse
   * into Kanban board rows.
   */
  protected inferDocumentType(sourcePath: string): string {
    const normalized = sourcePath.replace(/\\/g, '/').toLowerCase();
    const filename = normalized.split('/').pop() || '';
    if (filename === 'tasks.md' || normalized.includes('/tasks/')) {
      return 'task_list';
    }
    return 'document';
  }

  /**
   * Set timeout for AI requests
   */
  public setTimeout(ms: number): void {
    this.timeout = ms;
  }

  /**
   * Scale the request timeout to the document size. The previous flat 15s
   * timeout was tripping on larger documents (tasks.md especially - it asks
   * the model for a taskDescriptions entry per checklist item on top of the
   * usual sections/diagrams/glossary, meaningfully increasing generation
   * time) well before the model finished, silently and irrecoverably
   * falling back to the rule-based (non-AI) provider with zero user-visible
   * indication anything went wrong. 3ms/char keeps small documents fast
   * while giving large ones realistically enough time; floor/ceiling keep it
   * within a sane range either way. Ceiling raised to 3 minutes after a real
   * ~27KB tasks.md still timed out at the previous 90s cap against a smaller/
   * faster model (GPT-4o mini) generating a large amount of structured JSON.
   */
  protected computeTimeout(markdown: string): number {
    return Math.min(180000, Math.max(45000, markdown.length * 3));
  }

  /**
   * Create a timeout promise for race conditions
   */
  protected createTimeoutPromise<T>(ms: number, errorMessage: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), ms);
    });
  }

  /**
   * Sanitize markdown for AI processing (remove excessive whitespace, etc.)
   */
  protected sanitizeMarkdown(markdown: string): string {
    return markdown
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();
  }

  /**
   * Extract JSON from AI response that might include markdown code blocks
   */
  protected extractJSON(response: string): string {
    // Remove markdown code blocks
    let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*$/g, '');

    // Find first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return cleaned.trim();
  }

  /**
   * Parse an extracted JSON string into a StructuredJSON, repairing the
   * most common real-world mistakes first: unescaped backslashes from
   * literal Windows paths (e.g. "C:\Users\...") and missing commas
   * between array/object elements, both of which smaller models
   * frequently produce on long structured output. Previously every
   * provider called JSON.parse() directly with no repair attempt, so
   * these exact classes of error burned a full correction-retry cycle
   * (re-sending the whole document to the AI again) every time instead of
   * being fixed for free with a string-level repair.
   */
  protected parseJSON(jsonStr: string): StructuredJSON {
    try {
      return JSON.parse(jsonStr) as StructuredJSON;
    } catch (firstError: any) {
      const { result: repaired, fixCount, bailReason } = repairAIGeneratedJSON(jsonStr);
      try {
        return JSON.parse(repaired) as StructuredJSON;
      } catch (secondError: any) {
        if (!bailReason) {
          // repairAIGeneratedJSON reports a bailReason on every path
          // except "fully repaired" - if it's absent, JSON.parse(repaired)
          // above should have succeeded, so reaching this catch at all
          // shouldn't be possible. Defensive fallback: report the
          // original error rather than a "still invalid" message with
          // nothing to explain it.
          throw new Error(this.describeJSONParseError(jsonStr, firstError));
        }
        // bailReason says exactly why repair gave up (bad shape / looked
        // like truncation / an unrecognized error type / hit the
        // iteration cap) even when fixCount is 0 (it can bail on its very
        // first attempt, before fixing anything) - previously that
        // reasoning only ever reached the extension's DevTools console via
        // console.log, never the notification/output-channel text that
        // "Speckit: Show Extension Logs" actually displays.
        throw new Error(
          `${this.describeJSONParseError(jsonStr, firstError)} | repair fixed ${fixCount} issue(s) but gave up (${bailReason}), still invalid: ${this.describeJSONParseError(repaired, secondError)}`
        );
      }
    }
  }

  /**
   * Builds a diagnostic message for a JSON.parse failure that includes a
   * snippet of the actual content around the failure position (when the
   * error reports one), not just the generic error text - "Bad escaped
   * character at position 4999" alone gives no way to tell what's actually
   * there without re-triggering with speckit.enableDebugLogging on and
   * capturing a full raw response dump.
   */
  private describeJSONParseError(jsonStr: string, error: any): string {
    const message = error?.message ?? String(error);
    const match = /position (\d+)/.exec(message);
    if (!match) {
      return message;
    }
    const pos = parseInt(match[1], 10);
    const start = Math.max(0, pos - 30);
    const end = Math.min(jsonStr.length, pos + 30);
    const snippet = jsonStr.slice(start, end).replace(/\n/g, '\\n');
    return `${message} | near: ...${snippet}...`;
  }

  /**
   * Log debug information if debug logging is enabled
   */
  protected log(message: string, ...args: any[]): void {
    console.log(`[${this.getProviderName()}] ${message}`, ...args);
  }

  /**
   * Log error information
   */
  protected logError(message: string, error: any): void {
    console.error(`[${this.getProviderName()}] ${message}`, error);
  }
}
