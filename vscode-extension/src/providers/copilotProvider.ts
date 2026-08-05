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
  /** Every Copilot-vendor model this extension can see, not just the one
   * selected - transform() falls through to the next one on a rate limit
   * rather than giving up on Copilot entirely when only one of possibly
   * several available models is exhausted. */
  private availableModels: vscode.LanguageModelChat[] = [];

  /**
   * Check if GitHub Copilot is available.
   *
   * Being signed into Copilot Chat is NOT sufficient on its own:
   * vscode.lm.selectChatModels() also requires the user to have granted
   * *this extension* permission to use language models (a separate,
   * per-extension consent prompt) - if that was never approved/was
   * dismissed, this returns an empty array with no error at all, which
   * previously looked identical to "Copilot isn't installed". If the
   * vendor-scoped lookup comes back empty, fall back to enumerating every
   * model this extension CAN see (mirrors KiroProvider's same pattern) and
   * log the result either way, so the actual failure mode (zero models
   * exposed at all vs. Copilot registered under an unexpected vendor id)
   * is visible in the output channel instead of just "not available".
   */
  public async isAvailable(): Promise<boolean> {
    try {
      let models = await vscode.lm.selectChatModels({
        vendor: 'copilot'
      });

      if (models.length === 0) {
        const allModels = await vscode.lm.selectChatModels();
        this.log(
          `No models found for vendor 'copilot'. All models visible to this extension: ${
            allModels.length > 0
              ? allModels.map(m => `${m.vendor}/${m.family}/${m.id}`).join(', ')
              : '(none - check that this extension has been granted language model access)'
          }`
        );
        models = allModels.filter(model =>
          model.vendor?.toLowerCase().includes('copilot') ||
          model.id.toLowerCase().includes('copilot') ||
          model.name?.toLowerCase().includes('copilot')
        );
      }

      if (models.length > 0) {
        this.availableModels = models;
        // Always logged, not just when the vendor-scoped lookup came back
        // empty above - previously this silently grabbed models[0] with no
        // visibility into whether other Copilot models existed that could
        // have been used instead (e.g. as a fallback when the first one is
        // rate-limited).
        this.log(`Copilot models available: ${models.map(m => `${m.family}/${m.id}`).join(', ')}`);
        this.model = this.selectPreferredModel(models);
        this.log('Using Copilot model:', this.model.id);
        return true;
      }

      return false;
    } catch (error) {
      this.logError('Error detecting Copilot:', error);
      return false;
    }
  }

  /**
   * Picks which of the available Copilot models to use first. Defaults to
   * the first one VS Code returns, but honors speckit.preferredModelId (a
   * substring matched case-insensitively against each model's id/family/
   * name) when set, so a user hitting a rate limit on the default model
   * can point this at a different one they have access to instead of
   * waiting it out or falling back to a lower-quality transform.
   */
  private selectPreferredModel(models: vscode.LanguageModelChat[]): vscode.LanguageModelChat {
    const preferred = vscode.workspace
      .getConfiguration('speckit')
      .get<string>('preferredModelId', '')
      .trim()
      .toLowerCase();

    if (preferred) {
      const match = models.find(m =>
        m.id.toLowerCase().includes(preferred) ||
        m.family?.toLowerCase().includes(preferred) ||
        m.name?.toLowerCase().includes(preferred)
      );
      if (match) {
        return match;
      }
      this.log(`No Copilot model matched speckit.preferredModelId "${preferred}" - using the first available model instead.`);
    }

    return models[0];
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
   * Transform markdown to structured JSON using Copilot. Tries the
   * selected model first, then falls through to any other available
   * Copilot model on a rate-limit error specifically - other error types
   * (timeout, malformed response, document too large) are assumed to
   * affect every model equally and are thrown immediately rather than
   * wasting time retrying across models that would likely hit the same
   * problem.
   */
  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError
  ): Promise<StructuredJSON> {
    if (!this.model || this.availableModels.length === 0) {
      throw new Error('Copilot model not available. Call isAvailable() first.');
    }

    const sanitized = this.sanitizeMarkdown(markdown);
    this.setTimeout(this.computeTimeout(sanitized));
    const prompt = this.buildTransformPrompt(sanitized, structuredError, sourcePath);

    const orderedModels = [this.model, ...this.availableModels.filter(m => m !== this.model)];
    let lastError: any;

    for (let i = 0; i < orderedModels.length; i++) {
      const model = orderedModels[i];
      try {
        const parsed = await this.sendToModel(model, prompt, sourcePath);
        this.model = model; // Remember which one actually worked for getProviderName()/next call.
        return parsed;
      } catch (error: any) {
        lastError = error;
        const isRateLimit = error.message?.toLowerCase().includes('rate limit');
        const hasMoreModels = i < orderedModels.length - 1;
        if (!isRateLimit || !hasMoreModels) {
          throw error;
        }
        this.log(`${model.id} was rate-limited, trying next available Copilot model (${orderedModels[i + 1].id})...`);
      }
    }

    throw lastError;
  }

  /**
   * Sends the prompt to one specific model and returns the parsed result.
   * Split out from transform() so it can be tried against multiple models
   * in sequence without duplicating the send/timeout/parse logic.
   */
  private async sendToModel(
    model: vscode.LanguageModelChat,
    prompt: string,
    sourcePath: string
  ): Promise<StructuredJSON> {
    // Owned by this call (not a throwaway token) so it can be cancelled in
    // `finally` if we bail out via the timeout race below - otherwise the
    // streaming request keeps running in the background even after this
    // function has already thrown a timeout error.
    const cancellationSource = new vscode.CancellationTokenSource();

    try {
      this.log(`Sending request to Copilot (${model.id})...`);

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
        const response = await model.sendRequest(messages, {}, cancellationSource.token);
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
      const parsed = this.parseJSON(jsonStr);

      // Add metadata
      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = `GitHub Copilot Chat — ${model.name}`;

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
