import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.restoreAllMocks();
  });

  it('defaults to light mode when no preference is stored and system prefers light', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);

    render(<ThemeToggle />);

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  it('respects a stored dark preference on mount', () => {
    localStorage.setItem('theme', 'dark');

    render(<ThemeToggle />);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it('toggles from light to dark on click and persists the choice', async () => {
    const user = userEvent.setup();
    localStorage.setItem('theme', 'light');

    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('toggles from dark back to light on a second click', async () => {
    const user = userEvent.setup();
    localStorage.setItem('theme', 'dark');

    render(<ThemeToggle />);

    await user.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
