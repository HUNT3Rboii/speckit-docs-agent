/**
 * AI Provider Factory with Fallback Chain
 * Detects and initializes AI providers with automatic fallback
 */

import { AIProvider, StructuredError } from '../types';
import { CopilotProvider } from '../providers/copilotProvider';
import { ClaudeProvider } from '../providers/claudeProvider';
import { KiroProvider } from '../providers/kiroProvider';
import { GenericProvider } from '../providers/genericProvider';
import { RuleBasedProvider } from '../providers/ruleBasedProvider';

/**
 * Factory for creating and managing AI providers with fallback chain
 */
export class AIProviderFactory {
  private providers: AIProvider[] = [];
  private detectedProvider: AIProvider | null = null;
  private isDetected: boolean = false;

  /**
   * When false (the default), transformWithFallback() never actually
   * invokes RuleBasedProvider - it's still detected/tracked as a state
   * (see detectProviders()) so hasAIProvider()/activation messaging keep
   * working, but a real per-file transform either uses a real AI provider
   * or throws a clear, actionable error. When true, restores the old
   * "always eventually succeeds, possibly via rule-based" behavior.
   */
  constructor(private allowRuleBasedFallback: boolean = false) {}

  /**
   * Update the fallback policy after a live configuration change - see
   * extension.ts's configManager.onConfigChange handler.
   */
  public setAllowRuleBasedFallback(value: boolean): void {
    this.allowRuleBasedFallback = value;
  }

  /**
   * Detect available AI providers in priority order
   * Priority: Copilot → Claude → Kiro → Generic → Rule-based
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

    console.log('[AIProviderFactory] Detecting available AI providers...');

    // Initialize all providers in priority order
    this.providers = [
      new CopilotProvider(),
      new ClaudeProvider(),
      new KiroProvider(),
      new GenericProvider(),
      new RuleBasedProvider()
    ];

    // Check each provider in priority order
    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (available) {
          console.log(`[AIProviderFactory] Selected provider: ${provider.getProviderName()}`);
          this.detectedProvider = provider;
          this.isDetected = true;
          return provider;
        }
      } catch (error) {
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
   * Get all available providers (for testing/debugging)
   */
  public async getAllAvailableProviders(): Promise<AIProvider[]> {
    const available: AIProvider[] = [];

    const allProviders = [
      new CopilotProvider(),
      new ClaudeProvider(),
      new KiroProvider(),
      new GenericProvider(),
      new RuleBasedProvider()
    ];

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
    structuredError?: StructuredError
  ): Promise<{
    result: any;
    provider: string;
  }> {
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
        const result = await this.detectedProvider.transform(markdown, sourcePath, structuredError);
        return {
          result,
          provider: this.detectedProvider.getProviderName()
        };
      } catch (error: any) {
        console.error(`[AIProviderFactory] Primary provider failed, trying fallbacks:`, error);
        attemptErrors.push(`${this.detectedProvider.getProviderName()}: ${error.message}`);
      }
    }

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
      try {
        if (await provider.isAvailable()) {
          const result = await provider.transform(markdown, sourcePath);
          console.log(`[AIProviderFactory] Fallback successful with: ${provider.getProviderName()}`);
          return {
            result,
            provider: provider.getProviderName()
          };
        }
      } catch (error: any) {
        console.error(`[AIProviderFactory] Fallback provider ${provider.getProviderName()} failed:`, error);
        attemptErrors.push(`${provider.getProviderName()}: ${error.message}`);
      }
    }

    const detail = attemptErrors.length > 0 ? ` Attempt(s): ${attemptErrors.join('; ')}.` : '';
    throw new Error(
      this.allowRuleBasedFallback
        ? `All AI providers failed to transform document.${detail}`
        : `AI transformation failed and the rule-based fallback is disabled (speckit.allowRuleBasedFallback ` +
          `is off).${detail} Turn that setting on to process with reduced quality instead of failing, or ` +
          `investigate the attempt(s) above (e.g. a timeout means the provider was detected fine but didn't ` +
          `respond in time).`
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
