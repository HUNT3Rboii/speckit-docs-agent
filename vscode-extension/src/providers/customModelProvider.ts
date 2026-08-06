/**
 * Custom Model AI Provider
 *
 * Talks directly to a user-configured HTTP endpoint speaking the OpenAI
 * chat-completions API shape (POST {baseUrl}/chat/completions) - this
 * covers Ollama (via its built-in OpenAI-compatible endpoint, typically
 * http://localhost:11434/v1), OpenAI itself, and most third-party/
 * self-hosted model gateways, without needing a provider class per
 * backend. Unlike the other providers (Copilot/Claude/Kiro/Generic), this
 * one does NOT go through vscode.lm - it's a raw fetch() call, so it has
 * no vscode import and is fully unit-testable.
 */

import { CancellationSignal, CustomModelConfig, StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider, CancellationRequestedError } from '../services/aiProvider';

export class CustomModelProvider extends BaseAIProvider {
  constructor(private settings: CustomModelConfig) {
    super();
  }

  public async isAvailable(): Promise<boolean> {
    return this.getUnavailableReason() === null;
  }

  /**
   * Which specific setting is missing, or null if fully configured - not
   * part of the shared AIProvider interface (every other provider's
   * unavailability comes from an actual runtime probe with nothing this
   * specific to say), but this one's availability is purely a settings
   * check, so it can explain itself precisely. AIProviderFactory
   * duck-types for this method to enrich its detection trace - without it,
   * "not available" was the only information given for a misconfigured
   * custom model, indistinguishable from "enabled is false" vs "baseUrl is
   * empty" vs "modelName is empty".
   */
  public getUnavailableReason(): string | null {
    if (!this.settings.enabled) {
      return 'speckit.customModel.enabled is false';
    }
    if (!this.settings.baseUrl?.trim()) {
      return 'speckit.customModel.baseUrl is empty';
    }
    if (!this.settings.modelName?.trim()) {
      return 'speckit.customModel.modelName is empty';
    }
    return null;
  }

  public getProviderName(): string {
    return this.settings.name?.trim() || `Custom Model — ${this.settings.modelName}`;
  }

  public async transform(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError,
    cancellation?: CancellationSignal
  ): Promise<StructuredJSON> {
    this.throwIfCancelled(cancellation);

    const sanitized = this.sanitizeMarkdown(markdown);
    this.setTimeout(this.computeTimeout(sanitized));
    const prompt = this.buildTransformPrompt(sanitized, structuredError, sourcePath);

    // Owned by this call so the underlying HTTP request can actually be
    // aborted - either because the timeout race below won, or because the
    // caller's own cancellation signal (speckit.stopProcessing) fired.
    const controller = new AbortController();
    const cancelListener = cancellation?.onCancellationRequested(() => controller.abort());

    try {
      const url = `${this.settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.settings.apiKey) {
        headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
      }

      this.log(`Sending request to ${url} (model: ${this.settings.modelName})...`);

      const fetchPromise = fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.settings.modelName,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        }),
        signal: controller.signal
      });

      const timeoutPromise = this.createTimeoutPromise<Response>(
        this.timeout,
        `${this.getProviderName()} request timed out`
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`);
      }

      const body: any = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Response did not include the expected choices[0].message.content field');
      }

      this.log('Received response');

      const jsonStr = this.extractJSON(content);
      const parsed = this.parseJSON(jsonStr);

      parsed.source_path = sourcePath;
      parsed.ai_enhanced = true;
      parsed.agent_source = this.getProviderName();

      return parsed;
    } catch (error: any) {
      if (cancellation?.isCancellationRequested) {
        throw new CancellationRequestedError();
      }
      this.logError('Transformation failed:', error);
      throw new Error(`${this.getProviderName()} transformation failed: ${error.message}`);
    } finally {
      controller.abort();
      cancelListener?.dispose();
    }
  }
}
