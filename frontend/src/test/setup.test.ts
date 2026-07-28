import { describe, it, expect } from 'vitest';

describe('Test Setup', () => {
  it('should run a basic test', () => {
    expect(true).toBe(true);
  });

  it('should have access to DOM globals', () => {
    expect(window).toBeDefined();
    expect(document).toBeDefined();
  });

  it('should have matchMedia mock', () => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    expect(mediaQuery).toBeDefined();
    expect(mediaQuery.matches).toBe(false);
  });
});
