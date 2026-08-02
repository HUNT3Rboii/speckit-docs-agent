/**
 * AI Provider Base Classes and Abstractions
 * Defines common functionality for all AI providers
 */

import { AIProvider, StructuredError, StructuredJSON } from '../types';
import { EnrichmentPromptBuilder } from './enrichmentPromptBuilder';

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
    structuredError?: StructuredError
  ): Promise<StructuredJSON>;

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
- "ungrounded_diagrams": either find the correct verbatim evidence quote from the source for
  the named component, or remove that component/diagram if no such text exists.
- "ungrounded_glossary": either find the correct verbatim evidence quote for the named term,
  or remove that glossary entry if no such text exists.
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
