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
import { CancellationRequestedError } from './aiProvider';
import { mergeSectionContent } from './markdownSectionParser';

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
  /** One cancellation source per in-flight file, keyed by its fsPath - lets
   * speckit.stopProcessing (and the status bar item) cancel a specific file
   * or everything currently running. */
  private cancellationSources: Map<string, vscode.CancellationTokenSource>;

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
    this.cancellationSources = new Map();
  }

  /**
   * Cancel one in-flight file's processing, or every currently in-flight
   * file if no path is given. Returns how many were actually cancelled (0
   * if the given path isn't currently processing, or nothing is).
   */
  public stopProcessing(filePath?: string): number {
    if (filePath) {
      const source = this.cancellationSources.get(filePath);
      if (!source) {
        return 0;
      }
      source.cancel();
      return 1;
    }

    let count = 0;
    for (const source of this.cancellationSources.values()) {
      source.cancel();
      count++;
    }
    return count;
  }

  /**
   * Files currently being processed (readable file paths, for a status
   * bar item / stop-picker to show what's actually running).
   */
  public getActiveFiles(): string[] {
    return Array.from(this.cancellationSources.keys());
  }

  /**
   * Process a markdown file through complete pipeline.
   *
   * `force` (used by the retry-poll loop - see extension.ts) bypasses both
   * layers of unchanged-content dedup (this class's own contentCache check,
   * and the backend's content_hash-based skip) - a manual Retry resubmits
   * the exact same, unchanged file on purpose, which is precisely the case
   * that dedup exists to short-circuit for a normal file-watcher save.
   * Without this, Retry silently no-ops on the overwhelmingly common case
   * (the file hasn't changed since it last rendered), which is exactly
   * what "the Retry button doesn't do anything" turned out to be.
   */
  public async process(fileUri: vscode.Uri, options?: { force?: boolean }): Promise<ProcessResult> {
    const filePath = fileUri.fsPath;

    // Check if already processing
    const existingProcess = this.processingQueue.get(filePath);
    if (existingProcess) {
      this.notificationService.info(`Already processing: ${filePath}`);
      return existingProcess;
    }

    // Wait if too many concurrent processes
    await this.waitForCapacity();

    const cancellationSource = new vscode.CancellationTokenSource();
    this.cancellationSources.set(filePath, cancellationSource);

    // Create processing promise
    const processPromise = this.executeProcess(fileUri, cancellationSource.token, options?.force ?? false);

    // Add to queue
    this.processingQueue.set(filePath, processPromise);

    // Remove from queue when done
    processPromise.finally(() => {
      this.processingQueue.delete(filePath);
      this.cancellationSources.delete(filePath);
      cancellationSource.dispose();
    });

    return processPromise;
  }

  /**
   * Execute the complete processing workflow
   */
  private async executeProcess(
    fileUri: vscode.Uri,
    cancellation: vscode.CancellationToken,
    force: boolean = false
  ): Promise<ProcessResult> {
    const fileName = fileUri.fsPath.split(/[/\\]/).pop() || 'unknown';
    // Hoisted out of the try block so the catch block below can still
    // report a cancellation back to the backend (see the "cancelled" step
    // report there) - without this, an artifact a web-frontend user
    // cancelled would stay frozen at status="processing" forever, since
    // nothing else ever tells the backend the run actually stopped.
    let sourcePath: string | undefined;
    let projectId: string | undefined;
    // Started once the artifact's server-assigned id is known (from the
    // initial reportStep call below) - polls for cancellation while the AI
    // call is actually in flight, since the reportStep checkpoints alone
    // are too sparse to catch a cancel click before the current AI call
    // has already finished on its own (see checkCancelRequested's
    // docstring for why this can't just reuse reportStep for the poll).
    let cancelPollHandle: ReturnType<typeof setInterval> | undefined;

    try {
      if (cancellation.isCancellationRequested) {
        throw new CancellationRequestedError();
      }

      this.notificationService.processing(fileName);

      // Step 1: Read file content
      this.notificationService.info(`Reading file: ${fileUri.fsPath}`);
      const content = await this.readFile(fileUri);

      // Step 2: Check for duplicate content (Requirement 1.1/1.4 - compute
      // hash and skip before ever invoking the AI). Bypassed for a forced
      // (retry) run - the whole point there is reprocessing this exact,
      // unchanged content.
      if (!force && this.isDuplicate(fileUri, content)) {
        this.notificationService.info(`Skipping duplicate: ${fileName}`);
        return { success: true, skipped: true };
      }

      sourcePath = vscode.workspace.asRelativePath(fileUri);
      const { projectRoot, authoringFramework } = await this.detectProvenance(fileUri);
      // The project a document belongs to is its actual workspace/repo root
      // (projectRoot), not a guess derived from the file's own relative path -
      // deriving it from sourcePath's first segment meant every subfolder
      // (or, for a root-level file, the filename itself) became its own
      // bogus "project".
      projectId = projectRoot;

      // Check the exceptions list *before* calling the AI - without this,
      // an excluded file still burns a real AI call and shows a full
      // "Transforming with AI" / "Sending to backend" notification cycle
      // for work the backend was always going to reject, which reads as
      // "it processed" even though nothing gets saved.
      const { excluded, artifactId } = await this.reportStepAndCheckCancellation(
        fileUri.fsPath,
        projectId,
        sourcePath,
        'transforming_with_ai',
        1,
        MAX_CLIENT_CORRECTION_ATTEMPTS
      );
      if (excluded) {
        this.notificationService.info(`Excluded from processing: ${fileName}`);
        return { success: true, skipped: true };
      }

      if (artifactId) {
        const filePath = fileUri.fsPath;
        cancelPollHandle = setInterval(() => {
          void this.backendClient.checkCancelRequested(artifactId).then((cancelRequested) => {
            if (cancelRequested) {
              this.stopProcessing(filePath);
            }
          });
        }, 3000);
      }

      const { response, provider } = await this.transformValidateAndSubmit(
        content,
        fileUri,
        sourcePath,
        projectId,
        fileName,
        projectRoot,
        authoringFramework,
        cancellation,
        force
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
      if (error instanceof CancellationRequestedError) {
        this.notificationService.info(`Cancelled: ${fileName}`);
        // Best-effort, matching reportStep's own contract - without this,
        // the artifact stays at status="processing" forever, since nothing
        // else ever tells the backend this run actually stopped.
        if (sourcePath && projectId) {
          void this.backendClient.reportStep(projectId, sourcePath, 'cancelled');
        }
        return { success: false, error, cancelled: true };
      }

      this.notificationService.error(error, () => {
        void this.process(fileUri);
      });

      return {
        success: false,
        error: error
      };
    } finally {
      if (cancelPollHandle) {
        clearInterval(cancelPollHandle);
      }
    }
  }

  /**
   * reportStep, plus: if the response says a web-frontend user has since
   * flagged this artifact for cancellation, stop this file's processing
   * immediately (rather than waiting for the next natural check) - the
   * real vscode.CancellationTokenSource this cancels is already wired into
   * every in-flight AI-provider call and backend HTTP request, so an
   * active one aborts right away, not just at the next loop iteration.
   */
  private async reportStepAndCheckCancellation(
    filePath: string,
    projectId: string,
    sourcePath: string,
    step: string,
    attempt?: number,
    maxAttempts?: number
  ): Promise<{ excluded: boolean; artifactId?: string }> {
    const { excluded, cancelRequested, artifactId } = await this.backendClient.reportStep(
      projectId,
      sourcePath,
      step,
      attempt,
      maxAttempts
    );
    if (cancelRequested) {
      this.stopProcessing(filePath);
    }
    return { excluded, artifactId };
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
    authoringFramework: string,
    cancellation: vscode.CancellationToken,
    force: boolean = false
  ): Promise<{ response: ProcessResponse; provider: string }> {
    let structuredError: StructuredError | undefined;
    let retryCount = 0;
    let provider = '';
    let triedDiagramGapFill = false;

    for (let attempt = 1; attempt <= MAX_CLIENT_CORRECTION_ATTEMPTS; attempt++) {
      if (cancellation.isCancellationRequested) {
        throw new CancellationRequestedError();
      }

      this.notificationService.info(
        structuredError
          ? `Correcting and resubmitting (retry ${retryCount}): ${fileName}`
          : `Transforming with AI: ${fileName}`
      );
      // Best-effort dashboard visibility: this AI call (and the resubmit
      // loop around it) is often the slowest part of the whole pipeline,
      // especially with a real LLM - without reporting it, nothing shows
      // up on the dashboard until /api/process is finally called below.
      // Awaited (not fire-and-forget) despite being best-effort: this ping
      // and the process() call below are two independent HTTP requests to
      // the same backend, so without waiting for this one to land first,
      // the server could process them out of order and have process()'s
      // own final status write (retry_needed/rendered) get silently
      // clobbered by this "submitting"/"transforming" ping arriving late -
      // leaving the dashboard stuck on a stale step forever. reportStep()
      // itself never throws, so this adds latency, not a new failure mode.
      // Skipped on attempt 1: executeProcess() already reported this same
      // step as part of its exclusion check before entering this loop.
      if (attempt > 1) {
        await this.reportStepAndCheckCancellation(
          fileUri.fsPath,
          projectId,
          sourcePath,
          structuredError ? 'correcting' : 'transforming_with_ai',
          attempt,
          MAX_CLIENT_CORRECTION_ATTEMPTS
        );
      }
      let enrichedJson: StructuredJSON;
      let usedProvider: string;
      try {
        const outcome = await this.transformWithAI(content, fileUri, structuredError, cancellation);
        enrichedJson = outcome.result;
        usedProvider = outcome.provider;
      } catch (error: any) {
        // A cancellation must propagate immediately, not get folded into
        // the "AI response failed, ask for a correction" retry path below
        // - that would resubmit yet another AI request right after the
        // user asked everything to stop.
        if (error instanceof CancellationRequestedError) {
          throw error;
        }

        // A malformed/truncated AI response (the provider's own JSON.parse
        // throwing, e.g. a missing comma between array elements - a real,
        // observed failure mode with smaller models on a large enough
        // document) previously aborted this entire retry loop on attempt 1,
        // even though it's exactly the class of problem the correction-
        // prompt mechanism below already exists to fix for schema failures.
        // The AI is often perfectly capable of correcting its own JSON
        // syntax mistake when told specifically what broke and where -
        // feed it back the same way instead of failing outright. Mirrors
        // the sibling !parseResult.valid branch below exactly, including
        // on the final attempt: falling through to the loop's natural
        // "attempt cap reached" return (rather than throwing here) keeps
        // both failure classes reported identically to the caller.
        this.notificationService.info(
          `AI response failed (attempt ${attempt}), asking for a correction: ${fileName} - ${error.message}`
        );
        structuredError = {
          valid: false,
          retry_count: retryCount + 1,
          errors: { schema_errors: [error.message] },
          warnings: []
        };
        retryCount += 1;
        continue;
      }
      provider = usedProvider;

      this.notificationService.info(`Validating JSON: ${fileName}`);
      const parseResult = this.tryParseAndValidate(
        typeof enrichedJson === 'string' ? enrichedJson : JSON.stringify(enrichedJson)
      );
      if (!parseResult.valid) {
        // Client-side JSON malformation/missing-fields is just as
        // correctable as a backend validation failure - feed it back to
        // the AI as a retry instead of treating it as an instant,
        // unrecoverable failure. Previously this called
        // jsonParser.parseAndValidate(), which throws on the first
        // malformed response - that exception propagated all the way up
        // through executeProcess()'s try/catch with no chance for the AI
        // to fix it, ending the whole attempt on one bad response even
        // though the exact same class of problem from the *backend*
        // (missing_headings, ungrounded evidence, etc.) always gets a
        // correction attempt.
        this.notificationService.info(
          `AI response had ${parseResult.errors.length} issue(s), asking for a correction (attempt ${attempt}): ${fileName}`
        );
        structuredError = {
          valid: false,
          retry_count: retryCount + 1,
          errors: { schema_errors: parseResult.errors },
          warnings: []
        };
        retryCount += 1;
        continue;
      }
      let validated = parseResult.json;

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
            gapFillError,
            cancellation
          );
          provider = filledProvider;
          const gapFillResult = this.tryParseAndValidate(
            typeof filledJson === 'string' ? filledJson : JSON.stringify(filledJson)
          );
          // Gap-filling is a best-effort enhancement (documented above) -
          // if it comes back malformed, keep the already-valid
          // pre-gap-fill JSON rather than losing a working document over
          // an optional diagram-completeness pass.
          if (gapFillResult.valid) {
            validated = gapFillResult.json;
          }
        }
      }

      this.notificationService.info(`Sending to backend: ${fileName}`);
      // Awaited for the same reason as the reportStep call above: must land
      // before process() starts, or its "submitting" write can race ahead
      // of process()'s own final status and get stuck showing forever.
      await this.reportStepAndCheckCancellation(
        fileUri.fsPath,
        projectId,
        sourcePath,
        'submitting',
        attempt,
        MAX_CLIENT_CORRECTION_ATTEMPTS
      );
      // No explicit isCancellationRequested check needed here: if
      // reportStepAndCheckCancellation just cancelled this file,
      // backendClient.process()'s own abort-signal wiring (already
      // cancelled before the request even starts) throws
      // CancellationRequestedError on its own.
      const response = await this.backendClient.process(
        {
          project_id: projectId,
          source_path: sourcePath,
          source_markdown: content,
          enriched_json: validated,
          retry_count: retryCount,
          project_root: projectRoot,
          authoring_framework: authoringFramework,
          model_used: provider,
          force_reprocess: force
        },
        cancellation
      );

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
   * Parse and validate an AI response without throwing - unlike
   * jsonParser.parseAndValidate(), which throws on the first problem,
   * making it unusable inside a retry loop that needs the specific error
   * list to build a correction prompt rather than an unwind-the-stack
   * exception.
   */
  private tryParseAndValidate(
    jsonText: string
  ): { valid: true; json: StructuredJSON } | { valid: false; errors: string[] } {
    let parsed: StructuredJSON;
    try {
      parsed = this.jsonParser.parse(jsonText);
    } catch (error: any) {
      return { valid: false, errors: [`Response was not valid JSON: ${error.message}`] };
    }
    const result = this.jsonParser.validate(parsed);
    if (!result.valid) {
      return { valid: false, errors: result.errors };
    }
    return { valid: true, json: parsed };
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
    structuredError?: StructuredError,
    cancellation?: vscode.CancellationToken
  ): Promise<{
    result: StructuredJSON;
    provider: string;
  }> {
    try {
      const sourcePath = vscode.workspace.asRelativePath(fileUri);
      const outcome = await this.aiFactory.transformWithFallback(markdown, sourcePath, structuredError, cancellation);
      // The AI is only asked to classify each heading (SectionType), not
      // reproduce its body content - the extension already has the
      // original markdown locally, so there's no need to have the AI
      // regenerate it, and doing so was the actual cause of large
      // documents getting cut off mid-response (AI output size scaled
      // with total document size; for a big enough document the model hit
      // its own output-length ceiling before finishing valid JSON, at a
      // consistent point every retry). This rebuilds sections[] from the
      // real source text, using local parsing as the authoritative list of
      // headings (every one is guaranteed present, regardless of what the
      // AI did or didn't mention) and the AI's response only for `type`.
      outcome.result.sections = mergeSectionContent(markdown, outcome.result.sections);
      if (outcome.provider === 'Rule-Based (Fallback)') {
        // Previously silent: every real provider's detection/transform
        // failure (unavailable, timeout, rate limit, malformed response)
        // bottoms out here with no user-visible indication, so a document
        // could quietly get the crude heading-only fallback treatment
        // (no AI summarization, no diagrams/glossary, no task-friendly
        // descriptions) and look like it "just worked".
        this.notificationService.fallbackWarning(sourcePath);
      }
      return outcome;
    } catch (error: any) {
      // Preserve cancellation as-is - wrapping it in a generic Error here
      // would make it indistinguishable from a real failure to every
      // caller up the stack that checks `instanceof CancellationRequestedError`.
      if (error instanceof CancellationRequestedError) {
        throw error;
      }
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
