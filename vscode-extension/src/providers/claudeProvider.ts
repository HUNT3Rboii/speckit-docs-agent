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
   * Check if Claude is available.
   *
   * Whether a Claude-providing extension (e.g. Claude Code) registers
   * itself under vendor 'anthropic' the way this checks first is not
   * something we control or can assume - if that lookup comes back empty,
   * fall back to enumerating every model this extension CAN see (mirrors
   * CopilotProvider/KiroProvider's same pattern) and log the result either
   * way, so it's visible in the output channel whether no Claude model is
   * registered at all vs. it's registered under an unexpected vendor id.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      let models = await vscode.lm.selectChatModels({
        vendor: 'anthropic'
      });

      if (models.length === 0) {
        const allModels = await vscode.lm.selectChatModels();
        this.log(
          `No models found for vendor 'anthropic'. All models visible to this extension: ${
            allModels.length > 0
              ? allModels.map(m => `${m.vendor}/${m.family}/${m.id}`).join(', ')
              : '(none - check that this extension has been granted language model access)'
          }`
        );
        models = allModels.filter(model =>
          model.vendor?.toLowerCase().includes('anthropic') ||
          model.vendor?.toLowerCase().includes('claude') ||
          model.id.toLowerCase().includes('claude') ||
          model.name?.toLowerCase().includes('claude')
        );
      }

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
      const parsed = this.parseJSON(jsonStr);

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
