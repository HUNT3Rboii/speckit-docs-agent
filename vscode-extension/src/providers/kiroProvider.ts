/**
 * Kiro AI Provider
 * Uses VS Code Language Model API to access Kiro
 */

import * as vscode from 'vscode';
import { StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider } from '../services/aiProvider';

/**
 * Kiro provider implementation
 * Detects Kiro through VSCode Language Model API
 */
export class KiroProvider extends BaseAIProvider {
  private model: vscode.LanguageModelChat | null = null;

  /**
   * Check if Kiro is available
   * Attempts to detect Kiro by vendor name or model ID patterns
   */
  public async isAvailable(): Promise<boolean> {
    try {
      // First try explicit vendor check for Kiro
      let models = await vscode.lm.selectChatModels({
        vendor: 'kiro'
      });

      // If no models found with vendor 'kiro', try model ID pattern matching
      if (models.length === 0) {
        const allModels = await vscode.lm.selectChatModels();
        models = allModels.filter(model => 
          model.id.toLowerCase().includes('kiro') ||
          model.name?.toLowerCase().includes('kiro')
        );
      }

      if (models.length > 0) {
        this.model = models[0];
        this.log('Kiro model detected:', this.model.id);
        return true;
      }

      return false;
    } catch (error) {
      this.logError('Error detecting Kiro:', error);
      return false;
    }
  }

  /**
   * Get provider name, including the specific model's human-readable name
   * once selected.
   */
  public getProviderName(): string {
    return this.model ? `Kiro — ${this.model.name}` : 'Kiro';
  }

  /**
   * Transform markdown to structured JSON using Kiro
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON> {
    if (!this.model) {
      throw new Error('Kiro model not available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    const prompt = this.buildTransformPrompt(sanitized, structuredError);

    try {
      this.log('Sending request to Kiro...');

      // Create chat request
      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Send request with timeout
      const responsePromise = this.model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
      const timeoutPromise = this.createTimeoutPromise<vscode.LanguageModelChatResponse>(
        this.timeout,
        'Kiro request timed out'
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      // Collect response text
      let responseText = '';
      for await (const fragment of response.text) {
        responseText += fragment;
      }

      this.log('Received response from Kiro');

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
        throw new Error('Kiro rate limit exceeded. Please try again later.');
      }

      // Handle token limits
      if (error.message?.includes('token') || error.message?.includes('length')) {
        throw new Error('Document too large for Kiro. Consider splitting into smaller files.');
      }

      this.logError('Kiro transformation failed:', error);
      throw new Error(`Kiro transformation failed: ${error.message}`);
    }
  }
}
