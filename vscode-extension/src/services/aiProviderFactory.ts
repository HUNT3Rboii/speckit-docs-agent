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

    // Try with detected provider first
    if (this.detectedProvider) {
      try {
        const result = await this.detectedProvider.transform(markdown, sourcePath, structuredError);
        return {
          result,
          provider: this.detectedProvider.getProviderName()
        };
      } catch (error) {
        console.error(`[AIProviderFactory] Primary provider failed, trying fallbacks:`, error);
      }
    }

    // Try all providers as fallback (fresh transform, no correction context)
    for (const provider of this.providers) {
      try {
        if (await provider.isAvailable()) {
          const result = await provider.transform(markdown, sourcePath);
          console.log(`[AIProviderFactory] Fallback successful with: ${provider.getProviderName()}`);
          return {
            result,
            provider: provider.getProviderName()
          };
        }
      } catch (error) {
        console.error(`[AIProviderFactory] Fallback provider ${provider.getProviderName()} failed:`, error);
      }
    }

    throw new Error('All AI providers failed to transform document');
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
