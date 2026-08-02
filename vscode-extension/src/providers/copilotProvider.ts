/**
 * GitHub Copilot AI Provider
 * Uses VS Code Language Model API to access Copilot
 */

import * as vscode from 'vscode';
import { StructuredError, StructuredJSON } from '../types';
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
   * Get provider name. Includes the specific backing model's human-readable
   * name (e.g. "Claude Sonnet 5") once a model has been selected, since
   * Copilot Chat can be backed by several different model families.
   */
  public getProviderName(): string {
    return this.model ? `GitHub Copilot Chat — ${this.model.name}` : 'GitHub Copilot';
  }

  /**
   * Transform markdown to structured JSON using Copilot
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON> {
    if (!this.model) {
      throw new Error('Copilot model not available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    const prompt = this.buildTransformPrompt(sanitized, structuredError);

    // Owned by this call (not a throwaway token) so it can be cancelled in
    // `finally` if we bail out via the timeout race below - otherwise the
    // streaming request keeps running in the background even after this
    // function has already thrown a timeout error.
    const cancellationSource = new vscode.CancellationTokenSource();

    try {
      this.log('Sending request to Copilot...');

      // Create chat request
      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Bound the *entire* exchange - connecting AND streaming the
      // response - not just the initial sendRequest() call. A stalled
      // stream (a real, known LM API failure mode: the request resolves
      // fine but the `for await` over response.text never yields a final
      // chunk) previously hung here forever with no timeout, no thrown
      // error, and nothing ever surfacing to the user - indistinguishable
      // from the extension simply being frozen.
      const sendAndCollect = async (): Promise<string> => {
        const response = await this.model!.sendRequest(messages, {}, cancellationSource.token);
        let responseText = '';
        for await (const fragment of response.text) {
          responseText += fragment;
        }
        return responseText;
      };

      const timeoutPromise = this.createTimeoutPromise<string>(
        this.timeout,
        'Copilot request timed out'
      );

      const responseText = await Promise.race([sendAndCollect(), timeoutPromise]);

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
    } finally {
      cancellationSource.cancel();
      cancellationSource.dispose();
    }
  }
}
