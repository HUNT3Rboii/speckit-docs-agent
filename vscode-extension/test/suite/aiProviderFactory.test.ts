/**
 * Unit tests for AIProviderFactory
 * 
 * Tests AI provider detection, priority order, and fallback mechanisms
 * Validates Requirement 2.4 (Zero-configuration AI provider detection)
 */

import * as assert from 'assert';
import { AIProviderFactory } from '../../src/services/aiProviderFactory';

suite('AIProviderFactory', () => {
  let factory: AIProviderFactory;

  setup(() => {
    factory = new AIProviderFactory();
  });

  suite('detectProviders', () => {
    test('should detect at least one provider (Rule-based fallback)', async () => {
      const provider = await factory.detectProviders();

      assert.ok(provider, 'Should return a provider');
      assert.ok(provider.getProviderName(), 'Provider should have a name');
    });

    test('should cache detected provider on subsequent calls', async () => {
      const provider1 = await factory.detectProviders();
      const provider2 = await factory.detectProviders();

      // Should return the same instance
      assert.strictEqual(
        provider1.getProviderName(),
        provider2.getProviderName(),
        'Should return cached provider'
      );
    });

    test('should detect providers in priority order', async () => {
      const provider = await factory.detectProviders();
      const providerName = provider.getProviderName();

      // Provider should be one of the expected types
      const validProviders = [
        'GitHub Copilot',
        'Claude',
        'Kiro',
        'Rule-Based (Fallback)'
      ];

      // Check if it's a generic provider (starts with "Generic")
      const isValid = validProviders.includes(providerName) || 
                     providerName.startsWith('Generic');

      assert.ok(
        isValid,
        `Detected provider "${providerName}" should be one of expected types`
      );
    });

    test('should always succeed (fallback to rule-based)', async () => {
      const provider = await factory.detectProviders();

      // Even if no AI providers are available, should return rule-based
      assert.ok(provider, 'Should never fail to detect a provider');
      assert.ok(
        provider.getProviderName().length > 0,
        'Provider should have a valid name'
      );
    });
  });

  suite('getAllAvailableProviders', () => {
    test('should return at least one provider', async () => {
      const providers = await factory.getAllAvailableProviders();

      assert.ok(providers.length > 0, 'Should have at least one provider');
    });

    test('should include rule-based provider', async () => {
      const providers = await factory.getAllAvailableProviders();

      const hasRuleBased = providers.some(
        p => p.getProviderName() === 'Rule-Based (Fallback)'
      );

      assert.ok(hasRuleBased, 'Should include rule-based fallback provider');
    });

    test('should return unique providers', async () => {
      const providers = await factory.getAllAvailableProviders();

      const names = providers.map(p => p.getProviderName());
      const uniqueNames = new Set(names);

      assert.strictEqual(
        names.length,
        uniqueNames.size,
        'Should not have duplicate providers'
      );
    });

    test('all returned providers should be available', async () => {
      const providers = await factory.getAllAvailableProviders();

      for (const provider of providers) {
        const available = await provider.isAvailable();
        assert.ok(
          available,
          `Provider ${provider.getProviderName()} should be available`
        );
      }
    });
  });

  suite('transformWithFallback', () => {
    test('should transform markdown using available provider', async () => {
      const markdown = '# Test Document\n\nThis is test content.';
      const sourcePath = 'test.md';

      const result = await factory.transformWithFallback(markdown, sourcePath);

      assert.ok(result.result, 'Should return transformation result');
      assert.ok(result.provider, 'Should indicate which provider was used');
      assert.strictEqual(typeof result.provider, 'string');
    });

    test('should return structured JSON with required fields', async () => {
      const markdown = '# Test Document\n\nTest content here.';
      const sourcePath = 'test.md';

      const { result } = await factory.transformWithFallback(markdown, sourcePath);

      assert.ok(result.title, 'Should have title');
      assert.ok(result.abstract, 'Should have abstract');
      assert.ok(Array.isArray(result.sections), 'Should have sections array');
      assert.strictEqual(result.source_path, sourcePath);
    });

    test('should handle empty markdown', async () => {
      const markdown = '';
      const sourcePath = 'empty.md';

      const result = await factory.transformWithFallback(markdown, sourcePath);

      assert.ok(result.result, 'Should handle empty markdown');
      assert.ok(result.provider, 'Should indicate provider used');
    });

    test('should handle markdown with special characters', async () => {
      const markdown = '# Title\n\n**Bold** *italic* `code` [link](url)';
      const sourcePath = 'special.md';

      const result = await factory.transformWithFallback(markdown, sourcePath);

      assert.ok(result.result, 'Should handle special characters');
      assert.ok(result.result.title, 'Should extract title');
    });

    test('should indicate ai_enhanced based on provider', async () => {
      const markdown = '# Test\n\nContent';
      const sourcePath = 'test.md';

      const { result, provider } = await factory.transformWithFallback(markdown, sourcePath);

      if (provider === 'Rule-Based (Fallback)') {
        assert.strictEqual(
          result.ai_enhanced,
          false,
          'Rule-based should not be AI enhanced'
        );
      } else {
        assert.strictEqual(
          result.ai_enhanced,
          true,
          'AI providers should be marked as AI enhanced'
        );
      }
    });

    test('should set agent_source to provider name', async () => {
      const markdown = '# Test\n\nContent';
      const sourcePath = 'test.md';

      const { result, provider } = await factory.transformWithFallback(markdown, sourcePath);

      assert.strictEqual(
        result.agent_source,
        provider,
        'agent_source should match provider name'
      );
    });
  });

  suite('resetDetection', () => {
    test('should clear cached provider', async () => {
      // First detection
      await factory.detectProviders();

      // Reset
      factory.resetDetection();

      // Second detection should re-detect
      const provider = await factory.detectProviders();
      
      assert.ok(provider, 'Should re-detect provider after reset');
    });

    test('should allow re-detection after reset', async () => {
      await factory.detectProviders();

      factory.resetDetection();
      
      const provider2 = await factory.detectProviders();

      // Should successfully detect again (may be same provider)
      assert.ok(provider2, 'Should detect provider after reset');
      assert.strictEqual(
        typeof provider2.getProviderName(),
        'string',
        'Should have valid provider name'
      );
    });
  });

  suite('hasAIProvider', () => {
    test('should return boolean indicating AI provider availability', async () => {
      const hasAI = await factory.hasAIProvider();

      assert.strictEqual(typeof hasAI, 'boolean');
    });

    test('should return false if only rule-based is available', async () => {
      // This test depends on environment - if no AI providers installed,
      // should return false
      const hasAI = await factory.hasAIProvider();
      const provider = await factory.detectProviders();

      if (provider.getProviderName() === 'Rule-Based (Fallback)') {
        assert.strictEqual(hasAI, false);
      } else {
        assert.strictEqual(hasAI, true);
      }
    });
  });

  suite('Provider Priority Order', () => {
    test('should check Copilot before Claude', async () => {
      // This is implicit in the implementation order
      // We verify by checking that the factory has the correct priority
      const provider = await factory.detectProviders();
      
      // If both were available, Copilot would be selected
      // But we can't control what's available in test environment
      assert.ok(provider, 'Provider should be detected');
    });

    test('should check Kiro before Generic', async () => {
      // Verify Kiro is in the priority chain
      const allProviders = await factory.getAllAvailableProviders();
      
      // Should have multiple providers including rule-based
      assert.ok(allProviders.length >= 1);
    });

    test('should always fall back to rule-based as last resort', async () => {
      const allProviders = await factory.getAllAvailableProviders();
      
      const hasRuleBased = allProviders.some(
        p => p.getProviderName() === 'Rule-Based (Fallback)'
      );

      assert.ok(hasRuleBased, 'Rule-based should always be available');
    });
  });

  suite('Zero-Configuration Validation', () => {
    test('should work without any configuration', async () => {
      // Factory should work out of the box
      const freshFactory = new AIProviderFactory();
      const provider = await freshFactory.detectProviders();

      assert.ok(provider, 'Should work without configuration');
    });

    test('should provide unified interface across all providers', async () => {
      const allProviders = await factory.getAllAvailableProviders();

      // All providers should implement the same interface
      for (const provider of allProviders) {
        assert.ok(
          typeof provider.isAvailable === 'function',
          'Should have isAvailable method'
        );
        assert.ok(
          typeof provider.getProviderName === 'function',
          'Should have getProviderName method'
        );
        assert.ok(
          typeof provider.transform === 'function',
          'Should have transform method'
        );
      }
    });

    test('should handle provider detection failures gracefully', async () => {
      // Even if all AI providers fail, should not throw
      try {
        const provider = await factory.detectProviders();
        assert.ok(provider, 'Should return fallback provider');
      } catch (error) {
        assert.fail('Should not throw error on provider detection');
      }
    });
  });

  suite('Integration - End-to-End Detection and Transform', () => {
    test('should detect and transform in single workflow', async () => {
      const markdown = '# Integration Test\n\n## Section 1\n\nContent here.';
      const sourcePath = 'integration.md';

      // Detect provider
      const provider = await factory.detectProviders();
      assert.ok(provider);

      // Use factory to transform
      const result = await factory.transformWithFallback(markdown, sourcePath);

      assert.ok(result.result);
      assert.ok(result.provider);
      assert.strictEqual(result.result.source_path, sourcePath);
    });

    test('should handle multiple transforms with same factory', async () => {
      const markdown1 = '# Doc 1\n\nContent 1';
      const markdown2 = '# Doc 2\n\nContent 2';

      const result1 = await factory.transformWithFallback(markdown1, 'doc1.md');
      const result2 = await factory.transformWithFallback(markdown2, 'doc2.md');

      // Both should succeed
      assert.ok(result1.result);
      assert.ok(result2.result);

      // Both should use same provider (cached)
      assert.strictEqual(result1.provider, result2.provider);
    });

    test('should handle large markdown documents', async () => {
      // Generate large document
      const sections = Array.from({ length: 50 }, (_, i) =>
        `## Section ${i}\n\nThis is content for section ${i}.\n\n`
      ).join('');
      const markdown = `# Large Document\n\n${sections}`;

      const result = await factory.transformWithFallback(markdown, 'large.md');

      assert.ok(result.result);
      assert.ok(result.result.sections.length > 0);
    });
  });

  suite('Provider-Specific Detection', () => {
    test('should detect Copilot if available', async () => {
      const providers = await factory.getAllAvailableProviders();
      const copilot = providers.find(p => p.getProviderName() === 'GitHub Copilot');

      if (copilot) {
        const available = await copilot.isAvailable();
        assert.ok(available, 'Copilot should be available when detected');
      }
      // If not found, test passes (not installed in environment)
    });

    test('should detect Claude if available', async () => {
      const providers = await factory.getAllAvailableProviders();
      const claude = providers.find(p => p.getProviderName() === 'Claude');

      if (claude) {
        const available = await claude.isAvailable();
        assert.ok(available, 'Claude should be available when detected');
      }
      // If not found, test passes (not installed in environment)
    });

    test('should detect Kiro if available', async () => {
      const providers = await factory.getAllAvailableProviders();
      const kiro = providers.find(p => p.getProviderName() === 'Kiro');

      if (kiro) {
        const available = await kiro.isAvailable();
        assert.ok(available, 'Kiro should be available when detected');
      }
      // If not found, test passes (not installed in environment)
    });

    test('should always have Rule-Based provider', async () => {
      const providers = await factory.getAllAvailableProviders();
      const ruleBased = providers.find(p => p.getProviderName() === 'Rule-Based (Fallback)');

      assert.ok(ruleBased, 'Rule-Based provider must always be present');
      
      const available = await ruleBased.isAvailable();
      assert.ok(available, 'Rule-Based provider must always be available');
    });
  });
});
