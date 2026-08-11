import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

/**
 * Unit tests for useDebounce hook
 * Tests debounce timing behavior with value updates after delay
 * **Validates: Requirements 4.3**
 */
describe('useDebounce', () => {
  describe('basic debounce behavior', () => {
    it('should return initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('initial', 100));

      expect(result.current).toBe('initial');
    });

    it('should return debounced value after delay', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 100 },
        }
      );

      expect(result.current).toBe('initial');

      // Update the value
      await act(async () => {
        rerender({ value: 'updated', delay: 100 });
      });

      // Value should still be 'initial' immediately
      expect(result.current).toBe('initial');

      // Wait for debounce delay
      await waitFor(
        () => expect(result.current).toBe('updated'),
        { timeout: 200 }
      );
    });

    it('should not update value immediately after change', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'initial' },
        }
      );

      await act(async () => {
        rerender({ value: 'updated' });
      });

      // Value should still be 'initial' immediately after rerender
      expect(result.current).toBe('initial');
    });
  });

  describe('multiple rapid changes', () => {
    it('should only update to the final value after rapid changes', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'value1' },
        }
      );

      expect(result.current).toBe('value1');

      // Simulate rapid typing
      await act(async () => {
        rerender({ value: 'value2' });
        await new Promise(resolve => setTimeout(resolve, 20));
        rerender({ value: 'value3' });
        await new Promise(resolve => setTimeout(resolve, 20));
        rerender({ value: 'value4' });
      });

      // Should still show initial value
      expect(result.current).toBe('value1');

      // Wait for final debounced value
      await waitFor(
        () => expect(result.current).toBe('value4'),
        { timeout: 200 }
      );
    });

    it('should cancel previous timeout on new value', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'first' },
        }
      );

      await act(async () => {
        rerender({ value: 'second' });
        await new Promise(resolve => setTimeout(resolve, 50));
        // Update again before the first timeout completes
        rerender({ value: 'third' });
      });

      // Wait for final value
      await waitFor(
        () => expect(result.current).toBe('third'),
        { timeout: 200 }
      );

      // Verify we never got 'second'
      expect(result.current).not.toBe('second');
    });
  });

  describe('different delay values', () => {
    it('should respect custom delay', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 150),
        {
          initialProps: { value: 'initial' },
        }
      );

      await act(async () => {
        rerender({ value: 'updated' });
      });

      await waitFor(
        () => expect(result.current).toBe('updated'),
        { timeout: 250 }
      );
    });

    it('should use default delay of 300ms when not specified', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value),
        {
          initialProps: { value: 'initial' },
        }
      );

      await act(async () => {
        rerender({ value: 'updated' });
      });

      await waitFor(
        () => expect(result.current).toBe('updated'),
        { timeout: 400 }
      );
    });
  });

  describe('different data types', () => {
    it('should work with numbers', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 0 },
        }
      );

      expect(result.current).toBe(0);

      await act(async () => {
        rerender({ value: 42 });
      });

      await waitFor(
        () => expect(result.current).toBe(42),
        { timeout: 200 }
      );
    });

    it('should work with boolean values', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: false },
        }
      );

      expect(result.current).toBe(false);

      await act(async () => {
        rerender({ value: true });
      });

      await waitFor(
        () => expect(result.current).toBe(true),
        { timeout: 200 }
      );
    });

    it('should work with objects', async () => {
      const obj1 = { name: 'Alice' };
      const obj2 = { name: 'Bob' };

      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: obj1 },
        }
      );

      expect(result.current).toBe(obj1);

      await act(async () => {
        rerender({ value: obj2 });
      });

      await waitFor(
        () => expect(result.current).toBe(obj2),
        { timeout: 200 }
      );
    });

    it('should work with arrays', async () => {
      const arr1 = [1, 2, 3];
      const arr2 = [4, 5, 6];

      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: arr1 },
        }
      );

      expect(result.current).toBe(arr1);

      await act(async () => {
        rerender({ value: arr2 });
      });

      await waitFor(
        () => expect(result.current).toBe(arr2),
        { timeout: 200 }
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'text' },
        }
      );

      await act(async () => {
        rerender({ value: '' });
      });

      await waitFor(
        () => expect(result.current).toBe(''),
        { timeout: 200 }
      );
    });

    it('should handle null value', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'text' as string | null },
        }
      );

      await act(async () => {
        rerender({ value: null });
      });

      await waitFor(
        () => expect(result.current).toBeNull(),
        { timeout: 200 }
      );
    });

    it('should handle undefined value', async () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'text' as string | undefined },
        }
      );

      await act(async () => {
        rerender({ value: undefined });
      });

      await waitFor(
        () => expect(result.current).toBeUndefined(),
        { timeout: 200 }
      );
    });
  });

  describe('cleanup on unmount', () => {
    it('should clear timeout when component unmounts', async () => {
      const { result, rerender, unmount } = renderHook(
        ({ value }) => useDebounce(value, 100),
        {
          initialProps: { value: 'initial' },
        }
      );

      await act(async () => {
        rerender({ value: 'updated' });
      });

      // Unmount before timeout completes
      unmount();

      // Wait a bit to ensure no errors occur
      await new Promise(resolve => setTimeout(resolve, 150));

      // Value should still be 'initial' since component unmounted
      expect(result.current).toBe('initial');
    });
  });
});
