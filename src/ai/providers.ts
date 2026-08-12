import * as vscode from 'vscode';

import { CustomModelEntry, readEntry } from './customModels';
import { PriorityEntry, ProviderId, expandPriority } from './providerPriority';
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

export interface Provider {
  id: string;
  label: string;
  send(prompt: PromptPair, token: vscode.CancellationToken): Promise<string>;
}

export interface PromptPair {
  system: string;
  user: string;
}

const DEFAULT_PRIORITY: PriorityEntry[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];

/** Vendor ids the Language Model API reports for the editors we know about. */
const VENDORS: Record<string, string> = {
  copilot: 'copilot',
  claude: 'anthropic',
  kiro: 'kiro',
};

/**
 * Every configured custom endpoint, in the setting's own order.
 *
 * Entries are read through `readEntry`, so a config written by an earlier build
 * (a full `endpoint` URL and a `model`) is understood exactly like one the
 * panel wrote. An entry with no usable base URL is dropped rather than being
 * offered as a provider that can only fail.
 */
export function readCustomModels(): CustomModelEntry[] {
  const configured = vscode.workspace
    .getConfiguration('speckitStandalone')
    .get<unknown[]>('customModels', []);

  return configured
    .map((entry) => readEntry(entry))
    .filter((entry): entry is CustomModelEntry => entry !== null);
}

export function readPriority(): PriorityEntry[] {
  const configured = vscode.workspace
    .getConfiguration('speckitStandalone')
    .get<PriorityEntry[]>('providerPriority', DEFAULT_PRIORITY);
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
  const providers: Provider[] = [];

  // The order is expanded before anything is tried: "custom:<id>" names one
  // entry, a bare "custom" stands for every entry not placed individually, and
  // either way each model appears exactly once.
  for (const resolved of expandPriority(readPriority(), readCustomModels())) {
    if (resolved.kind === 'custom') {
      if (resolved.entry.enabled) {
        providers.push(customProvider(resolved.entry));
      }
      continue;
    }

    const chatModels = await selectModels(resolved.id);
    for (const model of chatModels) {
      providers.push(languageModelProvider(resolved.id, model, log));
    }
  }

  return providers;
}

async function selectModels(kind: ProviderId): Promise<vscode.LanguageModelChat[]> {
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
  kind: ProviderId,
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
function customProvider(model: CustomModelEntry): Provider {
  return {
    id: `custom:${model.id}`,
    label: model.name || `${model.modelName} at ${model.baseUrl}`,
    async send(prompt, token) {
      const controller = new AbortController();
      const cancellation = token.onCancellationRequested(() => controller.abort());

      try {
        const response = await fetch(`${model.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(model.apiKey ? { Authorization: `Bearer ${model.apiKey}` } : {}),
            ...(model.headers ?? {}),
          },
          body: JSON.stringify({
            model: model.modelName,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`${model.baseUrl} answered ${response.status} ${response.statusText}`);
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
