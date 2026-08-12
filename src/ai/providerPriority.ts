/**
 * Provider try-order resolution (speckitStandalone.providerPriority).
 *
 * The priority list holds two kinds of token:
 * - a built-in provider id: "copilot" | "claude" | "kiro" | "generic"
 * - a custom model reference: "custom:<CustomModelEntry.id>", so each configured
 *   custom model is an individually orderable entry rather than being lumped
 *   behind one opaque "custom" token
 *
 * The bare "custom" token is still honoured - it is the shipped default and what
 * every pre-existing settings.json contains: it expands, at its own position, to
 * every configured custom model not already listed individually somewhere else
 * in the list. Old configs keep working unchanged while a per-model order takes
 * precedence.
 *
 * Pure logic, no vscode import, so the ordering rules are unit-testable;
 * providers.ts only maps the result onto provider instances.
 */

import { CustomModelEntry } from './customModels';

export type ProviderId = 'copilot' | 'claude' | 'kiro' | 'generic' | 'custom';
export type PriorityEntry = ProviderId | `custom:${string}`;

/** Provider ids that map to exactly one built-in provider instance. */
export const BUILTIN_PROVIDER_IDS: ProviderId[] = ['copilot', 'claude', 'kiro', 'generic'];

export const CUSTOM_REF_PREFIX = 'custom:';

/** The token that refers to one specific custom model entry. */
export function customRefFor(entryId: string): PriorityEntry {
  return `${CUSTOM_REF_PREFIX}${entryId}` as PriorityEntry;
}

/** The CustomModelEntry.id a "custom:<id>" token points at, or null. */
export function customRefId(token: string): string | null {
  if (typeof token !== 'string' || !token.startsWith(CUSTOM_REF_PREFIX)) {
    return null;
  }
  const id = token.slice(CUSTOM_REF_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/** Whether a token is a syntactically valid priority entry. */
export function isValidPriorityEntry(token: unknown): token is PriorityEntry {
  if (typeof token !== 'string') {
    return false;
  }
  return (
    token === 'custom' ||
    (BUILTIN_PROVIDER_IDS as string[]).includes(token) ||
    customRefId(token) !== null
  );
}

export type ResolvedProvider =
  | { kind: 'builtin'; id: ProviderId }
  | { kind: 'custom'; entry: CustomModelEntry };

/**
 * Expands the configured priority list into the concrete, ordered list of
 * providers to try.
 *
 * - "custom:<id>" resolves to that entry; a reference to an entry that no longer
 *   exists is dropped, since a stale ref left behind by a deleted model must not
 *   abort the rest of the order.
 * - bare "custom" expands to every entry not individually referenced anywhere in
 *   the list, in the setting's own order.
 * - a custom model is emitted at most once even if referenced twice - a repeat
 *   would not change the try order (it is fully tried or skipped the first time
 *   it is reached), it would only show up as a confusing duplicate.
 */
export function expandPriority(
  priority: readonly PriorityEntry[],
  entries: readonly CustomModelEntry[]
): ResolvedProvider[] {
  const explicitlyReferenced = new Set(
    priority.map((token) => customRefId(token)).filter((id): id is string => id !== null)
  );

  const resolved: ResolvedProvider[] = [];
  const emittedCustomIds = new Set<string>();

  const pushCustom = (entry: CustomModelEntry) => {
    if (emittedCustomIds.has(entry.id)) {
      return;
    }
    emittedCustomIds.add(entry.id);
    resolved.push({ kind: 'custom', entry });
  };

  for (const token of priority) {
    if (token === 'custom') {
      for (const entry of entries) {
        if (!explicitlyReferenced.has(entry.id)) {
          pushCustom(entry);
        }
      }
      continue;
    }

    const refId = customRefId(token);
    if (refId !== null) {
      const entry = entries.find((candidate) => candidate.id === refId);
      if (entry) {
        pushCustom(entry);
      }
      continue;
    }

    resolved.push({ kind: 'builtin', id: token as ProviderId });
  }

  return resolved;
}

/**
 * Sanitizes a priority list the editor posted back: keeps only well-formed
 * tokens, drops "custom:<id>" references to models that do not exist, and
 * collapses duplicates. It never *adds* anything - the editor is the authority
 * on which providers the user chose to leave out of the order, and silently
 * re-adding an excluded one would undo that choice on every save.
 */
export function filterPriorityTokens(
  tokens: readonly unknown[],
  entries: readonly CustomModelEntry[]
): PriorityEntry[] {
  const known = new Set(entries.map((entry) => entry.id));
  const result: PriorityEntry[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (!isValidPriorityEntry(token)) {
      continue;
    }
    const refId = customRefId(token);
    if (refId !== null && !known.has(refId)) {
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }

  return result;
}

/** One row of the priority list as the editor shows it. */
export interface PriorityRow {
  token: PriorityEntry;
  label: string;
  kind: 'builtin' | 'custom';
  /** Whether the row is in the priority list at all - an excluded provider is
   * never tried, which is how a provider gets turned off entirely. */
  included: boolean;
  /** Custom rows only: mirrors CustomModelEntry.enabled, since an included but
   * disabled entry is still skipped when providers are resolved. */
  enabled?: boolean;
}

/**
 * Builds the full set of rows for the editor: every provider that could be
 * tried, in configured order, followed by the ones currently left out. Excluded
 * providers are shown rather than hidden, so a provider removed from the order
 * can be put back without hand-editing settings.json - which was the only way it
 * could be done before.
 */
export function describePriority(
  priority: readonly PriorityEntry[],
  entries: readonly CustomModelEntry[]
): PriorityRow[] {
  const label = (entry: CustomModelEntry) =>
    entry.name?.trim() || entry.modelName?.trim() || entry.baseUrl?.trim() || entry.id;

  const rows: PriorityRow[] = [];
  const includedBuiltins = new Set<string>();
  const includedCustomIds = new Set<string>();

  for (const resolved of expandPriority(priority, entries)) {
    if (resolved.kind === 'builtin') {
      if (includedBuiltins.has(resolved.id)) {
        continue;
      }
      includedBuiltins.add(resolved.id);
      rows.push({
        token: resolved.id,
        label: BUILTIN_LABELS[resolved.id] ?? resolved.id,
        kind: 'builtin',
        included: true,
      });
    } else {
      includedCustomIds.add(resolved.entry.id);
      rows.push({
        token: customRefFor(resolved.entry.id),
        label: label(resolved.entry),
        kind: 'custom',
        included: true,
        enabled: resolved.entry.enabled,
      });
    }
  }

  for (const id of BUILTIN_PROVIDER_IDS) {
    if (!includedBuiltins.has(id)) {
      rows.push({ token: id, label: BUILTIN_LABELS[id] ?? id, kind: 'builtin', included: false });
    }
  }

  for (const entry of entries) {
    if (!includedCustomIds.has(entry.id)) {
      rows.push({
        token: customRefFor(entry.id),
        label: label(entry),
        kind: 'custom',
        included: false,
        enabled: entry.enabled,
      });
    }
  }

  return rows;
}

const BUILTIN_LABELS: Record<string, string> = {
  copilot: 'GitHub Copilot',
  claude: 'Claude (VS Code language model)',
  kiro: 'Kiro',
  generic: 'Generic language model',
};
