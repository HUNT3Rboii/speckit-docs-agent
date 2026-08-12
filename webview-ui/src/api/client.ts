import type {
  Artifact,
  ArtifactStatusResponse,
  AutomationMode,
  KanbanBoardStatus,
  KanbanTask,
  ProcessingException,
  Project,
  ProjectFile,
  Version,
} from '../types/api';
import { request } from '../bridge';

/**
 * The dashboard's API client, over the extension bridge.
 *
 * Same class, same method names, same return types as the HTTP version - every
 * hook and page above it is unchanged. What differs is underneath: instead of
 * `axios` to `localhost:8000` with a bearer token, each call is a `postMessage`
 * to the extension host, which forwards it to the Python process.
 *
 * That is not a stylistic choice. A webview has no network permission under our
 * CSP, and direct localhost access breaks outright in Remote SSH and
 * Codespaces, where the webview and the extension host are on different
 * machines.
 */

/** One rendered page: where it lives, and the URI the panel should try first. */
export interface PagePreview {
  path: string;
  uri: string;
}

export class APIError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 0, details?: unknown) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

async function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    return await request<T>(method, params);
  } catch (error) {
    // Errors arrive as plain strings across postMessage - the structure of an
    // Error does not survive the boundary - so they are rebuilt here into the
    // type the UI's error handling already expects.
    throw new APIError(error instanceof Error ? error.message : String(error));
  }
}

export class APIClient {
  /**
   * The HTTP client took a base URL and an API key. Both are accepted and
   * ignored so every call site stays as it was: there is no server to address
   * and no port to guard - the backend is a child process of this editor.
   */
  constructor(_baseUrl?: string, _apiKey?: string) {}

  /**
   * The project the panel is looking at.
   *
   * The HTTP backend served many workspaces at once and took a project id in
   * every URL. Here there is exactly one editor window, so the host supplies
   * its workspace and the id is filled in for calls that need one.
   */
  private projectId = '';

  setProject(projectId: string): void {
    this.projectId = projectId;
  }

  async getProjects(): Promise<Project[]> {
    const { projects } = await call<{ projects: Project[] }>('listProjects');
    return projects;
  }

  async getArtifacts(projectId: string): Promise<Artifact[]> {
    const { artifacts } = await call<{ artifacts: Artifact[] }>('listArtifacts', { projectId });
    return artifacts;
  }

  async getVersions(artifactId: string): Promise<Version[]> {
    const { versions } = await call<{ versions: Version[] }>('listVersions', { artifactId });
    return versions;
  }

  async getArtifactStatus(artifactId: string): Promise<ArtifactStatusResponse> {
    return call<ArtifactStatusResponse>('artifactStatus', { artifactId });
  }

  async getExceptions(projectId: string): Promise<ProcessingException[]> {
    const { exceptions } = await call<{ exceptions: ProcessingException[] }>('listExceptions', { projectId });
    return exceptions;
  }

  async addException(projectId: string, sourcePath: string): Promise<ProcessingException> {
    return call<ProcessingException>('addException', { projectId, sourcePath });
  }

  async removeException(projectId: string, exceptionId: number): Promise<void> {
    await call('removeException', { projectId, exceptionId });
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const { files } = await call<{ files: ProjectFile[] }>('listFiles', { projectId });
    return files;
  }

  /** Queued, not converted: the extension picks the request up on its own. */
  async requestFileTransform(projectId: string, sourcePath: string): Promise<ProjectFile> {
    return call<ProjectFile>('requestTransform', { projectId, sourcePath });
  }

  async setAutomationMode(projectId: string, mode: AutomationMode): Promise<Project> {
    return call<Project>('setAutomationMode', { projectId, mode });
  }

  async getKanbanTasks(projectId: string): Promise<KanbanTask[]> {
    const { tasks } = await call<{ tasks: KanbanTask[] }>('listTasks', { projectId });
    return tasks;
  }

  async updateKanbanTaskStatus(
    taskId: number,
    boardStatus: KanbanBoardStatus,
    phase?: string,
    phaseOrder?: number
  ): Promise<KanbanTask> {
    return call<KanbanTask>('setTaskStatus', {
      taskId,
      boardStatus,
      ...(phase !== undefined ? { phase } : {}),
      ...(phaseOrder !== undefined ? { phaseOrder } : {}),
    });
  }

  async setArtifactTags(artifactId: string, tags: string[]): Promise<string[]> {
    const artifact = await call<Artifact>('setTags', { artifactId, tags });
    return artifact.tags ?? [];
  }

  async cancelArtifact(artifactId: string): Promise<void> {
    await call('cancelArtifact', { artifactId });
  }

  async retryArtifact(artifactId: string): Promise<void> {
    await call('retryArtifact', { artifactId, projectId: this.projectId });
  }

  async downloadPDF(versionId: string): Promise<Blob> {
    const { base64 } = await call<{ base64: string }>('readVersionPdf', { versionId });
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: 'application/pdf' });
  }

  /**
   * Open a version's PDF.
   *
   * The HTTP client returned a Blob to hand to an object URL. Here the file is
   * on the same machine as the editor, so the host opens it directly - a
   * multi-megabyte payload does not need to cross a JSON message channel to be
   * shown.
   */
  async openVersionPdf(versionId: string): Promise<string> {
    const { pdfPath } = await call<{ pdfPath: string }>('versionPdf', { versionId });
    await call('openPdf', { path: pdfPath });
    return pdfPath;
  }

  /**
   * The document's pages, as images the panel can display.
   *
   * A webview will not render a PDF: the embedded viewer is a browser plugin
   * and there is not one inside a webview, which is why `<object>` fell through
   * to its "unable to display" branch. Typst renders the same document to PNG
   * at build time, and images a webview handles perfectly well.
   */
  async getVersionPages(versionId: string): Promise<PagePreview[]> {
    const { pages } = await call<{ pages: string[] }>('versionPages', { versionId });
    if (!pages.length) {
      return [];
    }
    const { uris } = await call<{ uris: string[] }>('toWebviewUris', { paths: pages });
    // The path travels with the URI: a webview that refuses a rewritten local
    // resource does so silently, and the path is what the fallback needs to ask
    // the host for the bytes instead.
    return pages.map((path, index) => ({ path, uri: uris[index] }));
  }

  /**
   * A URI the panel may actually load a PDF from.
   *
   * Webviews cannot read files by path - the host rewrites it - and there is no
   * server to fetch from any more, so this replaces the old
   * `/api/doc-versions/{id}/pdf?api_key=...` URL.
   */
  async getVersionPdfUri(versionId: string): Promise<string | null> {
    const { pdfPath, exists } = await this.getVersionPdfPath(versionId);
    if (!exists) {
      return null;
    }
    const { uri } = await call<{ uri: string }>('pdfUri', { path: pdfPath });
    return uri;
  }

  /** Where a version's PDF lives, for rendering it inside the panel. */
  async getVersionPdfPath(versionId: string): Promise<{ pdfPath: string; exists: boolean }> {
    return call<{ pdfPath: string; exists: boolean }>('versionPdf', { versionId });
  }
}

export const apiClient = new APIClient();
export default apiClient;
