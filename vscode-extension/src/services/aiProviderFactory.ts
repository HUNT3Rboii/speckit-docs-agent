/**
 * AI Provider Factory with Fallback Chain
 * Detects and initializes AI providers with automatic fallback
 */

import { AIProvider, CancellationSignal, CustomModelEntry, PriorityEntry, ProviderId, StructuredError } from '../types';
import { expandPriority } from './providerPriority';
import { CopilotProvider } from '../providers/copilotProvider';
import { ClaudeProvider } from '../providers/claudeProvider';
import { KiroProvider } from '../providers/kiroProvider';
import { GenericProvider } from '../providers/genericProvider';
import { CustomModelProvider } from '../providers/customModelProvider';
import { RuleBasedProvider } from '../providers/ruleBasedProvider';
import { CancellationRequestedError } from './aiProvider';

const DEFAULT_PROVIDER_PRIORITY: PriorityEntry[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];

/**
 * Factory for creating and managing AI providers with fallback chain
 */
export class AIProviderFactory {
  private providers: AIProvider[] = [];
  private detectedProvider: AIProvider | null = null;
  private isDetected: boolean = false;
  /** Human-readable trace of the last detectProviders() run: the
   * configured try-order plus each provider's availability result, in the
   * order checked (stops at the first available one, so later providers
   * won't appear). console.log alone (the previous only record of this)
   * never reaches the "Speckit: Show Extension Logs" output channel users
   * actually check - only notificationService.* calls do - so a
   * misconfigured or wrongly-ordered custom model had no way to be
   * diagnosed from a pasted log short of asking for a DevTools capture. */
  private lastDetectionTrace: string[] = [];

  /**
   * When false (the default), transformWithFallback() never actually
   * invokes RuleBasedProvider - it's still detected/tracked as a state
   * (see detectProviders()) so hasAIProvider()/activation messaging keep
   * working, but a real per-file transform either uses a real AI provider
   * or throws a clear, actionable error. When true, restores the old
   * "always eventually succeeds, possibly via rule-based" behavior.
   */
  constructor(
    private allowRuleBasedFallback: boolean = false,
    private providerPriority: PriorityEntry[] = DEFAULT_PROVIDER_PRIORITY,
    private customModels: CustomModelEntry[] = []
  ) {}

  /**
   * Update the fallback policy after a live configuration change - see
   * extension.ts's configManager.onConfigChange handler.
   */
  public setAllowRuleBasedFallback(value: boolean): void {
    this.allowRuleBasedFallback = value;
  }

  /**
   * Update the try-order (speckit.providerPriority) after a live
   * configuration change. Resets the detection cache so the new order
   * actually takes effect on the next call, rather than sticking with
   * whatever was cached under the old order.
   */
  public setProviderPriority(value: PriorityEntry[]): void {
    this.providerPriority = value;
    this.isDetected = false;
  }

  /**
   * Update the configured custom models (speckit.customModels) after a live
   * configuration change. Resets the detection cache for the same reason
   * as setProviderPriority - a newly-enabled/edited custom model should be
   * picked up on the next transform, not require a window reload.
   */
  public setCustomModels(value: CustomModelEntry[]): void {
    this.customModels = value;
    this.isDetected = false;
  }

  /**
   * Builds one provider instance for a non-"custom" id. "custom" isn't
   * handled here since it doesn't map to a single provider instance - see
   * buildProviderList(), which expands it to one CustomModelProvider per
   * enabled speckit.customModels entry.
   */
  private buildProvider(id: Exclude<ProviderId, 'custom'>): AIProvider {
    switch (id) {
      case 'copilot':
        return new CopilotProvider();
      case 'claude':
        return new ClaudeProvider();
      case 'kiro':
        return new KiroProvider();
      case 'generic':
        return new GenericProvider();
    }
  }

  /**
   * Builds the full provider list for the current speckit.providerPriority
   * order, with RuleBasedProvider always appended last - it's governed
   * separately by allowRuleBasedFallback, not by providerPriority, since
   * it isn't a real AI provider to prioritize among the others.
   *
   * Custom models are placed by expandPriority: each one can sit at its own
   * position via a "custom:<id>" token, while a bare "custom" token still
   * expands to whichever models aren't individually placed. A disabled
   * entry is still instantiated (same as every other provider - none of
   * them are pre-filtered on some external "enabled" flag before being
   * checked) so its isAvailable()/getUnavailableReason() still reports
   * "enabled is false" in the detection trace, rather than the entry
   * silently vanishing from it - that exact message is what previously
   * pinpointed a live misconfiguration.
   */
  private buildProviderList(): AIProvider[] {
    const list: AIProvider[] = expandPriority(this.providerPriority, this.customModels).map((resolved) =>
      resolved.kind === 'custom'
        ? new CustomModelProvider(resolved.entry)
        : this.buildProvider(resolved.id as Exclude<ProviderId, 'custom'>)
    );
    list.push(new RuleBasedProvider());
    return list;
  }

  /**
   * The try-order as names rather than raw tokens - "custom:custom-a1b2c3"
   * is meaningless in a pasted log, and the whole point of the trace is
   * that a user can read it. Resolved through the same expansion the real
   * run uses, so what it shows is what will actually be tried.
   */
  private describeConfiguredOrder(): string {
    const names = expandPriority(this.providerPriority, this.customModels).map((resolved) =>
      resolved.kind === 'custom'
        ? resolved.entry.name?.trim() || resolved.entry.modelName?.trim() || resolved.entry.id
        : resolved.id
    );
    return names.length > 0 ? names.join(', ') : '(empty)';
  }

  /**
   * Detect available AI providers in priority order (speckit.providerPriority,
   * default Copilot → Claude → Kiro → Generic → Custom → Rule-based)
   */
  public async detectProviders(): Promise<AIProvider> {
    // Only trust the cache for a *real* provider. Detection normally runs
    // once, at extension activation - but a real provider like Copilot
    // registers its language model asynchronously and can finish doing so
    // *after* this extension's own activate() already ran, so the very
    // first detectProviders() call can land on the rule-based fallback
    // simply because Copilot wasn't ready yet, not because it's actually
    // unavailable. Without this check, that one bad-timing snapshot would
    // get cached and used for every file for the rest of the VS Code
    // session, even once Copilot becomes ready moments later - silently
    // downgrading every document to the crude rule-based transform with no
    // indication anything went wrong.
    if (
      this.isDetected &&
      this.detectedProvider &&
      this.detectedProvider.getProviderName() !== 'Rule-Based (Fallback)'
    ) {
      console.log(`[AIProviderFactory] Using cached provider: ${this.detectedProvider.getProviderName()}`);
      return this.detectedProvider;
    }

    console.log(`[AIProviderFactory] Detecting available AI providers (priority: ${this.describeConfiguredOrder()})...`);

    // Initialize all providers in priority order
    this.providers = this.buildProviderList();
    this.lastDetectionTrace = [`Configured order: ${this.describeConfiguredOrder()}`];

    // Check each provider in priority order
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        this.lastDetectionTrace.push(
          `${provider.getProviderName()}: ${available ? 'available' : 'not available'}${
            available ? '' : this.describeUnavailable(provider)
          }`
        );
        if (available) {
          console.log(`[AIProviderFactory] Selected provider: ${provider.getProviderName()}`);
          this.detectedProvider = provider;
          this.isDetected = true;
          return provider;
        }
      } catch (error: any) {
        this.lastDetectionTrace.push(`${provider.getProviderName()}: error checking availability (${error.message})`);
        console.error(`[AIProviderFactory] Error checking provider ${provider.getProviderName()}:`, error);
      }
    }

    // Should never reach here since RuleBasedProvider is always available
    // but provide fallback just in case
    const fallback = new RuleBasedProvider();
    console.log(`[AIProviderFactory] Using fallback provider: ${fallback.getProviderName()}`);
    this.detectedProvider = fallback;
    this.isDetected = true;
    return fallback;
  }

  /**
   * Extra detail for why a provider reported unavailable, if it can say -
   * duck-typed rather than added to the shared AIProvider interface, since
   * only CustomModelProvider's availability is a plain settings check with
   * something specific to explain (Copilot/Claude/Kiro/Generic's come from
   * an actual runtime probe with no more detail to give).
   */
  private describeUnavailable(provider: AIProvider): string {
    const withReason = provider as Partial<{ getUnavailableReason(): string | null }>;
    if (typeof withReason.getUnavailableReason !== 'function') {
      return '';
    }
    const reason = withReason.getUnavailableReason();
    return reason ? ` (${reason})` : '';
  }

  /**
   * Human-readable trace of the last detectProviders() run - see
   * lastDetectionTrace's own docstring for why this exists.
   */
  public getLastDetectionTrace(): string[] {
    return this.lastDetectionTrace;
  }

  /**
   * Get all available providers (for testing/debugging)
   */
  public async getAllAvailableProviders(): Promise<AIProvider[]> {
    const available: AIProvider[] = [];
    const allProviders = this.buildProviderList();

    for (const provider of allProviders) {
      try {
        if (await provider.isAvailable()) {
          available.push(provider);
        }
      } catch (error) {
        console.error(`Error checking provider ${provider.getProviderName()}:`, error);
      }
    }

    return available;
  }

  /**
   * Try transformation with automatic fallback on failure.
   *
   * @param structuredError - If set (a retry after a /api/process
   *   retry_needed response), passed through to the provider so it can build
   *   a correction prompt instead of transforming from scratch. Only applies
   *   to the initial attempt with the already-detected provider: if that
   *   throws and we fall back to a different provider entirely, the
   *   correction context no longer applies (a different model has no memory
   *   of the earlier attempt), so fallback providers get a fresh transform.
   */
  public async transformWithFallback(
    markdown: string,
    sourcePath: string,
    structuredError?: StructuredError,
    cancellation?: CancellationSignal
  ): Promise<{
    result: any;
    provider: string;
    /** Set only when a fallback provider had to be used - the primary
     * (highest-priority available) provider's own error message(s), so a
     * silent "it actually used Copilot, not your custom model" doesn't go
     * unnoticed just because the document still processed successfully in
     * the end. Previously only ever logged via console.error, invisible in
     * the output channel users actually check. */
    fallbackErrors?: string[];
  }> {
    if (cancellation?.isCancellationRequested) {
      throw new CancellationRequestedError();
    }
    // Always defer to detectProviders() rather than checking
    // this.detectedProvider directly - detectProviders() already knows how
    // to decide when its own cache is trustworthy (a real provider) versus
    // when it should re-check (the rule-based fallback). Checking
    // `!this.detectedProvider` here instead would short-circuit that logic
    // entirely: detectedProvider is non-null as soon as *any* provider,
    // including the fallback, has ever been assigned, so this call would
    // never re-detect again for the rest of the session - exactly the bug
    // detectProviders()'s own fix was meant to close.
    await this.detectProviders();

    const isRuleBased = (provider: AIProvider) => provider.getProviderName() === 'Rule-Based (Fallback)';
    // Collected so the final error is diagnostic ("Copilot timed out") rather
    // than the generic "no AI provider is available" - which reads as
    // flatly wrong to a user whose provider WAS detected at activation and
    // just failed/timed out on this specific request.
    const attemptErrors: string[] = [];

    // Try with detected provider first - but never the rule-based fallback
    // directly here, even if it's what detectProviders() landed on (no real
    // provider found last detection): whether it's allowed to run at all is
    // decided once, uniformly, in the loop below alongside every other
    // provider, not short-circuited early for this one case.
    if (this.detectedProvider && !isRuleBased(this.detectedProvider)) {
      try {
        const result = await this.detectedProvider.transform(markdown, sourcePath, structuredError, cancellation);
        return {
          result,
          provider: this.detectedProvider.getProviderName()
        };
      } catch (error: any) {
        // A cancellation means the user asked to stop - falling back to
        // try yet another provider would defeat the entire point of
        // stopping now, so propagate it immediately instead of treating
        // it as "this provider failed, try the next one".
        if (error instanceof CancellationRequestedError) {
          throw error;
        }
        console.error(`[AIProviderFactory] Primary provider failed, trying fallbacks:`, error);
        attemptErrors.push(`${this.detectedProvider.getProviderName()}: ${error.message}`);
      }
    }

    // Providers whose isAvailable() returned false - previously silent, so
    // "why didn't it fall back to Claude?" had no answer short of adding
    // console.log breakpoints. Tracked separately from attemptErrors (which
    // is specifically providers that WERE tried and failed) and surfaced in
    // the final error below, so the answer ("Claude: not detected") is
    // right there in the same message the user already sees, not buried in
    // a DevTools console they'd have to know to open.
    const skippedProviders: string[] = [];

    // Try all providers as fallback (fresh transform, no correction context).
    // Skips this.detectedProvider itself - it's the exact same instance
    // already attempted above, so retrying it here would just wait out a
    // second identical timeout for a provider that's already known to have
    // failed, roughly doubling the wait before the user sees any error.
    for (const provider of this.providers) {
      if (provider === this.detectedProvider) {
        continue;
      }
      if (isRuleBased(provider) && !this.allowRuleBasedFallback) {
        continue; // Never silently degrade unless explicitly opted in.
      }

      let available: boolean;
      try {
        available = await provider.isAvailable();
      } catch (error: any) {
        console.error(`[AIProviderFactory] Error checking availability of ${provider.getProviderName()}:`, error);
        skippedProviders.push(`${provider.getProviderName()} (error checking availability: ${error.message})`);
        continue;
      }

      if (!available) {
        skippedProviders.push(provider.getProviderName());
        continue;
      }

      try {
        const result = await provider.transform(markdown, sourcePath, undefined, cancellation);
        console.log(`[AIProviderFactory] Fallback successful with: ${provider.getProviderName()}`);
        return {
          result,
          provider: provider.getProviderName(),
          fallbackErrors: attemptErrors.length > 0 ? [...attemptErrors] : undefined
        };
      } catch (error: any) {
        if (error instanceof CancellationRequestedError) {
          throw error;
        }
        console.error(`[AIProviderFactory] Fallback provider ${provider.getProviderName()} failed:`, error);
        attemptErrors.push(`${provider.getProviderName()}: ${error.message}`);
      }
    }

    const detail = attemptErrors.length > 0 ? ` Attempt(s): ${attemptErrors.join('; ')}.` : '';
    const skippedDetail = skippedProviders.length > 0 ? ` Not available: ${skippedProviders.join(', ')}.` : '';
    throw new Error(
      this.allowRuleBasedFallback
        ? `All AI providers failed to transform document.${detail}${skippedDetail}`
        : `AI transformation failed and the rule-based fallback is disabled (speckit.allowRuleBasedFallback ` +
          `is off).${detail}${skippedDetail} Turn that setting on to process with reduced quality instead of ` +
          `failing, or investigate the attempt(s) above (e.g. a timeout means the provider was detected fine ` +
          `but didn't respond in time; "not available" means that provider was never even reachable in this ` +
          `VS Code session - run "Speckit: Show Extension Logs" for the specific model-detection diagnostics).`
    );
  }

  /**
   * Reset detection cache (useful for testing or after config changes)
   */
  public resetDetection(): void {
    this.isDetected = false;
    this.detectedProvider = null;
    this.providers = [];
    console.log('[AIProviderFactory] Detection cache reset');
  }

  /**
   * Check if any AI provider (non-rule-based) is available
   */
  public async hasAIProvider(): Promise<boolean> {
    const provider = await this.detectProviders();
    return provider.getProviderName() !== 'Rule-Based (Fallback)';
  }
}
