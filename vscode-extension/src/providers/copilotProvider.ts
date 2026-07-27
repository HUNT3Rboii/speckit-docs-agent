/**
 * GitHub Copilot AI Provider
 * Uses VS Code Language Model API to access Copilot
 */

import * as vscode from 'vscode';
import { StructuredJSON } from '../types';
import { BaseAIProvider } from '../services/aiProvider';

/**
 * GitHub Copilot provider implementation
 */
export class CopilotProvider extends BaseAIProvider {
  private model: vscode.LanguageModelChat | null = null;

  /**
   * Check if GitHub Copilot is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const models = await vscode.lm.selectChatModels({
        vendor: 'copilot'
      });

      if (models.length > 0) {
        this.model = models[0];
        this.log('Copilot model detected:', this.model.id);
        return true;
      }

      return false;
    } catch (error) {
      this.logError('Error detecting Copilot:', error);
      return false;
    }
  }

  /**
   * Get provider name
   */
  public getProviderName(): string {
    return 'GitHub Copilot';
  }

  /**
   * Transform markdown to structured JSON using Copilot
   */
  public async transform(markdown: string, sourcePath: string): Promise<StructuredJSON> {
    if (!this.model) {
      throw new Error('Copilot model not available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    const prompt = this.createPrompt(sanitized);

    try {
      this.log('Sending request to Copilot...');

      // Create chat request
      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Send request with timeout
      const responsePromise = this.model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
      const timeoutPromise = this.createTimeoutPromise<vscode.LanguageModelChatResponse>(
        this.timeout,
        'Copilot request timed out'
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Collect response text
      let responseText = '';
      for await (const fragment of response.text) {
        responseText += fragment;
      }

      this.log('Received response from Copilot');

      // Extract and parse JSON
      const jsonStr = this.extractJSON(responseText);
      const parsed = JSON.parse(jsonStr) as StructuredJSON;

      // Add metadata
      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = this.getProviderName();

      return parsed;
    } catch (error: any) {
      // Handle rate limiting
      if (error.message?.includes('rate limit')) {
        throw new Error('Copilot rate limit exceeded. Please try again later.');
      }

      // Handle token limits
      if (error.message?.includes('token') || error.message?.includes('length')) {
        throw new Error('Document too large for Copilot. Consider splitting into smaller files.');
      }

      this.logError('Copilot transformation failed:', error);
      throw new Error(`Copilot transformation failed: ${error.message}`);
    }
  }
}
