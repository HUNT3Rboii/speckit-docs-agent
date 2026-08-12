/**
 * The two requests made against a custom endpoint that are not a document
 * transform: listing what it serves, and proving it will actually answer.
 *
 * No `vscode` import, so both are unit-testable. Both throw a descriptive error
 * on any failure rather than returning a best-effort empty result: each is a
 * direct user-initiated action, and the caller shows what happened.
 */

/**
 * Fetches the model ids at `GET {baseUrl}/models`.
 *
 * This exists so a model name can be picked from a list instead of guessed. A
 * guess produces a 404 with nothing useful in it - the real cause of a live "my
 * custom model isn't being used" report was a configured model name of
 * "ollama", the product, rather than a model id it serves.
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
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${describe(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GET ${url} returned HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
  }

  let payload: { data?: { id?: string }[] };
  try {
    payload = (await response.json()) as { data?: { id?: string }[] };
  } catch (error) {
    throw new Error(`GET ${url} did not return valid JSON: ${describe(error)}`);
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error(`GET ${url} did not return the expected {"data": [...]} shape`);
  }

  const ids = payload.data
    .map((entry) => entry?.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

  if (ids.length === 0) {
    throw new Error(`GET ${url} returned no usable model ids`);
  }

  return ids.sort();
}

/**
 * Sends one real, minimal chat completion - the same POST
 * `{baseUrl}/chat/completions` a document transform makes, with a throwaway
 * prompt and a tiny token budget.
 *
 * A `/models` probe proves far less than it appears to: a live Google AI Studio
 * endpoint listed its models happily while every actual generation came back
 * "403 PERMISSION_DENIED", so "Test connection" reported a provider healthy that
 * could not process a single document. Permission, quota, region and
 * wrong-model-id failures all live on this endpoint and nowhere else, so this is
 * the only probe whose success predicts a working transform.
 */
export async function probeChatCompletion(
  baseUrl: string,
  apiKey: string | undefined,
  modelName: string,
  timeoutMs = 45_000
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
        stream: false,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`POST ${url} timed out after ${Math.round(timeoutMs / 1000)}s (model: ${modelName})`);
    }
    throw new Error(`Could not reach ${url}: ${describe(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
  }

  let payload: { choices?: { message?: { content?: string } }[] };
  try {
    payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  } catch (error) {
    throw new Error(`POST ${url} did not return valid JSON: ${describe(error)}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'Response did not include the expected choices[0].message.content field - the endpoint answered, ' +
        'but not in the OpenAI chat-completions shape this provider requires'
    );
  }

  return content;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
