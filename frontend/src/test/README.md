# Testing Setup

This directory contains the testing configuration and utilities for the PDF Visualization Frontend.

## Testing Framework

- **Test Runner**: Vitest (fast, Vite-native)
- **Component Testing**: React Testing Library
- **DOM Environment**: jsdom
- **Accessibility Linting**: eslint-plugin-jsx-a11y

## Configuration

### Test Setup (`setup.ts`)

The setup file includes:
- Automatic cleanup after each test
- Global mocks for browser APIs:
  - `window.matchMedia` (for responsive design tests)
  - `IntersectionObserver` (for lazy loading)
  - `ResizeObserver` (for responsive components)
- Jest DOM matchers from `@testing-library/jest-dom`

### Vitest Configuration (`vite.config.ts`)

Test configuration includes:
- **Environment**: jsdom (simulates browser environment)
- **Globals**: Enabled (no need to import `describe`, `it`, `expect`)
- **Setup Files**: Auto-runs `src/test/setup.ts` before tests
- **CSS**: Enabled (components can import CSS)
- **Coverage**: v8 provider with thresholds:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
  - Statements: 80%

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Writing Tests

### Component Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Hook Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMyHook } from './useMyHook';

describe('useMyHook', () => {
  it('returns expected data', async () => {
    const { result } = renderHook(() => useMyHook());
    
    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
  });
});
```

## Accessibility Testing

The project uses `eslint-plugin-jsx-a11y` to catch common accessibility issues:

```bash
# Run linter (includes accessibility checks)
npm run lint
```

Common accessibility rules enforced:
- Interactive elements must have accessible names
- Images must have alt text
- Form controls must have labels
- Proper ARIA attributes usage

## Coverage Reports

After running `npm run test:coverage`, view detailed reports:

- **Terminal**: Text summary shown in console
- **HTML Report**: Open `coverage/index.html` in browser
- **JSON Report**: `coverage/coverage-final.json` for CI/CD

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what users see and do
2. **Use Semantic Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Test Accessibility**: Use `getByRole` to ensure proper ARIA attributes
4. **Avoid Testing Library Internals**: Don't test React state directly
5. **Mock External Dependencies**: Use `vi.mock()` for API calls, external services
6. **Write Descriptive Test Names**: Clearly state what is being tested

## Troubleshooting

### CSS Parsing Warnings

You may see "Could not parse CSS stylesheet" warnings. These are harmless and occur when jsdom encounters modern CSS features. They don't affect test functionality.

### Type Errors in Tests

Make sure test files are excluded from the app build:
- Test files: `*.test.ts`, `*.test.tsx`
- Test directory: `src/test/**`

These are excluded in `tsconfig.app.json`.

### Mock Not Working

If global mocks (matchMedia, IntersectionObserver) aren't working:
1. Verify `setup.ts` is listed in `vite.config.ts` setupFiles
2. Check that tests import from the correct path
3. Ensure Vitest is running with `environment: 'jsdom'`
