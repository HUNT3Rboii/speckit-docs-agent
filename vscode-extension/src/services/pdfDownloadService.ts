/**
 * Fetching a generated PDF from the backend over HTTP.
 *
 * `pdf_location` in a backend response is a path on whatever machine ran the
 * backend. Under Docker that is a path inside the container
 * ("/tmp/doc-output/artifact-148-v2.pdf") which does not exist on the host, so
 * handing it to the OS only ever worked because the compose file happened to
 * bind-mount that exact path from the host too - a coincidence that holds on
 * one Windows machine and nowhere else.
 *
 * Downloading through the API works the same way for a containerised, local,
 * or remote backend, so nothing here depends on the two filesystems lining up.
 * Callers keep the old path-based open as a fallback, which is still the right
 * behaviour for a backend running directly on the user's machine.
 */

/** Matches the backend's PROCESS timeout characteristics - a PDF is a few
 * hundred KB, so this only ever trips on an unreachable backend. */
const DOWNLOAD_TIMEOUT_MS = 30000;

export function buildPdfUrl(backendUrl: string, versionId: string): string {
  const base = backendUrl.replace(/\/+$/, '');
  return `${base}/api/doc-versions/${encodeURIComponent(versionId)}/pdf`;
}

/**
 * Filename for the local copy. Version ids look like "version-148-2"; keeping
 * that shape makes the temp file recognisable, and the substitution keeps it
 * legal on every filesystem.
 */
export function pdfTempFileName(versionId: string): string {
  const safe = versionId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${safe}.pdf`;
}

/**
 * Download the PDF for a doc version. Throws with a readable message on any
 * non-2xx response, network failure, or timeout - callers treat that as "fall
 * back to the filesystem path" rather than as a hard error.
 */
export async function fetchPdf(
  backendUrl: string,
  apiKey: string,
  versionId: string,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS
): Promise<Uint8Array> {
  const url = buildPdfUrl(backendUrl, versionId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`backend returned ${response.status} for ${url}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms downloading ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
