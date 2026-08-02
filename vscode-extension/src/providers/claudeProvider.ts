/**
 * Claude AI Provider
 * Uses VS Code Language Model API to access Claude
 */

import * as vscode from 'vscode';
import { StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider } from '../services/aiProvider';

/**
 * Claude (Anthropic) provider implementation
 */
export class ClaudeProvider extends BaseAIProvider {
  private model: vscode.LanguageModelChat | null = null;

  /**
   * Check if Claude is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels({
        vendor: 'anthropic'
      });

      if (models.length > 0) {
        this.model = models[0];
        this.log('Claude model detected:', this.model.id);
        return true;
      }

      return false;
    } catch (error) {
      this.logError('Error detecting Claude:', error);
      return false;
    }
  }

  /**
   * Get provider name, including the specific model's human-readable name
   * once selected (e.g. "Anthropic — Claude Sonnet 5").
   */
  public getProviderName(): string {
    return this.model ? `Anthropic — ${this.model.name}` : 'Claude';
  }

  /**
   * Transform markdown to structured JSON using Claude
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON> {
    if (!this.model) {
      throw new Error('Claude model not available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    this.setTimeout(this.computeTimeout(sanitized));
    const prompt = this.buildTransformPrompt(sanitized, structuredError, sourcePath);

    try {
      this.log('Sending request to Claude...');

      // Create chat request
      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Send request with timeout
      const responsePromise = this.model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
      const timeoutPromise = this.createTimeoutPromise<vscode.LanguageModelChatResponse>(
        this.timeout,
        'Claude request timed out'
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Collect response text
      let responseText = '';
      for await (const fragment of response.text) {
        responseText += fragment;
      }

      this.log('Received response from Claude');

      // Extract and parse JSON
      const jsonStr = this.extractJSON(responseText);
      const parsed = JSON.parse(jsonStr) as StructuredJSON;

      // Add metadata
      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = this.getProviderName();

      return parsed;
    } catch (error: any) {
      this.logError('Claude transformation failed:', error);
      throw new Error(`Claude transformation failed: ${error.message}`);
    }
  }
}
