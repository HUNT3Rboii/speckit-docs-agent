/**
 * AI Provider Factory with Fallback Chain
 * Detects and initializes AI providers with automatic fallback
 */

import { AIProvider } from '../types';
import { CopilotProvider } from '../providers/copilotProvider';
import { ClaudeProvider } from '../providers/claudeProvider';
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
   * Priority: Copilot → Claude → Generic → Rule-based
   */
  public async detectProviders(): Promise<AIProvider> {
    if (this.isDetected && this.detectedProvider) {
      console.log(`[AIProviderFactory] Using cached provider: ${this.detectedProvider.getProviderName()}`);
      return this.detectedProvider;
    }

    console.log('[AIProviderFactory] Detecting available AI providers...');

    // Initialize all providers
    this.providers = [
      new CopilotProvider(),
      new ClaudeProvider(),
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
   * Try transformation with automatic fallback on failure
   */
  public async transformWithFallback(markdown: string, sourcePath: string): Promise<{
    result: any;
    provider: string;
  }> {
    // Ensure providers are detected
    if (!this.detectedProvider) {
      await this.detectProviders();
    }

    // Try with detected provider first
    if (this.detectedProvider) {
      try {
        const result = await this.detectedProvider.transform(markdown, sourcePath);
        return {
          result,
          provider: this.detectedProvider.getProviderName()
        };
      } catch (error) {
        console.error(`[AIProviderFactory] Primary provider failed, trying fallbacks:`, error);
      }
    }

    // Try all providers as fallback
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
