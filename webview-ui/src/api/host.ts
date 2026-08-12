import type { EditableSetting, SettingsSnapshot } from '../../../shared/protocol';
import { request } from '../bridge';

/**
 * The calls that reach the editor rather than the database.
 *
 * Separate from api/client.ts: that one is the dashboard's data, forwarded to
 * Python, and every method there has a table behind it. These four are answered
 * by the extension host itself, because settings, commands and which page to
 * show are things only the editor knows.
 */

export function readSettings(): Promise<SettingsSnapshot> {
  return request<SettingsSnapshot>('readSettings');
}

/**
 * Writes one setting and returns the whole snapshot back.
 *
 * Returning the new state rather than nothing is what keeps the page honest: a
 * setting the host refuses, or normalises, shows up immediately instead of the
 * form claiming a value that was never stored.
 */
export function updateSetting(key: EditableSetting, value: unknown): Promise<SettingsSnapshot> {
  return request<SettingsSnapshot>('updateSetting', { key, value });
}

/**
 * A rendered page as a `data:` URI, read by the host.
 *
 * The fallback for when `asWebviewUri` produces something the webview then
 * declines to load - which it does silently, leaving a broken image and nothing
 * in the console. Only paths inside the extension's own storage are served.
 */
export async function readPageImage(path: string): Promise<string> {
  const { dataUri } = await request<{ dataUri: string }>('readPageImage', { path });
  return dataUri;
}

/** Runs one of the extension's own commands. The host refuses anything else. */
export function runCommand(command: string): Promise<{ ran: boolean }> {
  return request<{ ran: boolean }>('runCommand', { command });
}

/**
 * The page the host wants shown, if it opened this panel to reach one.
 *
 * Asked for on mount rather than pushed at creation time: a route sent while
 * the bundle is still loading has nobody listening for it.
 */
export function initialRoute(): Promise<{ path: string | null }> {
  return request<{ path: string | null }>('initialRoute');
}
