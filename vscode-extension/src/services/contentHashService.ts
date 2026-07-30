/**
 * Content Hash Service
 * Computes SHA-256 hashes for markdown content to enable deduplication
 * 
 * Validates: Requirements 1.1
 */

import * as crypto from 'crypto';
import { ContentHashService as IContentHashService } from '../types';

/**
 * Service for computing and comparing content hashes
 * Uses Node.js crypto module for SHA-256 digest computation
 */
export class ContentHashService implements IContentHashService {
  /**
   * Compute SHA-256 hash from content string
   * 
   * @param content - The markdown content to hash
   * @returns Hexadecimal string representation of SHA-256 hash
   * 
   * @example
   * ```typescript
   * const service = new ContentHashService();
   * const hash = service.computeHash("# My Document");
   * // Returns: "a3c65c2f..." (64-character hex string)
   * ```
   */
  public computeHash(content: string): string {
    // Create SHA-256 hash
    const hash = crypto.createHash('sha256');
    
    // Update with content (UTF-8 encoding)
    hash.update(content, 'utf8');
    
    // Return hexadecimal digest
    return hash.digest('hex');
  }

  /**
   * Compare two hashes for equality
   * 
   * Uses constant-time comparison to prevent timing attacks,
   * though for content hashes this is less critical than for
   * cryptographic operations like password comparison.
   * 
   * @param hash1 - First hash to compare
   * @param hash2 - Second hash to compare
   * @returns True if hashes are equal, false otherwise
   * 
   * @example
   * ```typescript
   * const service = new ContentHashService();
   * const hash1 = service.computeHash("content");
   * const hash2 = service.computeHash("content");
   * service.compareHashes(hash1, hash2); // Returns: true
   * ```
   */
  public compareHashes(hash1: string, hash2: string): boolean {
    // Handle empty or invalid inputs
    if (!hash1 || !hash2) {
      return false;
    }

    // Ensure both hashes are the same length (SHA-256 = 64 hex chars)
    if (hash1.length !== hash2.length) {
      return false;
    }

    // Use constant-time comparison via crypto.timingSafeEqual
    // Convert hex strings to buffers for comparison
    try {
      const buffer1 = Buffer.from(hash1, 'hex');
      const buffer2 = Buffer.from(hash2, 'hex');
      
      // timingSafeEqual requires buffers of equal length
      if (buffer1.length !== buffer2.length) {
        return false;
      }

      return crypto.timingSafeEqual(buffer1, buffer2);
    } catch (error) {
      // If hex parsing fails, fall back to direct comparison
      console.warn('[ContentHashService] Buffer conversion failed, using direct comparison:', error);
      return hash1 === hash2;
    }
  }
}
