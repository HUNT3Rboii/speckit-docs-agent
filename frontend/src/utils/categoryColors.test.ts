/**
 * Unit tests for category color mapping functions
 * Tests that correct colors are returned for all artifact types
 * **Validates: Requirements 4.4**
 */

import { describe, it, expect } from 'vitest';
import {
  categoryColors,
  getCategoryColor,
  getCategoryBadgeClasses,
  getCategoryHexColor,
  getCategoryColorName,
  type ArtifactCategory,
  type CategoryColorConfig,
} from './categoryColors';

describe('categoryColors utilities', () => {
  describe('categoryColors object', () => {
    it('should have color configuration for all artifact types', () => {
      const expectedCategories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];

      expectedCategories.forEach((category) => {
        expect(categoryColors).toHaveProperty(category);
      });
    });

    it('should have complete configuration for each category', () => {
      Object.values(categoryColors).forEach((config: CategoryColorConfig) => {
        expect(config).toHaveProperty('badge');
        expect(config).toHaveProperty('text');
        expect(config).toHaveProperty('hex');

        expect(typeof config.badge).toBe('string');
        expect(typeof config.text).toBe('string');
        expect(typeof config.hex).toBe('string');
      });
    });

    it('should have non-empty values for all configuration properties', () => {
      Object.values(categoryColors).forEach((config: CategoryColorConfig) => {
        expect(config.badge.length).toBeGreaterThan(0);
        expect(config.text.length).toBeGreaterThan(0);
        expect(config.hex.length).toBeGreaterThan(0);
      });
    });
  });

  describe('color mapping for each artifact type', () => {
    describe('spec category', () => {
      it('should return blue color configuration', () => {
        const config = getCategoryColor('spec');

        expect(config.text).toBe('blue');
        expect(config.hex).toBe('#3b82f6');
        expect(config.badge).toContain('blue');
      });

      it('should have Tailwind blue badge classes', () => {
        const config = categoryColors.spec;

        expect(config.badge).toBe('bg-blue-100 text-blue-800 border-blue-200');
      });
    });

    describe('plan category', () => {
      it('should return green color configuration', () => {
        const config = getCategoryColor('plan');

        expect(config.text).toBe('green');
        expect(config.hex).toBe('#22c55e');
        expect(config.badge).toContain('green');
      });

      it('should have Tailwind green badge classes', () => {
        const config = categoryColors.plan;

        expect(config.badge).toBe('bg-green-100 text-green-800 border-green-200');
      });
    });

    describe('task category', () => {
      it('should return orange color configuration', () => {
        const config = getCategoryColor('task');

        expect(config.text).toBe('orange');
        expect(config.hex).toBe('#f97316');
        expect(config.badge).toContain('orange');
      });

      it('should have Tailwind orange badge classes', () => {
        const config = categoryColors.task;

        expect(config.badge).toBe('bg-orange-100 text-orange-800 border-orange-200');
      });
    });

    describe('constitution category', () => {
      it('should return purple color configuration', () => {
        const config = getCategoryColor('constitution');

        expect(config.text).toBe('purple');
        expect(config.hex).toBe('#a855f7');
        expect(config.badge).toContain('purple');
      });

      it('should have Tailwind purple badge classes', () => {
        const config = categoryColors.constitution;

        expect(config.badge).toBe('bg-purple-100 text-purple-800 border-purple-200');
      });
    });

    describe('other category', () => {
      it('should return gray color configuration', () => {
        const config = getCategoryColor('other');

        expect(config.text).toBe('gray');
        expect(config.hex).toBe('#6b7280');
        expect(config.badge).toContain('gray');
      });

      it('should have Tailwind gray badge classes', () => {
        const config = categoryColors.other;

        expect(config.badge).toBe('bg-gray-100 text-gray-800 border-gray-200');
      });
    });
  });

  describe('getCategoryColor', () => {
    it('should return correct color config for spec', () => {
      const config = getCategoryColor('spec');

      expect(config).toEqual(categoryColors.spec);
    });

    it('should return correct color config for plan', () => {
      const config = getCategoryColor('plan');

      expect(config).toEqual(categoryColors.plan);
    });

    it('should return correct color config for task', () => {
      const config = getCategoryColor('task');

      expect(config).toEqual(categoryColors.task);
    });

    it('should return correct color config for constitution', () => {
      const config = getCategoryColor('constitution');

      expect(config).toEqual(categoryColors.constitution);
    });

    it('should return correct color config for other', () => {
      const config = getCategoryColor('other');

      expect(config).toEqual(categoryColors.other);
    });

    it('should return other config for unknown category', () => {
      const config = getCategoryColor('unknown' as ArtifactCategory);

      expect(config).toEqual(categoryColors.other);
    });
  });

  describe('getCategoryBadgeClasses', () => {
    it('should return badge classes for spec', () => {
      const classes = getCategoryBadgeClasses('spec');

      expect(classes).toBe('bg-blue-100 text-blue-800 border-blue-200');
    });

    it('should return badge classes for plan', () => {
      const classes = getCategoryBadgeClasses('plan');

      expect(classes).toBe('bg-green-100 text-green-800 border-green-200');
    });

    it('should return badge classes for task', () => {
      const classes = getCategoryBadgeClasses('task');

      expect(classes).toBe('bg-orange-100 text-orange-800 border-orange-200');
    });

    it('should return badge classes for constitution', () => {
      const classes = getCategoryBadgeClasses('constitution');

      expect(classes).toBe('bg-purple-100 text-purple-800 border-purple-200');
    });

    it('should return badge classes for other', () => {
      const classes = getCategoryBadgeClasses('other');

      expect(classes).toBe('bg-gray-100 text-gray-800 border-gray-200');
    });

    it('should return valid Tailwind CSS classes format', () => {
      const categories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];

      categories.forEach((category) => {
        const classes = getCategoryBadgeClasses(category);
        const classParts = classes.split(' ');

        // Should have 3 classes (bg, text, border)
        expect(classParts.length).toBe(3);

        // Should start with bg-
        expect(classParts[0]).toMatch(/^bg-/);

        // Should have text- class
        expect(classParts[1]).toMatch(/^text-/);

        // Should have border- class
        expect(classParts[2]).toMatch(/^border-/);
      });
    });
  });

  describe('getCategoryHexColor', () => {
    it('should return hex color for spec', () => {
      const hex = getCategoryHexColor('spec');

      expect(hex).toBe('#3b82f6');
    });

    it('should return hex color for plan', () => {
      const hex = getCategoryHexColor('plan');

      expect(hex).toBe('#22c55e');
    });

    it('should return hex color for task', () => {
      const hex = getCategoryHexColor('task');

      expect(hex).toBe('#f97316');
    });

    it('should return hex color for constitution', () => {
      const hex = getCategoryHexColor('constitution');

      expect(hex).toBe('#a855f7');
    });

    it('should return hex color for other', () => {
      const hex = getCategoryHexColor('other');

      expect(hex).toBe('#6b7280');
    });

    it('should return valid hex color format', () => {
      const categories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];
      const hexPattern = /^#[0-9a-f]{6}$/i;

      categories.forEach((category) => {
        const hex = getCategoryHexColor(category);
        expect(hex).toMatch(hexPattern);
      });
    });
  });

  describe('getCategoryColorName', () => {
    it('should return color name for spec', () => {
      const name = getCategoryColorName('spec');

      expect(name).toBe('blue');
    });

    it('should return color name for plan', () => {
      const name = getCategoryColorName('plan');

      expect(name).toBe('green');
    });

    it('should return color name for task', () => {
      const name = getCategoryColorName('task');

      expect(name).toBe('orange');
    });

    it('should return color name for constitution', () => {
      const name = getCategoryColorName('constitution');

      expect(name).toBe('purple');
    });

    it('should return color name for other', () => {
      const name = getCategoryColorName('other');

      expect(name).toBe('gray');
    });
  });

  describe('consistency across utility functions', () => {
    it('should return consistent data from all getter functions', () => {
      const categories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];

      categories.forEach((category) => {
        const fullConfig = getCategoryColor(category);
        const badgeClasses = getCategoryBadgeClasses(category);
        const hexColor = getCategoryHexColor(category);
        const colorName = getCategoryColorName(category);

        expect(badgeClasses).toBe(fullConfig.badge);
        expect(hexColor).toBe(fullConfig.hex);
        expect(colorName).toBe(fullConfig.text);
      });
    });
  });

  describe('UI requirements validation', () => {
    it('should match the design spec color requirements', () => {
      // Design spec requirements from Requirements 4.4:
      // spec: blue, plan: green, task: orange, constitution: purple, other: gray

      expect(getCategoryColorName('spec')).toBe('blue');
      expect(getCategoryColorName('plan')).toBe('green');
      expect(getCategoryColorName('task')).toBe('orange');
      expect(getCategoryColorName('constitution')).toBe('purple');
      expect(getCategoryColorName('other')).toBe('gray');
    });

    it('should have distinct colors for each category', () => {
      const categories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];
      const hexColors = categories.map((cat) => getCategoryHexColor(cat));

      // All colors should be unique
      const uniqueColors = new Set(hexColors);
      expect(uniqueColors.size).toBe(categories.length);
    });

    it('should have distinct badge classes for each category', () => {
      const categories: ArtifactCategory[] = ['spec', 'plan', 'task', 'constitution', 'other'];
      const badgeClasses = categories.map((cat) => getCategoryBadgeClasses(cat));

      // All badge classes should be unique
      const uniqueClasses = new Set(badgeClasses);
      expect(uniqueClasses.size).toBe(categories.length);
    });
  });
});
