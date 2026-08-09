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

/**
 * Sends one real, minimal chat completion - the same POST
 * {baseUrl}/chat/completions call a document transform makes, just with a
 * throwaway prompt and a tiny token budget.
 *
 * This exists because a GET /models probe proves far less than it appears
 * to: a live Google AI Studio endpoint listed its models happily while
 * every actual generation came back "403 PERMISSION_DENIED - your project
 * has been denied access", so "Test connection" reported the provider
 * healthy and the failure only surfaced hours later, mid-transform, in the
 * log. Permission, quota, region and wrong-model-id failures all live on
 * this endpoint and nowhere else, so this is the only probe whose success
 * actually predicts a working transform.
 *
 * Throws a descriptive error on any failure, like discoverModels - the
 * caller is a user-initiated action that should show what happened.
 */
export async function probeChatCompletion(
  baseUrl: string,
  apiKey: string | undefined,
  modelName: string,
  timeoutMs: number = 45000
): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 16,
        stream: false
      }),
      signal: controller.signal
    });
  } catch (error: any) {
    if (controller.signal.aborted) {
      throw new Error(`POST ${url} timed out after ${Math.round(timeoutMs / 1000)}s (model: ${modelName})`);
    }
    throw new Error(`Could not reach ${url}: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${bodyText ? `: ${bodyText.slice(0, 500)}` : ''}`);
  }

  let body: any;
  try {
    body = await response.json();
  } catch (error: any) {
    throw new Error(`POST ${url} did not return valid JSON: ${error.message}`);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'Response did not include the expected choices[0].message.content field - the endpoint answered, ' +
        'but not in the OpenAI chat-completions shape this provider requires'
    );
  }

  return content;
}
