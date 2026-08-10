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

import { CancellationSignal, CustomModelEntry, StructuredError, StructuredJSON } from '../types';
import { BaseAIProvider, CancellationRequestedError } from '../services/aiProvider';

/** Server responses to an unsupported response_format, across the various
 * OpenAI-compatible implementations - all report it as a client error naming
 * the parameter rather than silently ignoring it. */
const JSON_MODE_REJECTION_PATTERN =
  /response_format|json_object|unknown (?:field|parameter|argument)|unsupported (?:parameter|value)|unrecognized request argument/i;

export class CustomModelProvider extends BaseAIProvider {
  /** Cleared for the session the first time an endpoint refuses JSON mode,
   * so every later request skips straight to the plain body instead of
   * paying for a rejected round trip each time. */
  private supportsJsonMode = true;

  constructor(private settings: CustomModelEntry) {
    super();
  }

  /**
   * Whether a failed response is the endpoint objecting to response_format
   * specifically, rather than a genuine error (bad key, missing model, rate
   * limit) that retrying without JSON mode would only repeat. Reads the body,
   * so the caller must not have consumed it yet.
   */
  private async rejectedJsonMode(response: Response): Promise<boolean> {
    if (response.status !== 400 && response.status !== 422) {
      return false;
    }
    const bodyText = await response.clone().text().catch(() => '');
    return JSON_MODE_REJECTION_PATTERN.test(bodyText);
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

  /**
   * The base class's 45s floor is tuned for in-editor providers
   * (Copilot/Claude/Kiro), which don't pay for a network round trip to a
   * separate service. A remote HTTP endpoint - especially a cloud-hosted
   * "serverless" one like Ollama Cloud - commonly has cold-start latency
   * (spinning up a GPU worker) on top of actual generation time, which is
   * NOT proportional to document size at all: a live timeout against
   * Ollama Cloud on a tiny test file confirmed this (the base class's
   * per-character scaling would have given it barely more than the 45s
   * floor). Doubling the floor to 90s gives real cold-start headroom while
   * staying under the shared 180s cap for large documents.
   */
  protected computeTimeout(markdown: string): number {
    return Math.min(180000, Math.max(90000, markdown.length * 3));
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

      const send = (jsonMode: boolean) => {
        const body: Record<string, unknown> = {
          model: this.settings.modelName,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        };
        if (jsonMode) {
          // Constrained decoding: the sampler cannot emit a token that would
          // break JSON, so the failure this exists to prevent - an unescaped
          // quote inside a string value, from source text that itself
          // contains JSON - becomes impossible rather than merely unlikely.
          // Without it the response is only as well-formed as the model's
          // own care, and one stray quote costs the whole provider.
          body.response_format = { type: 'json_object' };
        }
        return fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
      };

      const timeoutPromise = this.createTimeoutPromise<Response>(
        this.timeout,
        `${this.getProviderName()} request timed out`
      );

      let response = await Promise.race([send(this.supportsJsonMode), timeoutPromise]);

      // Not every OpenAI-compatible server accepts response_format; the ones
      // that don't reject the whole request rather than ignoring the field.
      // Retry once without it and stop asking for the rest of the session,
      // so an older endpoint degrades to prompt-only JSON instead of failing.
      if (!response.ok && this.supportsJsonMode && (await this.rejectedJsonMode(response))) {
        this.supportsJsonMode = false;
        this.log('Endpoint rejected response_format; retrying without JSON mode');
        response = await Promise.race([send(false), timeoutPromise]);
      }

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
