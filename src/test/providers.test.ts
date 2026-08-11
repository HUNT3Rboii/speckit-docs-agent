import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import Module from 'node:module';

/**
 * Provider-chain tests.
 *
 * `vscode` does not exist outside an editor, so it is stubbed at the module
 * loader before the code under test is imported - the same trick the smoke
 * harness uses. What is being checked is the ordering and fallback logic, which
 * is where a mistake means the wrong model answers, or none does.
 */

interface Settings {
  providerPriority?: string[];
  customModels?: unknown[];
}

let settings: Settings = {};
let availableModels: Record<string, { vendor: string; family: string; id: string; reply: string }[]> = {};

const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => (settings as Record<string, unknown>)[key] ?? fallback,
    }),
  },
  lm: {
    selectChatModels: async (filter?: { vendor?: string }) => {
      const all = Object.values(availableModels).flat();
      const matching = filter?.vendor ? all.filter((model) => model.vendor === filter.vendor) : all;
      return matching.map((model) => ({
        ...model,
        sendRequest: async () => ({
          text: (async function* () {
            yield model.reply;
          })(),
        }),
      }));
    },
  },
  LanguageModelChatMessage: { User: (content: string) => ({ content }) },
};

const loader = Module as unknown as { _load: (...args: unknown[]) => unknown };
const load = loader._load;
loader._load = function patched(this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return load.call(this, request, ...rest);
};

const { requestEnrichment, readPriority, NoProviderAvailableError } = require('../ai/providers');

const ANSWER = JSON.stringify({ summary: 'x', glossary: [], diagrams: [] });
const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };

function reset() {
  settings = {};
  availableModels = {};
  mock.reset();
}

describe('provider priority', () => {
  it('defaults to the editor first, custom endpoints last', () => {
    reset();
    assert.deepEqual(readPriority(), ['copilot', 'claude', 'kiro', 'generic', 'custom']);
  });

  it('honours a configured order', () => {
    reset();
    settings.providerPriority = ['claude', 'copilot'];
    assert.deepEqual(readPriority(), ['claude', 'copilot']);
  });

  it('asks the highest-priority available provider', async () => {
    reset();
    availableModels = {
      copilot: [{ vendor: 'copilot', family: 'gpt-4o', id: 'c1', reply: ANSWER }],
      claude: [{ vendor: 'anthropic', family: 'sonnet', id: 'a1', reply: ANSWER }],
    };
    settings.providerPriority = ['claude', 'copilot'];

    const result = await requestEnrichment({ system: 's', user: 'u' }, token, () => {});
    assert.equal(result?.provider, 'anthropic/sonnet');
  });

  it('falls through to the next provider when one returns nothing usable', async () => {
    // An empty or unparseable answer is a reason to try the next provider,
    // which is the entire point of having an ordered list.
    reset();
    availableModels = {
      copilot: [{ vendor: 'copilot', family: 'gpt-4o', id: 'c1', reply: 'I cannot help with that.' }],
      claude: [{ vendor: 'anthropic', family: 'sonnet', id: 'a1', reply: ANSWER }],
    };
    settings.providerPriority = ['copilot', 'claude'];

    const result = await requestEnrichment({ system: 's', user: 'u' }, token, () => {});
    assert.equal(result?.provider, 'anthropic/sonnet');
  });

  it('skips a named provider that is not installed', async () => {
    reset();
    availableModels = { copilot: [{ vendor: 'copilot', family: 'gpt-4o', id: 'c1', reply: ANSWER }] };
    settings.providerPriority = ['kiro', 'copilot'];

    const result = await requestEnrichment({ system: 's', user: 'u' }, token, () => {});
    assert.equal(result?.provider, 'copilot/gpt-4o');
  });

  it('reports when nothing is available at all', async () => {
    reset();
    await assert.rejects(
      requestEnrichment({ system: 's', user: 'u' }, token, () => {}),
      (error: Error) => error instanceof NoProviderAvailableError
    );
  });

  it('returns undefined when every available provider fails', async () => {
    // Distinct from having no provider: the caller can fall back to a plain
    // PDF rather than telling the user to install something they already have.
    reset();
    availableModels = { copilot: [{ vendor: 'copilot', family: 'gpt-4o', id: 'c1', reply: 'nonsense' }] };

    const result = await requestEnrichment({ system: 's', user: 'u' }, token, () => {});
    assert.equal(result, undefined);
  });

  it('ignores disabled custom endpoints', async () => {
    reset();
    settings.providerPriority = ['custom'];
    settings.customModels = [{ id: 'local', enabled: false, endpoint: 'http://localhost:1234/v1/chat/completions' }];

    await assert.rejects(
      requestEnrichment({ system: 's', user: 'u' }, token, () => {}),
      (error: Error) => error instanceof NoProviderAvailableError
    );
  });
});
