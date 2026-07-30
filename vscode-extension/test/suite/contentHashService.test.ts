/**
 * Unit tests for ContentHashService
 * 
 * Tests SHA-256 hash computation and comparison functionality
 * Validates Requirements 1.1, 1.5
 */

import * as assert from 'assert';
import { ContentHashService } from '../../src/services/contentHashService';

suite('ContentHashService', () => {
  let service: ContentHashService;

  setup(() => {
    service = new ContentHashService();
  });

  suite('computeHash', () => {
    test('should compute SHA-256 hash for simple string', () => {
      const content = 'Hello, World!';
      const hash = service.computeHash(content);

      // SHA-256 produces 64-character hexadecimal string
      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    test('should compute consistent hash for same content', () => {
      const content = '# My Document\n\nThis is content.';
      const hash1 = service.computeHash(content);
      const hash2 = service.computeHash(content);

      assert.strictEqual(hash1, hash2);
    });

    test('should compute different hashes for different content', () => {
      const content1 = '# Document A';
      const content2 = '# Document B';
      
      const hash1 = service.computeHash(content1);
      const hash2 = service.computeHash(content2);

      assert.notStrictEqual(hash1, hash2);
    });

    test('should compute different hash when single character changes', () => {
      const content1 = '# My Document';
      const content2 = '# My Documnet'; // Typo: 'e' and 'n' swapped
      
      const hash1 = service.computeHash(content1);
      const hash2 = service.computeHash(content2);

      assert.notStrictEqual(hash1, hash2);
    });

    test('should handle empty string', () => {
      const hash = service.computeHash('');

      // Empty string should still produce valid SHA-256 hash
      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    test('should handle Unicode characters', () => {
      const content = '# 文档标题\n\n这是中文内容。\n\n🎉 Emoji support';
      const hash = service.computeHash(content);

      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    test('should handle very long content', () => {
      // Generate large markdown document (>10KB)
      const sections = Array.from({ length: 100 }, (_, i) => 
        `## Section ${i}\n\nThis is the content for section ${i}.\n\n`
      ).join('');
      const content = `# Large Document\n\n${sections}`;

      const hash = service.computeHash(content);

      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    test('should be sensitive to whitespace changes', () => {
      const content1 = 'Line 1\nLine 2';
      const content2 = 'Line 1\n\nLine 2'; // Extra newline

      const hash1 = service.computeHash(content1);
      const hash2 = service.computeHash(content2);

      assert.notStrictEqual(hash1, hash2);
    });

    test('should produce known hash for known input', () => {
      // Test vector for "Hello, World!"
      const content = 'Hello, World!';
      const hash = service.computeHash(content);
      
      // SHA-256 of "Hello, World!" (verified with external tool)
      const expectedHash = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';
      
      assert.strictEqual(hash, expectedHash);
    });
  });

  suite('compareHashes', () => {
    test('should return true for identical hashes', () => {
      const content = '# Test Document';
      const hash1 = service.computeHash(content);
      const hash2 = service.computeHash(content);

      assert.strictEqual(service.compareHashes(hash1, hash2), true);
    });

    test('should return false for different hashes', () => {
      const hash1 = service.computeHash('Content A');
      const hash2 = service.computeHash('Content B');

      assert.strictEqual(service.compareHashes(hash1, hash2), false);
    });

    test('should return true for manually provided identical hashes', () => {
      const hash = 'a'.repeat(64);
      
      assert.strictEqual(service.compareHashes(hash, hash), true);
    });

    test('should return false for hashes differing by one character', () => {
      const hash1 = 'a'.repeat(64);
      const hash2 = 'a'.repeat(63) + 'b';

      assert.strictEqual(service.compareHashes(hash1, hash2), false);
    });

    test('should handle empty string inputs', () => {
      assert.strictEqual(service.compareHashes('', ''), false);
      assert.strictEqual(service.compareHashes('abc123', ''), false);
      assert.strictEqual(service.compareHashes('', 'abc123'), false);
    });

    test('should handle different length hashes', () => {
      const shortHash = 'abc123';
      const longHash = 'a'.repeat(64);

      assert.strictEqual(service.compareHashes(shortHash, longHash), false);
    });

    test('should handle case-insensitive hex comparison', () => {
      // SHA-256 hashes are always lowercase from computeHash, but Buffer.from handles case-insensitively
      const hash1 = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      const hash2 = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

      // Both represent the same byte sequence, so comparison is based on bytes, not string case
      assert.strictEqual(service.compareHashes(hash1, hash2), true);
    });

    test('should handle invalid hex characters gracefully', () => {
      const validHash = 'a'.repeat(64);
      const invalidHash = 'x'.repeat(64); // 'x' is not valid hex

      // Should not throw, should return false
      assert.strictEqual(service.compareHashes(validHash, invalidHash), false);
    });
  });

  suite('Integration - Hash Stability', () => {
    test('computing same content multiple times produces identical hashes', () => {
      const content = '# Requirements\n\n## Section 1\n\nContent here.\n\n## Section 2\n\nMore content.';
      
      const hashes = Array.from({ length: 10 }, () => service.computeHash(content));
      
      // All hashes should be identical
      const firstHash = hashes[0];
      hashes.forEach(hash => {
        assert.strictEqual(hash, firstHash);
      });
    });

    test('single character change triggers different hash', () => {
      const baseContent = '# My Document\n\nThis is a test document with some content.';
      
      // Create variations with single character changes
      const variations = [
        baseContent.replace('test', 'best'),     // Change 't' to 'b'
        baseContent.replace('test', 'text'),     // Change 's' to 'x'
        baseContent + ' ',                       // Add trailing space
        baseContent.replace('\n\n', '\n'),       // Remove blank line
      ];

      const baseHash = service.computeHash(baseContent);
      
      variations.forEach((variation, index) => {
        const variantHash = service.computeHash(variation);
        assert.notStrictEqual(
          variantHash, 
          baseHash, 
          `Variation ${index} should produce different hash`
        );
      });
    });

    test('hash comparison is symmetric', () => {
      const hash1 = service.computeHash('Content A');
      const hash2 = service.computeHash('Content B');

      // compareHashes(a, b) === compareHashes(b, a)
      assert.strictEqual(
        service.compareHashes(hash1, hash2),
        service.compareHashes(hash2, hash1)
      );
    });

    test('hash comparison is reflexive', () => {
      const hash = service.computeHash('Some content');

      // compareHashes(a, a) === true
      assert.strictEqual(service.compareHashes(hash, hash), true);
    });
  });

  suite('Edge Cases', () => {
    test('should handle content with special markdown characters', () => {
      const content = '# Title\n\n**Bold** *italic* `code` [link](url) ![image](img.png)';
      const hash = service.computeHash(content);

      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]{64}$/);
    });

    test('should handle content with escaped characters', () => {
      const content = 'Text with \\n escaped newline and \\t tab';
      const hash = service.computeHash(content);

      assert.strictEqual(hash.length, 64);
    });

    test('should handle null-like inputs gracefully in compareHashes', () => {
      const hash = service.computeHash('test');

      // These should not throw, just return false
      assert.strictEqual(service.compareHashes(hash, null as any), false);
      assert.strictEqual(service.compareHashes(null as any, hash), false);
      assert.strictEqual(service.compareHashes(undefined as any, undefined as any), false);
    });
  });
});
