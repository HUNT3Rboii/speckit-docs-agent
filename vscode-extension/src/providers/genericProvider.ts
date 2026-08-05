/**
 * Generic AI Provider
 * Uses VS Code Language Model API with any available model
 */

import * as vscode from 'vscode';
import { CancellationSignal, StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider, CancellationRequestedError } from '../services/aiProvider';

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
   * Get provider name, preferring the model's human-readable name over its
   * opaque id once a model has been selected.
   */
  public getProviderName(): string {
    return this.model ? `Generic — ${this.model.name}` : 'Generic AI';
  }

  /**
   * Transform markdown to structured JSON using generic AI
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError,
    cancellation?: CancellationSignal
  ): Promise<StructuredJSON> {
    this.throwIfCancelled(cancellation);

    if (!this.model) {
      throw new Error('No AI model available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    this.setTimeout(this.computeTimeout(sanitized));
    const prompt = this.buildTransformPrompt(sanitized, structuredError, sourcePath);

    // Owned by this call (not a throwaway token) so it can actually be
    // cancelled - either in `finally` if the timeout race above wins, or
    // via the caller's own cancellation signal (speckit.stopProcessing) -
    // otherwise the streaming request keeps running in the background
    // even after this function has returned/thrown.
    const cancellationSource = new vscode.CancellationTokenSource();
    const externalCancelListener = cancellation?.onCancellationRequested(() =>
      cancellationSource.cancel()
    );

    try {
      this.log('Sending request to AI model...');

      const messages = [
        vscode.LanguageModelChatMessage.User(prompt)
      ];

      const responsePromise = this.model.sendRequest(messages, {}, cancellationSource.token);
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
      const parsed = this.parseJSON(jsonStr);

      // Add metadata
      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = this.getProviderName();

      return parsed;
    } catch (error: any) {
      if (cancellation?.isCancellationRequested) {
        throw new CancellationRequestedError();
      }
      this.logError('AI model transformation failed:', error);
      throw new Error(`AI model transformation failed: ${error.message}`);
    } finally {
      cancellationSource.cancel();
      cancellationSource.dispose();
      externalCancelListener?.dispose();
    }
  }
}
