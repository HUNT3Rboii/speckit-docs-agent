import * as vscode from 'vscode';

import { ProposedEnrichment, parseEnrichment } from './parse';

/**
 * Which AI answers, and in what order.
 *
 * Two kinds of provider, as before. The editor's own models - Copilot, Claude,
 * anything else registered with VS Code - come through the Language Model API
 * and need no key. Custom entries are OpenAI-compatible endpoints the user
 * configured themselves, which is how a local Ollama or a company gateway gets
 * used.
 *
 * The custom path runs here in the extension host rather than in the webview:
 * the host is Node and may open a socket, the webview is under a CSP that
 * forbids it.
 */

export interface CustomModel {
  id: string;
  enabled: boolean;
  label?: string;
  endpoint: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export type ProviderKind = 'copilot' | 'claude' | 'kiro' | 'generic' | 'custom' | string;

export interface Provider {
  id: string;
  label: string;
  send(prompt: PromptPair, token: vscode.CancellationToken): Promise<string>;
}

export interface PromptPair {
  system: string;
  user: string;
}

const DEFAULT_PRIORITY: ProviderKind[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];

/** Vendor ids the Language Model API reports for the editors we know about. */
const VENDORS: Record<string, string> = {
  copilot: 'copilot',
  claude: 'anthropic',
  kiro: 'kiro',
};

export function readCustomModels(): CustomModel[] {
  const configured = vscode.workspace
    .getConfiguration('speckitStandalone')
    .get<CustomModel[]>('customModels', []);

  return configured.filter((entry) => entry && typeof entry.endpoint === 'string' && entry.endpoint);
}

export function readPriority(): ProviderKind[] {
  const configured = vscode.workspace
    .getConfiguration('speckitStandalone')
    .get<ProviderKind[]>('providerPriority', DEFAULT_PRIORITY);
  return configured.length ? configured : DEFAULT_PRIORITY;
}

/**
 * Build the ordered list of providers to try.
 *
 * An entry naming a provider that is not available is skipped rather than
 * failing: a priority list mentioning Claude on a machine without it should
 * fall through to whatever is there.
 */
export async function resolveProviders(log: (message: string) => void): Promise<Provider[]> {
  const priority = readPriority();
  const customModels = readCustomModels();
  const providers: Provider[] = [];

  for (const entry of priority) {
    if (entry === 'custom' || entry.startsWith('custom:')) {
      const wanted = entry.startsWith('custom:') ? entry.slice('custom:'.length) : undefined;
      for (const model of customModels) {
        if (!model.enabled) {
          continue;
        }
        if (wanted && model.id !== wanted) {
          continue;
        }
        providers.push(customProvider(model));
      }
      continue;
    }

    const chatModels = await selectModels(entry);
    for (const model of chatModels) {
      providers.push(languageModelProvider(entry, model, log));
    }
  }

  return providers;
}

async function selectModels(kind: ProviderKind): Promise<vscode.LanguageModelChat[]> {
  try {
    if (kind === 'generic') {
      // Whatever is registered that the named vendors did not already cover.
      const all = await vscode.lm.selectChatModels();
      return all.filter((model) => !Object.values(VENDORS).includes(model.vendor));
    }

    const vendor = VENDORS[kind];
    if (!vendor) {
      return [];
    }
    return await vscode.lm.selectChatModels({ vendor });
  } catch {
    // selectChatModels throws when the user has never consented; that is a
    // "not available", not an error worth stopping for.
    return [];
  }
}

function languageModelProvider(
  kind: ProviderKind,
  model: vscode.LanguageModelChat,
  log: (message: string) => void
): Provider {
  return {
    id: `${kind}:${model.id}`,
    label: `${model.vendor}/${model.family}`,
    async send(prompt, token) {
      log(`asking ${model.vendor}/${model.family}`);
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt.system), vscode.LanguageModelChatMessage.User(prompt.user)],
        {},
        token
      );

      let text = '';
      for await (const fragment of response.text) {
        text += fragment;
      }
      return text;
    },
  };
}

/**
 * An OpenAI-compatible chat completion.
 *
 * Deliberately plain `fetch` with no SDK: the shape is three fields, and a
 * dependency here would ship in all four platform VSIXes.
 */
function customProvider(model: CustomModel): Provider {
  return {
    id: `custom:${model.id}`,
    label: model.label || `${model.model} at ${model.endpoint}`,
    async send(prompt, token) {
      const controller = new AbortController();
      const cancellation = token.onCancellationRequested(() => controller.abort());

      try {
        const response = await fetch(model.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
            ...(model.headers ?? {}),
          },
          body: JSON.stringify({
            model: model.model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`${model.endpoint} answered ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return payload.choices?.[0]?.message?.content ?? '';
      } finally {
        cancellation.dispose();
      }
    },
  };
}

/**
 * Ask an endpoint what it can run.
 *
 * The old extension had this so a user could fill in a model name from a list
 * instead of guessing one, which is the difference between working first try
 * and a 404 with no clue in it.
 */
export async function discoverModels(model: CustomModel): Promise<string[]> {
  const base = model.endpoint.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
  const response = await fetch(`${base}/models`, {
    headers: {
      ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
      ...(model.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${base}/models answered ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { data?: { id?: string }[] };
  return (payload.data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
}

export class NoProviderAvailableError extends Error {
  constructor() {
    super(
      'No AI provider is available. Sign in to GitHub Copilot, install another provider that registers with ' +
        'VS Code, or add an endpoint under "Speckit: Manage AI Providers".'
    );
    this.name = 'NoProviderAvailableError';
  }
}

/**
 * Try each provider in turn until one answers usefully.
 *
 * A provider that errors, or returns something unparseable, is a reason to try
 * the next one rather than to give up - which is the entire point of having an
 * ordered list.
 */
export async function requestEnrichment(
  prompt: PromptPair,
  token: vscode.CancellationToken,
  log: (message: string) => void
): Promise<{ enrichment: ProposedEnrichment; provider: string } | undefined> {
  const providers = await resolveProviders(log);

  if (!providers.length) {
    throw new NoProviderAvailableError();
  }

  for (const provider of providers) {
    try {
      const answer = await provider.send(prompt, token);
      const enrichment = parseEnrichment(answer);

      if (enrichment.summary || enrichment.glossary.length || enrichment.diagrams.length) {
        return { enrichment, provider: provider.label };
      }
      log(`${provider.label} returned nothing usable; trying the next provider`);
    } catch (error) {
      log(`${provider.label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return undefined;
}
