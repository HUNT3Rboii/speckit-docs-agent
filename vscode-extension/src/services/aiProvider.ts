/**
 * AI Provider Base Classes and Abstractions
 * Defines common functionality for all AI providers
 */

import { AIProvider, StructuredJSON } from '../types';

/**
 * Base implementation with common functionality for all AI providers
 */
export abstract class BaseAIProvider implements AIProvider {
  protected timeout: number = 30000; // 30 seconds default timeout

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
  public abstract transform(markdown: string, sourcePath: string): Promise<StructuredJSON>;

  /**
   * Create the standard prompt for markdown transformation
   */
  protected createPrompt(markdown: string): string {
    return `You are a documentation analysis assistant. Transform the following markdown document into structured JSON format.

REQUIRED OUTPUT FORMAT (must be valid JSON):
{
  "title": "string - extract from first H1 heading or infer from content",
  "abstract": "string - 2-3 sentence summary of the document",
  "sections": [
    {
      "heading": "string - section title",
      "content": "string - full markdown content of section",
      "type": "string - one of: task, user_story, design_decision, normal"
    }
  ]
}

SECTION TYPE CLASSIFICATION RULES:
- "task": Contains action items, TODOs, implementation steps, checklists
- "user_story": Describes user needs, requirements, acceptance criteria  
- "design_decision": Explains architecture, technical choices, design rationale
- "normal": General documentation, explanations, background information

INSTRUCTIONS:
1. Extract the title from the first H1 heading (# Title). If no H1 exists, infer a title from the content.
2. Generate a concise abstract (2-3 sentences) summarizing the document's purpose and key points.
3. Split the document into logical sections based on headings (H2, H3, etc.).
4. For each section, classify its type based on the content.
5. Preserve the original markdown formatting in the content field.
6. Return ONLY the JSON object, no additional text or explanation.

MARKDOWN DOCUMENT:
${markdown}

Return the structured JSON now:`;
  }

  /**
   * Set timeout for AI requests
   */
  public setTimeout(ms: number): void {
    this.timeout = ms;
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
