/**
 * Unit tests for path truncation functions
 * Tests path truncation with short and long paths
 * **Validates: Requirements 4.4**
 */

import { describe, it, expect } from 'vitest';
import {
  truncatePath,
  truncatePathSegments,
  getFileName,
  getDirPath,
} from './pathTruncate';

describe('pathTruncate utilities', () => {
  describe('truncatePath', () => {
    describe('short paths (no truncation needed)', () => {
      it('should return short path unchanged', () => {
        const path = 'src/utils/test.ts';
        const result = truncatePath(path);

        expect(result).toBe(path);
      });

      it('should return path under maxLength unchanged', () => {
        const path = 'short/path.ts';
        const result = truncatePath(path, 50);

        expect(result).toBe(path);
      });

      it('should return empty string for empty input', () => {
        const result = truncatePath('');

        expect(result).toBe('');
      });

      it('should return single filename unchanged', () => {
        const path = 'file.ts';
        const result = truncatePath(path);

        expect(result).toBe(path);
      });
    });

    describe('long paths (truncation required)', () => {
      it('should truncate long path with ellipsis in middle', () => {
        const path = 'src/very/long/path/to/some/deeply/nested/directory/file.ts';
        const result = truncatePath(path, 50);

        expect(result.length).toBeLessThanOrEqual(50);
        expect(result).toContain('...');
        expect(result).toContain('file.ts');
      });

      it('should preserve filename at the end', () => {
        const path = 'src/components/ui/dialogs/modals/confirmations/DeleteConfirmation.tsx';
        const result = truncatePath(path, 50);

        expect(result).toContain('DeleteConfirmation.tsx');
        expect(result.length).toBeLessThanOrEqual(50);
      });

      it('should show beginning of path before ellipsis', () => {
        const path = 'projects/frontend/src/components/ui/buttons/PrimaryButton.tsx';
        const result = truncatePath(path, 50);

        expect(result).toMatch(/^projects/);
        expect(result).toContain('...');
        expect(result).toContain('PrimaryButton.tsx');
      });

      it('should use default maxLength of 50', () => {
        const longPath = 'a'.repeat(30) + '/' + 'b'.repeat(30) + '.ts';
        const result = truncatePath(longPath);

        expect(result.length).toBeLessThanOrEqual(50);
      });

      it('should respect custom maxLength', () => {
        const path = 'src/components/ui/forms/inputs/TextInput.tsx';
        const result = truncatePath(path, 30);

        expect(result.length).toBeLessThanOrEqual(30);
        expect(result).toContain('TextInput.tsx');
      });
    });

    describe('edge cases', () => {
      it('should handle path with very long filename', () => {
        const longFilename = 'VeryLongFileNameThatExceedsMaxLength.tsx';
        const path = `src/${longFilename}`;
        const result = truncatePath(path, 30);

        expect(result.length).toBeLessThanOrEqual(30);
        expect(result).toContain('...');
      });

      it('should handle path with no slashes', () => {
        const path = 'averyverylongfilenamewithnoslashesatall.tsx';
        const result = truncatePath(path, 20);

        expect(result.length).toBeLessThanOrEqual(20);
        expect(result).toMatch(/\.{3}$/); // Ends with ...
      });

      it('should handle path at exactly maxLength', () => {
        const path = 'a'.repeat(50);
        const result = truncatePath(path, 50);

        expect(result).toBe(path);
      });

      it('should handle path at maxLength + 1', () => {
        const path = 'a'.repeat(51);
        const result = truncatePath(path, 50);

        expect(result.length).toBeLessThanOrEqual(50);
      });

      it('should handle empty string input', () => {
        const result = truncatePath('');

        expect(result).toBe('');
      });

      it('should handle path with multiple consecutive slashes', () => {
        const path = 'src//components///file.ts';
        const result = truncatePath(path, 50);

        expect(result).toContain('file.ts');
      });
    });

    describe('realistic file paths', () => {
      it('should truncate typical spec file path', () => {
        const path = '.kiro/specs/pdf-visualization-frontend/requirements.md';
        const result = truncatePath(path, 40);

        expect(result.length).toBeLessThanOrEqual(40);
        expect(result).toContain('requirements.md');
      });

      it('should truncate deeply nested component path', () => {
        const path = 'frontend/src/components/dashboard/artifacts/cards/ArtifactCard.tsx';
        const result = truncatePath(path, 45);

        expect(result.length).toBeLessThanOrEqual(45);
        expect(result).toContain('ArtifactCard.tsx');
      });

      it('should truncate backend service path', () => {
        const path = 'backend/app/services/diagram_generation/enhanced_diagram_service.py';
        const result = truncatePath(path, 50);

        expect(result.length).toBeLessThanOrEqual(50);
        expect(result).toContain('enhanced_diagram_service.py');
      });
    });
  });

  describe('truncatePathSegments', () => {
    describe('short paths (no truncation needed)', () => {
      it('should return path with 3 or fewer segments unchanged', () => {
        const path = 'src/utils/test.ts';
        const result = truncatePathSegments(path, 3);

        expect(result).toBe(path);
      });

      it('should return path with 2 segments unchanged', () => {
        const path = 'src/test.ts';
        const result = truncatePathSegments(path, 3);

        expect(result).toBe(path);
      });

      it('should return single segment path unchanged', () => {
        const path = 'file.ts';
        const result = truncatePathSegments(path, 3);

        expect(result).toBe(path);
      });

      it('should return empty string for empty input', () => {
        const result = truncatePathSegments('');

        expect(result).toBe('');
      });
    });

    describe('long paths (truncation required)', () => {
      it('should keep last 3 segments by default', () => {
        const path = 'src/components/ui/buttons/PrimaryButton.tsx';
        const result = truncatePathSegments(path);

        expect(result).toBe('.../ui/buttons/PrimaryButton.tsx');
      });

      it('should keep last N segments', () => {
        const path = 'src/components/ui/buttons/PrimaryButton.tsx';
        const result = truncatePathSegments(path, 2);

        expect(result).toBe('.../buttons/PrimaryButton.tsx');
      });

      it('should keep only last segment when segments=1', () => {
        const path = 'src/components/ui/buttons/PrimaryButton.tsx';
        const result = truncatePathSegments(path, 1);

        expect(result).toBe('.../PrimaryButton.tsx');
      });

      it('should keep last 4 segments', () => {
        const path = 'frontend/src/components/dashboard/ArtifactList.tsx';
        const result = truncatePathSegments(path, 4);

        expect(result).toBe('.../src/components/dashboard/ArtifactList.tsx');
      });
    });

    describe('edge cases', () => {
      it('should handle path with exactly the requested segments', () => {
        const path = 'src/utils/test.ts';
        const result = truncatePathSegments(path, 3);

        expect(result).toBe('src/utils/test.ts');
      });

      it('should handle single file with no directory', () => {
        const path = 'file.ts';
        const result = truncatePathSegments(path, 3);

        expect(result).toBe('file.ts');
      });

      it('should handle empty string', () => {
        const result = truncatePathSegments('', 3);

        expect(result).toBe('');
      });
    });
  });

  describe('getFileName', () => {
    it('should extract filename from simple path', () => {
      const path = 'src/utils/test.ts';
      const result = getFileName(path);

      expect(result).toBe('test.ts');
    });

    it('should extract filename from deeply nested path', () => {
      const path = 'frontend/src/components/ui/buttons/PrimaryButton.tsx';
      const result = getFileName(path);

      expect(result).toBe('PrimaryButton.tsx');
    });

    it('should return filename when path has no directory', () => {
      const path = 'file.ts';
      const result = getFileName(path);

      expect(result).toBe('file.ts');
    });

    it('should handle path with multiple extensions', () => {
      const path = 'src/file.test.ts';
      const result = getFileName(path);

      expect(result).toBe('file.test.ts');
    });

    it('should return empty string for empty input', () => {
      const result = getFileName('');

      expect(result).toBe('');
    });

    it('should handle path ending with slash', () => {
      const path = 'src/utils/';
      const result = getFileName(path);

      expect(result).toBe('');
    });

    it('should extract filename from absolute-like path', () => {
      const path = '/var/www/html/index.html';
      const result = getFileName(path);

      expect(result).toBe('index.html');
    });

    it('should handle filename without extension', () => {
      const path = 'src/README';
      const result = getFileName(path);

      expect(result).toBe('README');
    });
  });

  describe('getDirPath', () => {
    it('should extract directory path from simple path', () => {
      const path = 'src/utils/test.ts';
      const result = getDirPath(path);

      expect(result).toBe('src/utils');
    });

    it('should extract directory path from deeply nested path', () => {
      const path = 'frontend/src/components/ui/buttons/PrimaryButton.tsx';
      const result = getDirPath(path);

      expect(result).toBe('frontend/src/components/ui/buttons');
    });

    it('should return empty string when path has no directory', () => {
      const path = 'file.ts';
      const result = getDirPath(path);

      expect(result).toBe('');
    });

    it('should handle path with single directory', () => {
      const path = 'src/file.ts';
      const result = getDirPath(path);

      expect(result).toBe('src');
    });

    it('should return empty string for empty input', () => {
      const result = getDirPath('');

      expect(result).toBe('');
    });

    it('should handle path ending with slash', () => {
      const path = 'src/utils/';
      const result = getDirPath(path);

      expect(result).toBe('src/utils');
    });

    it('should extract directory from absolute-like path', () => {
      const path = '/var/www/html/index.html';
      const result = getDirPath(path);

      expect(result).toBe('/var/www/html');
    });

    it('should handle root directory file', () => {
      const path = '/file.ts';
      const result = getDirPath(path);

      expect(result).toBe('');
    });
  });

  describe('integration of filename and directory functions', () => {
    it('should allow reconstructing path from directory and filename', () => {
      const path = 'src/utils/test.ts';
      const dir = getDirPath(path);
      const file = getFileName(path);

      expect(`${dir}/${file}`).toBe(path);
    });

    it('should handle reconstruction for nested paths', () => {
      const path = 'frontend/src/components/ArtifactCard.tsx';
      const dir = getDirPath(path);
      const file = getFileName(path);

      expect(`${dir}/${file}`).toBe(path);
    });

    it('should handle single file correctly', () => {
      const path = 'file.ts';
      const dir = getDirPath(path);
      const file = getFileName(path);

      // When no directory, just the filename
      if (dir === '') {
        expect(file).toBe(path);
      } else {
        expect(`${dir}/${file}`).toBe(path);
      }
    });
  });

  describe('UI tooltip use cases', () => {
    it('should provide useful truncation for metadata card display', () => {
      const longPath = '.kiro/specs/pdf-visualization-frontend/design-document.md';
      const truncated = truncatePath(longPath, 40);

      // Should show the filename clearly
      expect(truncated).toContain('design-document.md');
      // Should be short enough for a card
      expect(truncated.length).toBeLessThanOrEqual(40);
      // Should indicate there's more with ellipsis
      expect(truncated).toContain('...');
    });

    it('should provide compact segment-based truncation for lists', () => {
      const path = 'backend/app/services/diagram_generation.py';
      const truncated = truncatePathSegments(path, 2);

      // Should show last 2 segments with ellipsis
      expect(truncated).toBe('.../services/diagram_generation.py');
    });

    it('should extract filename for title display', () => {
      const path = 'docs/specifications/requirements.md';
      const filename = getFileName(path);

      expect(filename).toBe('requirements.md');
    });

    it('should extract directory for context display', () => {
      const path = 'frontend/src/components/ArtifactCard.tsx';
      const dir = getDirPath(path);

      expect(dir).toBe('frontend/src/components');
    });
  });
});
