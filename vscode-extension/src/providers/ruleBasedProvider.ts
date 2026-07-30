/**
 * Rule-Based Provider (Fallback)
 * Uses deterministic parsing when no AI provider is available
 */

import { StructuredJSON, Section, SectionType } from '../types';
import { BaseAIProvider } from '../services/aiProvider';

/**
 * Rule-based fallback provider using markdown parsing
 */
export class RuleBasedProvider extends BaseAIProvider {
  /**
   * Always available as fallback
   */
  public async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Get provider name
   */
  public getProviderName(): string {
    return 'Rule-Based (Fallback)';
  }

  /**
   * Transform markdown to structured JSON using rule-based parsing
   */
  public async transform(markdown: string, _sourcePath: string): Promise<StructuredJSON> {
    return this.fallbackTransform(markdown, _sourcePath);
  }

  /**
   * Deterministic, structure-only transformation (Requirement 2.6): used both
   * as this provider's own transform() and as the AI-failure fallback other
   * providers can delegate to. Diagrams/glossary are intentionally empty
   * rather than omitted -- empty arrays satisfy the EnrichedJSON schema and
   * trivially pass evidence-grounding validation (nothing to ground), so a
   * structure-only document still renders cleanly with zero retries.
   */
  public fallbackTransform(markdown: string, sourcePath: string): StructuredJSON {
    this.log('Using rule-based transformation');

    const sanitized = this.sanitizeMarkdown(markdown);

    // Extract title
    const title = this.extractTitle(sanitized);

    // Generate abstract
    const abstract = this.generateAbstract(sanitized);

    // Split into sections
    const sections = this.extractSections(sanitized);

    return {
      title,
      abstract,
      sections,
      diagrams: [],
      glossary: [],
      summaries: { executiveSummary: abstract },
      source_path: sourcePath,
      ai_enhanced: false,
      agent_source: this.getProviderName()
    };
  }

  /**
   * Extract title from first H1 heading or infer from content
   */
  private extractTitle(markdown: string): string {
    // Try to find first H1
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Try to find any heading
    const anyHeadingMatch = markdown.match(/^#{1,6}\s+(.+)$/m);
    if (anyHeadingMatch) {
      return anyHeadingMatch[1].trim();
    }

    // Use first line as fallback
    const firstLine = markdown.split('\n')[0].trim();
    return firstLine.substring(0, 100) || 'Untitled Document';
  }

  /**
   * Generate abstract from first paragraph or sentences
   */
  private generateAbstract(markdown: string): string {
    // Remove headings to get to content
    const contentWithoutHeadings = markdown.replace(/^#{1,6}\s+.+$/gm, '');

    // Get first non-empty paragraph
    const paragraphs = contentWithoutHeadings
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    if (paragraphs.length > 0) {
      const firstParagraph = paragraphs[0];

      // Extract first 2-3 sentences
      const sentences = firstParagraph.match(/[^.!?]+[.!?]+/g) || [];
      const abstract = sentences.slice(0, 3).join(' ').trim();

      if (abstract.length > 0) {
        return abstract;
      }

      // Fallback to truncated first paragraph
      return firstParagraph.substring(0, 300) + (firstParagraph.length > 300 ? '...' : '');
    }

    return 'Document content analysis not available.';
  }

  /**
   * Extract and classify sections from markdown
   */
  private extractSections(markdown: string): Section[] {
    const sections: Section[] = [];

    // Split by H2 headings
    const h2Sections = markdown.split(/^##\s+/m).filter(s => s.trim().length > 0);

    // If no H2 sections, create one section from all content
    if (h2Sections.length <= 1) {
      const heading = this.extractTitle(markdown);
      const type = this.classifySection(markdown);
      sections.push({
        heading,
        content: markdown,
        type,
        level: 1
      });
      return sections;
    }

    // Process each H2 section
    for (let i = 1; i < h2Sections.length; i++) {
      const sectionText = h2Sections[i];
      const lines = sectionText.split('\n');
      const heading = lines[0].trim();
      const content = '## ' + sectionText;

      const type = this.classifySection(content);

      sections.push({
        heading,
        content,
        type,
        level: 2
      });
    }

    return sections;
  }

  /**
   * Classify section type based on content keywords
   */
  private classifySection(content: string): SectionType {
    const lowerContent = content.toLowerCase();

    // Task keywords
    const taskKeywords = [
      'todo', 'task', 'action item', '- [ ]', '- [x]',
      'implementation', 'step', 'checklist', 'milestone'
    ];
    if (taskKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'task';
    }

    // User story keywords
    const userStoryKeywords = [
      'user story', 'as a user', 'as an', 'acceptance criteria',
      'requirement', 'must', 'should', 'feature'
    ];
    if (userStoryKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'user_story';
    }

    // Design decision keywords
    const designKeywords = [
      'architecture', 'design', 'technical', 'decision',
      'approach', 'pattern', 'framework', 'technology',
      'rationale', 'trade-off', 'solution'
    ];
    if (designKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'design_decision';
    }

    // Default to normal
    return 'normal';
  }
}
