/**
 * Transform Pipeline Orchestration
 * Coordinates the complete agentic-pipeline workflow from markdown to PDF:
 * AI enrichment -> backend evidence-grounding validation -> (client-driven
 * retry loop on validation failure) -> PDF.
 */

import * as vscode from 'vscode';
import {
  TransformPipeline as ITransformPipeline,
  ProcessResult,
  StructuredJSON,
  StructuredError,
  ProcessResponse
} from '../types';
import * as path from 'path';
import { AIProviderFactory } from './aiProviderFactory';
import { JSONParser } from './jsonParser';
import { BackendClient } from './backendClient';
import { NotificationService } from './notificationService';
import { ContentHashService } from './contentHashService';
import { ProjectFrameworkDetector } from './projectFrameworkDetector';
import { DiagramCoverageChecker } from './diagramCoverageChecker';

/**
 * Safety cap on client-side correction attempts. The backend's own
 * RetryLoopOrchestrator (max_retries=2) guarantees a terminal "ok" response
 * (possibly with dropped items) well before this is reached; it exists only
 * to prevent an infinite loop if that guarantee is ever violated.
 */
const MAX_CLIENT_CORRECTION_ATTEMPTS = 5;

/**
 * Orchestrates the complete transformation pipeline
 */
export class TransformPipeline implements ITransformPipeline {
  private aiFactory: AIProviderFactory;
  private jsonParser: JSONParser;
  private backendClient: BackendClient;
  private notificationService: NotificationService;
  private contentHashService: ContentHashService;
  private projectFrameworkDetector: ProjectFrameworkDetector;
  private diagramCoverageChecker: DiagramCoverageChecker;
  private processingQueue: Map<string, Promise<ProcessResult>>;
  private contentCache: Map<string, string>;
  private maxConcurrent: number;

  constructor(
    aiFactory: AIProviderFactory,
    jsonParser: JSONParser,
    backendClient: BackendClient,
    notificationService: NotificationService,
    maxConcurrent: number = 3,
    contentHashService: ContentHashService = new ContentHashService(),
    projectFrameworkDetector: ProjectFrameworkDetector = new ProjectFrameworkDetector(),
    diagramCoverageChecker: DiagramCoverageChecker = new DiagramCoverageChecker()
  ) {
    this.aiFactory = aiFactory;
    this.jsonParser = jsonParser;
    this.backendClient = backendClient;
    this.notificationService = notificationService;
    this.contentHashService = contentHashService;
    this.projectFrameworkDetector = projectFrameworkDetector;
    this.diagramCoverageChecker = diagramCoverageChecker;
    this.processingQueue = new Map();
    this.contentCache = new Map();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Process a markdown file through complete pipeline
   */
  public async process(fileUri: vscode.Uri): Promise<ProcessResult> {
    const filePath = fileUri.fsPath;

    // Check if already processing
    const existingProcess = this.processingQueue.get(filePath);
    if (existingProcess) {
      this.notificationService.info(`Already processing: ${filePath}`);
      return existingProcess;
    }

    // Wait if too many concurrent processes
    await this.waitForCapacity();

    // Create processing promise
    const processPromise = this.executeProcess(fileUri);

    // Add to queue
    this.processingQueue.set(filePath, processPromise);

    // Remove from queue when done
    processPromise.finally(() => {
      this.processingQueue.delete(filePath);
    });

    return processPromise;
  }

  /**
   * Execute the complete processing workflow
   */
  private async executeProcess(fileUri: vscode.Uri): Promise<ProcessResult> {
    const fileName = fileUri.fsPath.split(/[/\\]/).pop() || 'unknown';

    try {
      this.notificationService.processing(fileName);

      // Step 1: Read file content
      this.notificationService.info(`Reading file: ${fileUri.fsPath}`);
      const content = await this.readFile(fileUri);

      // Step 2: Check for duplicate content (Requirement 1.1/1.4 - compute
      // hash and skip before ever invoking the AI).
      if (this.isDuplicate(fileUri, content)) {
        this.notificationService.info(`Skipping duplicate: ${fileName}`);
        return { success: true, skipped: true };
      }

      const sourcePath = vscode.workspace.asRelativePath(fileUri);
      const projectId = this.extractProjectId(sourcePath);
      const { projectRoot, authoringFramework } = await this.detectProvenance(fileUri);

      const { response, provider } = await this.transformValidateAndSubmit(
        content,
        fileUri,
        sourcePath,
        projectId,
        fileName,
        projectRoot,
        authoringFramework
      );

      if (response.status === 'retry_needed') {
        // The backend's own retry budget is exhausted from the client's
        // perspective (MAX_CLIENT_CORRECTION_ATTEMPTS hit) without ever
        // reaching a terminal "ok" - surface this as an error rather than
        // silently giving up.
        throw new Error(
          `Validation did not resolve after ${MAX_CLIENT_CORRECTION_ATTEMPTS} attempts: ` +
            JSON.stringify(response.structured_error?.errors ?? {})
        );
      }

      // Step: Update cache with successful content
      this.updateCache(fileUri, content);

      if (response.partial) {
        this.notificationService.partial?.(response);
      } else {
        this.notificationService.success({
          status: response.status,
          artifact_id: Number(response.artifact_id) || 0,
          pdf_location: response.pdf_location || '',
          version: response.version?.version_no ?? 0,
          skipped: response.skipped
        });
      }

      return {
        success: true,
        pdfLocation: response.pdf_location,
        provider,
        partial: response.partial,
        droppedItems: response.dropped_items
      };
    } catch (error: any) {
      this.notificationService.error(error);

      return {
        success: false,
        error: error
      };
    }
  }

  /**
   * Runs the AI-transform -> validate -> submit-to-backend cycle, resubmitting
   * with a correction prompt whenever the backend responds "retry_needed".
   * The backend guarantees termination within its own max_retries (2); the
   * attempt cap here is a defensive backstop only.
   */
  private async transformValidateAndSubmit(
    content: string,
    fileUri: vscode.Uri,
    sourcePath: string,
    projectId: string,
    fileName: string,
    projectRoot: string,
    authoringFramework: string
  ): Promise<{ response: ProcessResponse; provider: string }> {
    let structuredError: StructuredError | undefined;
    let retryCount = 0;
    let provider = '';
    let triedDiagramGapFill = false;

    for (let attempt = 1; attempt <= MAX_CLIENT_CORRECTION_ATTEMPTS; attempt++) {
      this.notificationService.info(
        structuredError
          ? `Correcting and resubmitting (retry ${retryCount}): ${fileName}`
          : `Transforming with AI: ${fileName}`
      );
      const { result: enrichedJson, provider: usedProvider } = await this.transformWithAI(
        content,
        fileUri,
        structuredError
      );
      provider = usedProvider;

      this.notificationService.info(`Validating JSON: ${fileName}`);
      let validated = this.jsonParser.parseAndValidate(
        typeof enrichedJson === 'string' ? enrichedJson : JSON.stringify(enrichedJson)
      );

      // AI generation is non-deterministic: a section that clearly warrants
      // a diagram (per heading alone) sometimes gets skipped anyway,
      // especially with smaller models. This is orthogonal to the backend's
      // own evidence-grounding retry loop below, so it's checked once,
      // before ever hitting the backend, rather than folded into that loop.
      if (!triedDiagramGapFill) {
        triedDiagramGapFill = true;
        const gaps = this.diagramCoverageChecker.findGaps(validated.sections, validated.diagrams);
        if (gaps.length > 0) {
          this.notificationService.info(
            `Filling ${gaps.length} missing diagram(s) (${gaps.map(g => g.heading).join(', ')}): ${fileName}`
          );
          const gapFillError: StructuredError = {
            valid: false,
            retry_count: 0,
            errors: { missing_diagrams: gaps.map(g => g.heading) },
            warnings: []
          };
          const { result: filledJson, provider: filledProvider } = await this.transformWithAI(
            content,
            fileUri,
            gapFillError
          );
          provider = filledProvider;
          validated = this.jsonParser.parseAndValidate(
            typeof filledJson === 'string' ? filledJson : JSON.stringify(filledJson)
          );
        }
      }

      this.notificationService.info(`Sending to backend: ${fileName}`);
      const response = await this.backendClient.process({
        project_id: projectId,
        source_path: sourcePath,
        source_markdown: content,
        enriched_json: validated,
        retry_count: retryCount,
        project_root: projectRoot,
        authoring_framework: authoringFramework,
        model_used: provider
      });

      if (response.status === 'retry_needed' && response.structured_error) {
        structuredError = response.structured_error;
        retryCount += 1;
        continue;
      }

      return { response, provider };
    }

    // Attempt cap reached without a terminal response.
    return {
      response: {
        status: 'retry_needed',
        structured_error: structuredError,
        retry_count: retryCount
      },
      provider
    };
  }

  /**
   * Read file content
   */
  private async readFile(fileUri: vscode.Uri): Promise<string> {
    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      return Buffer.from(content).toString('utf8');
    } catch (error: any) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Transform markdown with AI using fallback chain. If `structuredError` is
   * set, the currently-active provider is asked to correct only the flagged
   * items rather than re-transforming from scratch.
   */
  private async transformWithAI(
    markdown: string,
    fileUri: vscode.Uri,
    structuredError?: StructuredError
  ): Promise<{
    result: StructuredJSON;
    provider: string;
  }> {
    try {
      const sourcePath = vscode.workspace.asRelativePath(fileUri);
      return await this.aiFactory.transformWithFallback(markdown, sourcePath, structuredError);
    } catch (error: any) {
      throw new Error(`AI transformation failed: ${error.message}`);
    }
  }

  /**
   * Check if content is duplicate of the last successfully-processed version
   */
  private isDuplicate(fileUri: vscode.Uri, content: string): boolean {
    const hash = this.contentHashService.computeHash(content);
    const cachedHash = this.contentCache.get(fileUri.fsPath);
    return !!cachedHash && this.contentHashService.compareHashes(hash, cachedHash);
  }

  /**
   * Update content cache
   */
  private updateCache(fileUri: vscode.Uri, content: string): void {
    const hash = this.contentHashService.computeHash(content);
    this.contentCache.set(fileUri.fsPath, hash);
  }

  /**
   * Wait for processing capacity
   */
  private async waitForCapacity(): Promise<void> {
    while (this.processingQueue.size >= this.maxConcurrent) {
      // Wait for any process to complete
      await Promise.race(Array.from(this.processingQueue.values()));
      // Small delay to prevent tight loop
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Detect the workspace root folder name and authoring framework for a
   * file, for provenance metadata on the generated PDF. Uses
   * getWorkspaceFolder() (not workspaceFolders[0]) so this resolves
   * correctly in multi-root workspaces.
   */
  private async detectProvenance(
    fileUri: vscode.Uri
  ): Promise<{ projectRoot: string; authoringFramework: string }> {
    const folder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!folder) {
      return { projectRoot: 'default-project', authoringFramework: 'manual' };
    }

    const projectRoot = path.basename(folder.uri.fsPath);
    const frameworks = await this.projectFrameworkDetector.detect(folder.uri.fsPath);
    const authoringFramework = this.projectFrameworkDetector.formatLabel(frameworks);

    return { projectRoot, authoringFramework };
  }

  /**
   * Extract project ID from source path
   */
  private extractProjectId(sourcePath: string): string {
    const parts = sourcePath.split(/[/\\]/);
    const projectName = parts.length > 1 ? parts[0] : parts[parts.length - 1].replace('.md', '');
    return projectName || 'default-project';
  }

  /**
   * Clear content cache
   */
  public clearCache(): void {
    this.contentCache.clear();
  }

  /**
   * Get current queue size
   */
  public getQueueSize(): number {
    return this.processingQueue.size;
  }

  /**
   * Update max concurrent setting
   */
  public setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(10, max));
  }
}
