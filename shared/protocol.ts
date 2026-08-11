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
}

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

export const WEBVIEW_VIEW_TYPE = 'speckitStandalone.panel';
