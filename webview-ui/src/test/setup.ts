/**
 * `acquireVsCodeApi` only exists inside a real webview, and bridge.ts captures
 * it at module scope - it has to, since calling it twice throws. Under jsdom
 * the import itself would fail, so a stand-in is installed before anything
 * imports the bridge.
 *
 * Messages posted here go nowhere: components under test either mock the API
 * client or assert on what they render, neither of which needs a host.
 */
const postedMessages: unknown[] = [];
let webviewState: unknown;

(globalThis as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage: (message: unknown) => postedMessages.push(message),
  getState: () => webviewState,
  setState: (state: unknown) => {
    webviewState = state;
  },
});

export { postedMessages };

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia for responsive design tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // Deprecated
    removeListener: () => {}, // Deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

// Mock IntersectionObserver for lazy loading components
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof global.IntersectionObserver;

// Mock ResizeObserver for responsive components
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as unknown as typeof global.ResizeObserver;

// Add custom matchers if needed
expect.extend({
  // Custom matchers can be added here
});

