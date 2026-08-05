/**
 * JSON Parsing and Validation Service
 * Handles AI response parsing with repair logic and validation
 */

import { JSONParser as IJSONParser, StructuredJSON, ValidationResult, SectionType } from '../types';

const MAX_ESCAPE_REPAIR_ITERATIONS = 200;

/**
 * Fixes backslashes that aren't part of a valid JSON escape sequence - by
 * far the most common real-world way AI-generated JSON breaks in this
 * project, since the markdown being transformed is full of literal Windows
 * paths (e.g. "C:\Users\...") that smaller models frequently emit without
 * doubling the backslash, which JSON.parse rejects as "Bad escaped
 * character" (its error message includes the exact position of the
 * offending character).
 *
 * Deliberately does NOT use a blanket "backslash not followed by bfnrtu"
 * regex: n/t/r/f/b/u are all individually valid JSON escapes, and this
 * project's own path segments collide with several of them (\frontend,
 * \backend, \tests, \node_modules, \temp) - a naive regex would silently
 * mangle those into control characters instead of leaving them alone,
 * without JSON.parse ever complaining. Repeatedly re-parsing and fixing
 * only the exact position JSON.parse itself flags means only genuinely
 * broken escapes (e.g. "\U" from "C:\Users", not valid JSON) ever get
 * touched.
 */
export function fixInvalidJSONEscapes(jsonStr: string): string {
  let result = jsonStr;
  for (let i = 0; i < MAX_ESCAPE_REPAIR_ITERATIONS; i++) {
    try {
      JSON.parse(result);
      return result;
    } catch (error: any) {
      const match = /Bad escaped character in JSON at position (\d+)/.exec(error?.message ?? '');
      if (!match) {
        return result; // a different kind of error - nothing more this function can fix
      }
      const pos = parseInt(match[1], 10);
      if (result[pos - 1] !== '\\') {
        return result; // unexpected shape - bail rather than risk corrupting further
      }
      result = result.slice(0, pos - 1) + '\\' + result.slice(pos - 1);
    }
  }
  return result;
}

/**
 * Parses and validates AI-generated JSON with robust error handling
 */
export class JSONParser implements IJSONParser {
  /**
   * Parse AI response to structured JSON
   */
  public parse(response: string): StructuredJSON {
    // Strip markdown code blocks
    let cleaned = response.replace(/```json\s*/gi, '').replace(/```\s*$/g, '');

    // Extract JSON between first { and last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in response');
    }

    cleaned = cleaned.substring(firstBrace, lastBrace + 1);

    // Remove leading/trailing whitespace
    cleaned = cleaned.trim();

    try {
      // Try direct parse first
      return JSON.parse(cleaned) as StructuredJSON;
    } catch (error) {
      // Try repair logic
      console.log('[JSONParser] Initial parse failed, attempting repair');
      return this.repairAndParse(cleaned);
    }
  }

  /**
   * Validate structured JSON against the EnrichedJSON schema: required
   * fields for the backend's schema validator (title/abstract/sections/
   * diagrams/glossary/summaries), and that every diagram component and
   * glossary entry carries the evidence field the backend's grounding
   * validators require. Catching a malformed/incomplete AI response here,
   * before the network round trip, avoids a wasted retry_needed reply from
   * the backend for something client-side validation could catch instantly.
   */
  public validate(json: StructuredJSON): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field checks
    if (!json.title || typeof json.title !== 'string') {
      errors.push('Missing or invalid title field');
    }

    if (!json.abstract || typeof json.abstract !== 'string') {
      errors.push('Missing or invalid abstract field');
    }

    if (!json.sections || !Array.isArray(json.sections)) {
      errors.push('Missing or invalid sections array');
    } else {
      // Validate each section
      json.sections.forEach((section, index) => {
        if (!section.heading || typeof section.heading !== 'string') {
          errors.push(`Section ${index}: Missing or invalid heading`);
        }

        if (!section.content || typeof section.content !== 'string') {
          errors.push(`Section ${index}: Missing or invalid content`);
        }

        if (!section.type || !this.isValidSectionType(section.type)) {
          errors.push(`Section ${index}: Invalid section type "${section.type}"`);
        }

        if (typeof section.level !== 'number' || section.level < 1 || section.level > 6) {
          errors.push(`Section ${index}: Missing or invalid level (must be 1-6)`);
        }
      });

      // Warnings
      if (json.sections.length === 0) {
        warnings.push('Document has no sections');
      }
    }

    if (!Array.isArray(json.diagrams)) {
      errors.push('Missing or invalid diagrams array');
    } else {
      json.diagrams.forEach((diagram, index) => {
        if (!diagram.mermaidCode || typeof diagram.mermaidCode !== 'string') {
          errors.push(`Diagram ${index}: Missing or invalid mermaidCode`);
        }
        if (!Array.isArray(diagram.components) || diagram.components.length === 0) {
          errors.push(`Diagram ${index}: Missing components array`);
        } else {
          diagram.components.forEach((component, componentIndex) => {
            if (!component.evidence || typeof component.evidence !== 'string') {
              errors.push(
                `Diagram ${index}, component ${componentIndex} (${component.name ?? 'unknown'}): Missing evidence field`
              );
            }
          });
        }
      });
    }

    if (!Array.isArray(json.glossary)) {
      errors.push('Missing or invalid glossary array');
    } else {
      json.glossary.forEach((entry, index) => {
        if (!entry.evidence || typeof entry.evidence !== 'string') {
          errors.push(`Glossary entry ${index} (${entry.term ?? 'unknown'}): Missing evidence field`);
        }
      });
    }

    if (!json.summaries || typeof json.summaries.executiveSummary !== 'string') {
      errors.push('Missing or invalid summaries.executiveSummary field');
    }

    // Check source_path
    if (!json.source_path || typeof json.source_path !== 'string') {
      warnings.push('Missing source_path field');
    }

    // Check ai_enhanced
    if (typeof json.ai_enhanced !== 'boolean') {
      warnings.push('Missing or invalid ai_enhanced field');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Parse and validate in one step
   */
  public parseAndValidate(response: string): StructuredJSON {
    const parsed = this.parse(response);
    const validation = this.validate(parsed);

    if (!validation.valid) {
      throw new Error(`JSON validation failed: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn('[JSONParser] Validation warnings:', validation.warnings);
    }

    return parsed;
  }

  /**
   * Pretty print JSON for debugging
   */
  public prettyPrint(json: StructuredJSON): string {
    return JSON.stringify(json, null, 2);
  }

  /**
   * Attempt to repair common JSON errors
   */
  private repairAndParse(jsonStr: string): StructuredJSON {
    let repaired = jsonStr;

    // Fix invalid backslash escapes (e.g. unescaped Windows paths) first -
    // this is the single most common failure mode in practice.
    repaired = fixInvalidJSONEscapes(repaired);

    // Fix trailing commas in objects
    repaired = repaired.replace(/,(\s*})/g, '$1');

    // Fix trailing commas in arrays
    repaired = repaired.replace(/,(\s*])/g, '$1');

    // Fix unescaped quotes in strings (basic attempt)
    // This is tricky and may not catch all cases
    repaired = this.fixUnescapedQuotes(repaired);

    // Try to add missing closing braces
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
      console.log('[JSONParser] Added missing closing braces');
    }

    // Try to add missing closing brackets
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/]/g) || []).length;
    if (openBrackets > closeBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets);
      console.log('[JSONParser] Added missing closing brackets');
    }

    try {
      console.log('[JSONParser] Repair successful');
      return JSON.parse(repaired) as StructuredJSON;
    } catch (error) {
      console.error('[JSONParser] Repair failed:', error);
      throw new Error(`JSON parsing failed even after repair: ${error}`);
    }
  }

  /**
   * Attempt to fix unescaped quotes in string values
   * This is a simplified approach and may not handle all cases
   */
  private fixUnescapedQuotes(jsonStr: string): string {
    // This is a complex problem - we'll do a basic implementation
    // that handles the most common case: quotes in content strings
    
    // For now, just return as-is since this is very difficult to do reliably
    // without a full parser. The AI should generally provide valid JSON.
    return jsonStr;
  }

  /**
   * Check if section type is valid
   */
  private isValidSectionType(type: string): type is SectionType {
    const validTypes: SectionType[] = [
      'task',
      'user_story',
      'design_decision',
      'normal',
      'callout',
      'open_question'
    ];
    return validTypes.includes(type as SectionType);
  }
}
