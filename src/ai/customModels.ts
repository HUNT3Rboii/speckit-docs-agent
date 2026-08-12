/**
 * The shape of a user-configured custom model, and the rules that decide
 * whether one is usable.
 *
 * Kept free of any `vscode` import so the validation is unit-testable: the
 * webview that collects the values and the settings write live in
 * webview/customModelsPanel.ts, which does import vscode.
 *
 * An entry is a base URL, not a full endpoint. Everything that talks to one
 * appends its own path - `/chat/completions` to generate, `/models` to
 * discover - so the two can never disagree about where the endpoint is.
 */

/** One user-configured OpenAI-compatible endpoint. */
export interface CustomModelEntry {
  /** Stable identifier, never shown to the user. Discovery and saving target
   * one specific entry by this rather than by array index (which shifts when
   * entries are reordered) or by name (which the user can duplicate). */
  id: string;
  enabled: boolean;
  /** Display name shown in logs, notifications and the try order. */
  name: string;
  /** Up to but not including `/chat/completions`, e.g. `http://localhost:11434/v1`. */
  baseUrl: string;
  /** Exactly as the endpoint expects it - the id from its own `/models` listing. */
  modelName: string;
  apiKey?: string;
  /** Whatever the last discovery run returned, so the picker has something to
   * show without going back to the network. */
  models?: string[];
  headers?: Record<string, string>;
}

/** One thing wrong with one entry, reported back to the form so it can be shown
 * next to the offending field instead of as a modal that loses the user's other
 * edits. */
export interface EntryValidationError {
  id: string;
  field: 'name' | 'baseUrl' | 'modelName';
  message: string;
}

export interface NormalizedEntries {
  entries: CustomModelEntry[];
  errors: EntryValidationError[];
}

/**
 * Trims a user-typed base URL into the form every caller expects: no trailing
 * slash, and no trailing `/chat/completions` (or `/models`) - those are
 * appended on use, so pasting a full endpoint URL out of a vendor's docs would
 * otherwise produce `.../chat/completions/chat/completions` and a 404 whose
 * cause is not visible anywhere in the settings.
 */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw ?? '').trim();
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|completions|models)$/i, '');
  return url.replace(/\/+$/, '');
}

/** A stable id for a newly added entry. Only has to be unique within the setting. */
export function generateEntryId(existing: readonly { id?: string }[] = []): string {
  const taken = new Set(existing.map((entry) => entry?.id).filter(Boolean));
  let candidate: string;
  do {
    candidate = `custom-${Math.random().toString(36).slice(2, 10)}`;
  } while (taken.has(candidate));
  return candidate;
}

/**
 * Reads one stored entry, whatever vintage it is.
 *
 * The first standalone build wrote `endpoint` (a full chat-completions URL)
 * and `model`. Those are still read - an extension update must not silently
 * stop using a provider the user already configured - and are folded onto the
 * current fields rather than kept as a second code path.
 */
export function readEntry(raw: unknown): CustomModelEntry | null {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!source) {
    return null;
  }

  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const baseUrl = normalizeBaseUrl(text(source.baseUrl) || text(source.endpoint));
  if (!baseUrl) {
    return null;
  }

  const models = Array.isArray(source.models)
    ? source.models.filter((model): model is string => typeof model === 'string')
    : undefined;

  return {
    id: text(source.id) || generateEntryId(),
    enabled: Boolean(source.enabled),
    name: text(source.name) || text(source.label) || baseUrl,
    baseUrl,
    modelName: text(source.modelName) || text(source.model),
    apiKey: text(source.apiKey) || undefined,
    ...(models ? { models } : {}),
    ...(source.headers && typeof source.headers === 'object'
      ? { headers: source.headers as Record<string, string> }
      : {}),
  };
}

/**
 * Validates and normalizes the raw rows the editor webview posted back, before
 * they are written to settings.
 *
 * Rules, all of them the cause of a real "my custom model isn't used" failure
 * that settings.json alone gives no feedback on:
 * - baseUrl is required, must parse as an http(s) URL, and is normalized.
 * - modelName is required *for enabled entries only* - a half-filled disabled
 *   draft is allowed to be saved so work is not lost, since a disabled entry is
 *   never tried.
 * - ids are backfilled and de-duplicated, so discovery and saving can always
 *   target exactly one row.
 *
 * Invalid entries are still returned in `entries`, so the form can render them
 * back verbatim rather than silently dropping the user's typing; the caller
 * decides not to persist when `errors` is non-empty.
 */
export function normalizeEntriesForSave(raw: unknown): NormalizedEntries {
  const rows = Array.isArray(raw) ? raw : [];
  const errors: EntryValidationError[] = [];
  const seenIds = new Set<string>();

  const entries = rows.map((row: unknown, index: number) => {
    const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

    let id = text(source.id);
    if (!id || seenIds.has(id)) {
      id = generateEntryId([...seenIds].map((value) => ({ id: value })));
    }
    seenIds.add(id);

    const enabled = Boolean(source.enabled);
    const name = text(source.name);
    const baseUrl = normalizeBaseUrl(typeof source.baseUrl === 'string' ? source.baseUrl : '');
    const modelName = text(source.modelName);
    const apiKey = text(source.apiKey);
    const models = Array.isArray(source.models)
      ? source.models.filter((model): model is string => typeof model === 'string')
      : undefined;

    if (!baseUrl) {
      errors.push({ id, field: 'baseUrl', message: 'Base URL is required.' });
    } else if (!isHttpUrl(baseUrl)) {
      errors.push({
        id,
        field: 'baseUrl',
        message: 'Base URL must be a full http:// or https:// URL, e.g. http://localhost:11434/v1',
      });
    }

    if (enabled && !modelName) {
      errors.push({
        id,
        field: 'modelName',
        message:
          'Model name is required to enable this provider - use Discover to list what the endpoint supports.',
      });
    }

    return {
      id,
      enabled,
      name: name || `Custom model ${index + 1}`,
      baseUrl,
      apiKey,
      modelName,
      ...(models ? { models } : {}),
      ...(source.headers && typeof source.headers === 'object'
        ? { headers: source.headers as Record<string, string> }
        : {}),
    } as CustomModelEntry;
  });

  return { entries, errors };
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Turns a raw endpoint failure into the next thing to actually try.
 *
 * The raw message (an HTTP status plus the server's own body) is always shown
 * as-is; this only adds a line of interpretation, because the statuses that
 * matter here are routinely misread. Google AI Studio is the worst offender and
 * gets its own cases: it answers a keyless request with 404 rather than 401, and
 * a blocked project with 403 "PERMISSION_DENIED" that says nothing about which
 * of region, disabled API or key restrictions caused it.
 *
 * Returns null when the message carries no recognisable signal - a wrong guess
 * is worse than no hint.
 */
export function diagnoseEndpointError(baseUrl: string, message: string): string | null {
  const text = message ?? '';
  const isGoogle = /generativelanguage\.googleapis\.com/i.test(baseUrl);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(baseUrl);

  if (/Could not reach/i.test(text)) {
    return isLocal
      ? 'Nothing is listening on that address. Start the local server (for Ollama: "ollama serve") and check the port.'
      : 'The host could not be reached at all - check the URL, your network, and any proxy or firewall.';
  }

  if (/timed out/i.test(text)) {
    return 'The endpoint accepted the connection but did not answer in time. A cloud endpoint may be cold-starting - try again once.';
  }

  if (/HTTP 401/.test(text)) {
    return 'The endpoint rejected the credentials. Check the API key, and that this endpoint expects it as "Authorization: Bearer <key>".';
  }

  if (/HTTP 403/.test(text)) {
    return isGoogle
      ? 'Google blocked the project behind this API key, not the request itself. Usual causes, in order: the Gemini API is not served in your region (a VPN triggers this too), the Generative Language API is not enabled on that key\'s project, or the key has HTTP-referrer/IP restrictions. A key from a fresh project is the fastest way to tell them apart.'
      : 'The endpoint understood the request and refused it - the key is recognised but not permitted to use this model or endpoint (plan, quota or per-key restrictions).';
  }

  if (/HTTP 404/.test(text)) {
    return isGoogle
      ? 'Google answers 404 both for a wrong path and for a request carrying no API key. Base URL must be exactly https://generativelanguage.googleapis.com/v1beta/openai, and the API key field must be filled in.'
      : 'The path does not exist on this host. Base URL usually ends at the version prefix (e.g. /v1), with no /chat/completions.';
  }

  if (/HTTP 429/.test(text)) {
    return 'Rate limit or quota exhausted on this key - the configuration is fine, the account is not.';
  }

  if (/HTTP 5\d\d/.test(text)) {
    return 'The endpoint itself failed. Nothing to fix in this configuration; retry, and check the server\'s own logs if it is yours.';
  }

  if (/Please pass a valid API key/i.test(text)) {
    return 'The key reached Google but was not accepted - copy it again from aistudio.google.com/apikey.';
  }

  return null;
}
