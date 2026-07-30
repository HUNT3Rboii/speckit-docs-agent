/**
 * Jest config for pure-logic unit tests that don't need the VS Code
 * Extension Host (e.g. EnrichmentPromptBuilder, JSONParser, RuleBasedProvider).
 * Anything that imports the `vscode` module belongs in test/suite/ instead,
 * run via `npm test` (@vscode/test-electron + Mocha), not here.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  }
};
