/**
 * Model discovery for OpenAI-compatible custom endpoints.
 *
 * Pure fetch-based logic (no vscode import) so it's fully unit-testable -
 * same rationale as customModelProvider.ts's own docstring. The command
 * that actually drives this (vscode QuickPicks, persisting the result back
 * into settings) lives in extension.ts, which does import vscode and is
 * untestable under this project's Jest config for that reason.
 */

/**
 * Fetches the list of model ids available at an OpenAI-compatible
 * endpoint's GET {baseUrl}/models listing. Used by "Speckit: Discover
 * Models for Custom Provider" to let a user pick a real, valid model id
 * instead of typing one by hand and only finding out it's wrong once an
 * actual transform request fails (the actual root cause of a live "my
 * custom model isn't being used" report - the configured modelName was
 * the product name "ollama", not a real model id).
 *
 * Throws a descriptive error on any failure (network, non-2xx, or an
 * unexpected response shape) - unlike CustomModelProvider's own
 * best-effort conventions, this is a direct user-initiated action, so the
 * caller should show the failure, not silently swallow it.
 */
export async function discoverModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch (error: any) {
    throw new Error(`Could not reach ${url}: ${error.message}`);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`GET ${url} returned HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`);
  }

  let body: any;
  try {
    body = await response.json();
  } catch (error: any) {
    throw new Error(`GET ${url} did not return valid JSON: ${error.message}`);
  }

  const data = body?.data;
  if (!Array.isArray(data)) {
    throw new Error(`GET ${url} did not return the expected {"data": [...]} shape`);
  }

  const ids = data
    .map((entry: any) => entry?.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);

  if (ids.length === 0) {
    throw new Error(`GET ${url} returned no usable model ids`);
  }

  return ids;
}
