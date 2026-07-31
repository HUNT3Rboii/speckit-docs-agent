/**
 * Unit tests for CategoryFilter component
 * Tests rendering, toggle functionality, color coding, and accessibility
 * **Validates: Requirements 9.3, 9.4, 4.2**
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CategoryFilter } from './CategoryFilter';
import type { ArtifactCategory } from '../utils/categoryColors';

describe('CategoryFilter', () => {
  const mockOnCategoryToggle = vi.fn();

  const mockCategoryCounts = {
    spec: 5,
    plan: 3,
    task: 8,
    constitution: 2,
    other: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders all category buttons', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Filter by Spec')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Plan')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Task')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Constitution')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Other')).toBeInTheDocument();
    });

    it('renders "All" button', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Show all categories')).toBeInTheDocument();
    });

    it('displays category counts when provided', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
          categoryCounts={mockCategoryCounts}
        />
      );

      expect(screen.getByText(/\(5\)/)).toBeInTheDocument(); // spec count
      expect(screen.getByText(/\(3\)/)).toBeInTheDocument(); // plan count
      expect(screen.getByText(/\(8\)/)).toBeInTheDocument(); // task count
      expect(screen.getByText(/\(2\)/)).toBeInTheDocument(); // constitution count
      expect(screen.getByText(/\(1\)/)).toBeInTheDocument(); // other count
    });

    it('displays total count on "All" button when counts provided', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
          categoryCounts={mockCategoryCounts}
        />
      );

      // Total: 5 + 3 + 8 + 2 + 1 = 19
      expect(screen.getByText(/\(19\)/)).toBeInTheDocument();
    });

    it('does not display counts when not provided', () => {
      const { container } = render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      // Check that no count text exists
      const text = container.textContent || '';
      expect(text).not.toMatch(/\(\d+\)/);
    });
  });

  describe('selection state', () => {
    it('marks "All" as selected when no categories are selected', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const allButton = screen.getByLabelText('Show all categories');
      expect(allButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('marks "All" as not selected when categories are selected', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set(['spec'] as ArtifactCategory[])}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const allButton = screen.getByLabelText('Show all categories');
      expect(allButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks selected categories with aria-pressed', () => {
      const selectedCategories = new Set(['spec', 'task'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Filter by Spec')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filter by Plan')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByLabelText('Filter by Task')).toHaveAttribute('aria-pressed', 'true');
    });

    it('applies visual styling to selected categories', () => {
      const selectedCategories = new Set(['spec'] as ArtifactCategory[]);
      
      const { container } = render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      
      // Selected buttons should have color classes applied
      expect(specButton).toHaveClass('bg-blue-100');
      expect(specButton).toHaveClass('text-blue-800');
    });
  });

  describe('color coding', () => {
    it('applies blue color to selected spec button', () => {
      const selectedCategories = new Set(['spec'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      expect(specButton).toHaveClass('bg-blue-100', 'text-blue-800');
    });

    it('applies green color to selected plan button', () => {
      const selectedCategories = new Set(['plan'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const planButton = screen.getByLabelText('Filter by Plan');
      expect(planButton).toHaveClass('bg-green-100', 'text-green-800');
    });

    it('applies orange color to selected task button', () => {
      const selectedCategories = new Set(['task'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const taskButton = screen.getByLabelText('Filter by Task');
      expect(taskButton).toHaveClass('bg-orange-100', 'text-orange-800');
    });

    it('applies purple color to selected constitution button', () => {
      const selectedCategories = new Set(['constitution'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const constitutionButton = screen.getByLabelText('Filter by Constitution');
      expect(constitutionButton).toHaveClass('bg-purple-100', 'text-purple-800');
    });

    it('applies gray color to selected other button', () => {
      const selectedCategories = new Set(['other'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const otherButton = screen.getByLabelText('Filter by Other');
      expect(otherButton).toHaveClass('bg-gray-100', 'text-gray-800');
    });

    it('does not apply color classes to unselected buttons', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      expect(specButton).not.toHaveClass('bg-blue-100');
      expect(specButton).not.toHaveClass('text-blue-800');
    });
  });

  describe('user interactions', () => {
    it('calls onCategoryToggle with "all" when All button is clicked', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set(['spec'] as ArtifactCategory[])}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const allButton = screen.getByLabelText('Show all categories');
      fireEvent.click(allButton);

      expect(mockOnCategoryToggle).toHaveBeenCalledTimes(1);
      expect(mockOnCategoryToggle).toHaveBeenCalledWith('all');
    });

    it('calls onCategoryToggle with category when category button is clicked', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      fireEvent.click(specButton);

      expect(mockOnCategoryToggle).toHaveBeenCalledTimes(1);
      expect(mockOnCategoryToggle).toHaveBeenCalledWith('spec');
    });

    it('calls onCategoryToggle for each clicked category', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      fireEvent.click(screen.getByLabelText('Filter by Spec'));
      fireEvent.click(screen.getByLabelText('Filter by Task'));
      fireEvent.click(screen.getByLabelText('Filter by Plan'));

      expect(mockOnCategoryToggle).toHaveBeenCalledTimes(3);
      expect(mockOnCategoryToggle).toHaveBeenNthCalledWith(1, 'spec');
      expect(mockOnCategoryToggle).toHaveBeenNthCalledWith(2, 'task');
      expect(mockOnCategoryToggle).toHaveBeenNthCalledWith(3, 'plan');
    });

    it('allows clicking already selected category (toggle off)', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set(['spec'] as ArtifactCategory[])}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      fireEvent.click(specButton);

      expect(mockOnCategoryToggle).toHaveBeenCalledWith('spec');
    });
  });

  describe('accessibility', () => {
    it('has role="group" for semantic grouping', () => {
      const { container } = render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const group = container.querySelector('[role="group"]');
      expect(group).toBeInTheDocument();
    });

    it('has accessible group label', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Filter by category')).toBeInTheDocument();
    });

    it('all buttons have accessible labels', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Show all categories')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Spec')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Plan')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Task')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Constitution')).toBeInTheDocument();
      expect(screen.getByLabelText('Filter by Other')).toBeInTheDocument();
    });

    it('buttons have aria-pressed state for toggle behavior', () => {
      const selectedCategories = new Set(['spec'] as ArtifactCategory[]);
      
      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      const planButton = screen.getByLabelText('Filter by Plan');

      expect(specButton).toHaveAttribute('aria-pressed', 'true');
      expect(planButton).toHaveAttribute('aria-pressed', 'false');
    });

    it('buttons are keyboard accessible', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const specButton = screen.getByLabelText('Filter by Spec');
      
      // Should be focusable
      specButton.focus();
      expect(specButton).toHaveFocus();
    });

    it('meets touch target size requirements (44x44px)', () => {
      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const buttons = screen.getAllByRole('button');
      
      buttons.forEach(button => {
        // Check for min-h-[44px] class
        expect(button).toHaveClass('min-h-[44px]');
      });
    });
  });

  describe('responsive layout', () => {
    it('uses flexbox with wrap for responsive layout', () => {
      const { container } = render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const wrapper = container.querySelector('.flex');
      expect(wrapper).toHaveClass('flex-wrap');
    });

    it('applies consistent gap between buttons', () => {
      const { container } = render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      const wrapper = container.querySelector('.flex');
      expect(wrapper).toHaveClass('gap-2');
    });
  });

  describe('edge cases', () => {
    it('handles empty category counts gracefully', () => {
      const emptyCounts = {
        spec: 0,
        plan: 0,
        task: 0,
        constitution: 0,
        other: 0,
      };

      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
          categoryCounts={emptyCounts}
        />
      );

      // Multiple elements will have (0), so use getAllByText
      const zeroCountElements = screen.getAllByText(/\(0\)/);
      expect(zeroCountElements.length).toBeGreaterThan(0);
    });

    it('handles multiple selected categories', () => {
      const selectedCategories = new Set([
        'spec',
        'plan',
        'task',
      ] as ArtifactCategory[]);

      render(
        <CategoryFilter
          selectedCategories={selectedCategories}
          onCategoryToggle={mockOnCategoryToggle}
        />
      );

      expect(screen.getByLabelText('Filter by Spec')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filter by Plan')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filter by Task')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filter by Constitution')).toHaveAttribute('aria-pressed', 'false');
    });

    it('calculates correct total when some categories have zero count', () => {
      const partialCounts = {
        spec: 5,
        plan: 0,
        task: 3,
        constitution: 0,
        other: 1,
      };

      render(
        <CategoryFilter
          selectedCategories={new Set()}
          onCategoryToggle={mockOnCategoryToggle}
          categoryCounts={partialCounts}
        />
      );

      // Total: 5 + 0 + 3 + 0 + 1 = 9
      expect(screen.getByText(/\(9\)/)).toBeInTheDocument();
    });
  });
});
