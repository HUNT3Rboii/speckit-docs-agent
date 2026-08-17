/**
 * Message contract between the extension host and the webview.
 *
 * Shared source, imported by both sides, because a change to either half that
 * the other does not know about is the failure this file exists to prevent.
 *
 * Traffic is bidirectional. The webview asks the host for data it has no
 * permission to reach; the host asks the webview to render mermaid, because the
 * webview is a browser and the host is not.
 */

export interface RequestMessage {
  kind: 'request';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface ResponseMessage {
  kind: 'response';
  id: number;
  result?: unknown;
  error?: string;
}

export interface EventMessage {
  kind: 'event';
  event: string;
  payload: Record<string, unknown>;
}

export type BridgeMessage = RequestMessage | ResponseMessage | EventMessage;

/** Webview -> host. */
export interface HostMethods {
  listDocuments: { params: Record<string, never>; result: { documents: DocumentEntry[] } };
  convertDocument: { params: { path: string }; result: ConvertOutcome };
  openPdf: { params: { path: string }; result: { opened: boolean } };
  readSettings: { params: Record<string, never>; result: SettingsSnapshot };
  updateSetting: { params: { key: EditableSetting; value: unknown }; result: SettingsSnapshot };
  runCommand: { params: { command: string }; result: { ran: boolean } };
  readPageImage: { params: { path: string }; result: { dataUri: string } };
  initialRoute: { params: Record<string, never>; result: { path: string | null } };
}

/**
 * The settings the dashboard's own settings page may write.
 *
 * An allowlist rather than "any colophon key": the webview is the
 * least trusted side of the bridge, and the try order is not here at all
 * because the AI models panel owns it.
 */
export const EDITABLE_SETTINGS = [
  'convertOnSave',
  'autoProcess',
  'enrich',
  'allowRuleBasedFallback',
  'enableDebugLogging',
  'debounceMs',
  'maxConcurrentProcessing',
  'preferredModelId',
] as const;

export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

/** One provider as the settings page lists it, in the order they are tried. */
export interface ProviderSummary {
  token: string;
  label: string;
  kind: 'builtin' | 'custom';
  included: boolean;
  enabled?: boolean;
}

export interface SettingsSnapshot {
  convertOnSave: boolean;
  autoProcess: boolean;
  enrich: boolean;
  allowRuleBasedFallback: boolean;
  enableDebugLogging: boolean;
  debounceMs: number;
  maxConcurrentProcessing: number;
  preferredModelId: string;
  /** Read-only here; edited in the AI models panel. */
  providers: ProviderSummary[];
  customModelCount: number;
}

/**
 * Commands the dashboard may run.
 *
 * Anything not on this list is refused, so a bug (or an injected script) in the
 * webview cannot reach `workbench.action.*` or any other extension's commands.
 */
export const WEBVIEW_COMMANDS = [
  'colophon.manageProviders',
  'colophon.discoverModels',
  'colophon.convertCurrentFile',
  'colophon.checkBackendStatus',
  'colophon.stopProcessing',
  'colophon.showLogs',
  'colophon.openNativeSettings',
] as const;

/** Host -> webview. Rendering needs a DOM, which only this side has. */
export interface WebviewMethods {
  renderMermaid: { params: { diagrams: MermaidRequest[] }; result: { rendered: MermaidResult[] } };
}

export interface DocumentEntry {
  path: string;
  label: string;
  directory: string;
}

export interface ConvertOutcome {
  pdfPath: string;
  warnings: string[];
  diagramCount: number;
  /** True when identical content already had a PDF, so nothing was rebuilt. */
  reused: boolean;
}

export interface MermaidRequest {
  id: string;
  code: string;
  title?: string;
}

export interface MermaidResult {
  id: string;
  svg?: string;
  error?: string;
  title?: string;
}

export const WEBVIEW_VIEW_TYPE = 'colophon.panel';
