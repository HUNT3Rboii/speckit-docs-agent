/**
 * Generic AI Provider
 * Uses VS Code Language Model API with any available model
 */

import * as vscode from 'vscode';
import { StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider } from '../services/aiProvider';

/**
 * Generic provider for any available language model
 */
export class GenericProvider extends BaseAIProvider {
  private model: vscode.LanguageModelChat | null = null;

  /**
   * Check if any language model is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // Try to get any available model
      const models = await vscode.lm.selectChatModels();

      if (models.length > 0) {
        this.model = models[0];
        this.log('Generic model detected:', this.model.id);
        return true;
      }

      return false;
    } catch (error) {
      this.logError('Error detecting generic model:', error);
      return false;
    }
  }

  /**
   * Get provider name
   */
  public getProviderName(): string {
    return this.model ? `Generic (${this.model.id})` : 'Generic AI';
  }

  /**
   * Transform markdown to structured JSON using generic AI
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON> {
    if (!this.model) {
      throw new Error('No AI model available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    const prompt = this.buildTransformPrompt(sanitized, structuredError);

    try {
      this.log('Sending request to AI model...');

      // Create chat request
      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Send request with timeout
      const responsePromise = this.model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
      const timeoutPromise = this.createTimeoutPromise<vscode.LanguageModelChatResponse>(
        this.timeout,
        'AI model request timed out'
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Collect response text
      let responseText = '';
      for await (const fragment of response.text) {
        responseText += fragment;
      }

      this.log('Received response from AI model');

      // Extract and parse JSON
      const jsonStr = this.extractJSON(responseText);
      const parsed = JSON.parse(jsonStr) as StructuredJSON;

      // Add metadata
      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = this.getProviderName();

      return parsed;
    } catch (error: any) {
      this.logError('AI model transformation failed:', error);
      throw new Error(`AI model transformation failed: ${error.message}`);
    }
  }
}
