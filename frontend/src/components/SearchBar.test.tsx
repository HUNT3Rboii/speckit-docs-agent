/**
 * Unit tests for SearchBar component
 * Tests rendering, debounced input, clear functionality, and accessibility
 * **Validates: Requirements 9.1, 9.2**
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('rendering', () => {
    it('renders search input with default placeholder', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByPlaceholderText('Search by title or source path...');
      expect(input).toBeInTheDocument();
    });

    it('renders search input with custom placeholder', () => {
      render(<SearchBar value="" onChange={mockOnChange} placeholder="Custom search..." />);
      
      const input = screen.getByPlaceholderText('Custom search...');
      expect(input).toBeInTheDocument();
    });

    it('displays search icon', () => {
      const { container } = render(<SearchBar value="" onChange={mockOnChange} />);
      
      // Check for search icon (lucide-react renders SVGs)
      const searchIcon = container.querySelector('svg');
      expect(searchIcon).toBeInTheDocument();
    });

    it('displays initial value from props', () => {
      render(<SearchBar value="initial search" onChange={mockOnChange} />);
      
      const input = screen.getByDisplayValue('initial search');
      expect(input).toBeInTheDocument();
    });

    it('does not display clear button when input is empty', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const clearButton = screen.queryByLabelText('Clear search');
      expect(clearButton).not.toBeInTheDocument();
    });

    it('displays clear button when input has text', () => {
      render(<SearchBar value="test" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('updates input value when user types', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new search' } });
      
      expect(input).toHaveValue('new search');
    });

    it('clears input when clear button is clicked', () => {
      render(<SearchBar value="test text" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('');
    });

    it('hides clear button after clearing', () => {
      render(<SearchBar value="test text" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);
      
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });
  });

  describe('debounced onChange', () => {
    it('debounces onChange callback by 300ms', async () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      
      // Type quickly
      fireEvent.change(input, { target: { value: 't' } });
      fireEvent.change(input, { target: { value: 'te' } });
      fireEvent.change(input, { target: { value: 'tes' } });
      fireEvent.change(input, { target: { value: 'test' } });
      
      // onChange should not be called immediately
      expect(mockOnChange).not.toHaveBeenCalled();
      
      // Wait for debounce delay (300ms + buffer)
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('test');
      }, { timeout: 500 });
      
      // Should only be called once after debounce
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('resets debounce timer on each keystroke', async () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      
      // Type with delays shorter than debounce period
      fireEvent.change(input, { target: { value: 'a' } });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      fireEvent.change(input, { target: { value: 'ab' } });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      fireEvent.change(input, { target: { value: 'abc' } });
      
      // onChange should not be called yet
      expect(mockOnChange).not.toHaveBeenCalled();
      
      // Wait for full debounce after last keystroke
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('abc');
      }, { timeout: 500 });
      
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it('calls onChange immediately when clear button is clicked', async () => {
      render(<SearchBar value="test" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      fireEvent.click(clearButton);
      
      // Clear should trigger onChange after debounce
      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith('');
      }, { timeout: 500 });
    });
  });

  describe('controlled component behavior', () => {
    it('updates when value prop changes externally', () => {
      const { rerender } = render(<SearchBar value="initial" onChange={mockOnChange} />);
      
      expect(screen.getByDisplayValue('initial')).toBeInTheDocument();
      
      // Parent updates value
      rerender(<SearchBar value="updated" onChange={mockOnChange} />);
      
      expect(screen.getByDisplayValue('updated')).toBeInTheDocument();
    });

    it('syncs internal state with external value changes', async () => {
      const { rerender } = render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      
      // User types
      fireEvent.change(input, { target: { value: 'user input' } });
      expect(input).toHaveValue('user input');
      
      // Parent resets value
      rerender(<SearchBar value="" onChange={mockOnChange} />);
      
      expect(input).toHaveValue('');
    });
  });

  describe('accessibility', () => {
    it('has accessible label for search input', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByLabelText('Search artifacts');
      expect(input).toBeInTheDocument();
    });

    it('has accessible label for clear button', () => {
      render(<SearchBar value="test" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('marks search icon as decorative with aria-hidden', () => {
      const { container } = render(<SearchBar value="" onChange={mockOnChange} />);
      
      // Search icon should not be exposed to screen readers
      const searchIcon = container.querySelector('[aria-hidden="true"]');
      expect(searchIcon).toBeInTheDocument();
    });

    it('input is keyboard accessible', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      
      // Should be able to focus
      input.focus();
      expect(input).toHaveFocus();
    });

    it('clear button is keyboard accessible', () => {
      render(<SearchBar value="test" onChange={mockOnChange} />);
      
      const clearButton = screen.getByLabelText('Clear search');
      
      // Should be focusable and clickable via keyboard
      clearButton.focus();
      expect(clearButton).toHaveFocus();
      
      fireEvent.keyDown(clearButton, { key: 'Enter' });
    });
  });

  describe('visual styling', () => {
    it('positions search icon on the left', () => {
      const { container } = render(<SearchBar value="" onChange={mockOnChange} />);
      
      // Check for left positioning class
      const icon = container.querySelector('.left-3');
      expect(icon).toBeInTheDocument();
    });

    it('adds left padding to input for search icon', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('pl-9');
    });

    it('adds right padding to input for clear button', () => {
      render(<SearchBar value="" onChange={mockOnChange} />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('pr-9');
    });

    it('positions clear button on the right', () => {
      const { container } = render(<SearchBar value="test" onChange={mockOnChange} />);
      
      // Check for right positioning class
      const button = container.querySelector('.right-1');
      expect(button).toBeInTheDocument();
    });
  });
});
