/**
 * Transform Pipeline Orchestration
 * Coordinates complete workflow from markdown to PDF
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TransformPipeline as ITransformPipeline, ProcessResult, StructuredJSON } from '../types';
import { AIProviderFactory } from './aiProviderFactory';
import { JSONParser } from './jsonParser';
import { BackendClient } from './backendClient';
import { NotificationService } from './notificationService';

/**
 * Orchestrates the complete transformation pipeline
 */
export class TransformPipeline implements ITransformPipeline {
  private aiFactory: AIProviderFactory;
  private jsonParser: JSONParser;
  private backendClient: BackendClient;
  private notificationService: NotificationService;
  private processingQueue: Map<string, Promise<ProcessResult>>;
  private contentCache: Map<string, string>;
  private maxConcurrent: number;

  constructor(
    aiFactory: AIProviderFactory,
    jsonParser: JSONParser,
    backendClient: BackendClient,
    notificationService: NotificationService,
    maxConcurrent: number = 3
  ) {
    this.aiFactory = aiFactory;
    this.jsonParser = jsonParser;
    this.backendClient = backendClient;
    this.notificationService = notificationService;
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

      // Step 2: Check for duplicate content
      if (await this.isDuplicate(fileUri, content)) {
        this.notificationService.info(`Skipping duplicate: ${fileName}`);
        return {
          success: true,
          skipped: true
        };
      }

      // Step 3: Transform with AI
      this.notificationService.info(`Transforming with AI: ${fileName}`);
      const { result: structuredJson, provider } = await this.transformWithAI(content, fileUri);

      // Step 4: Parse and validate JSON
      this.notificationService.info(`Validating JSON: ${fileName}`);
      const validated = this.jsonParser.parseAndValidate(
        typeof structuredJson === 'string' ? structuredJson : JSON.stringify(structuredJson)
      );

      // Step 5: Send to backend
      this.notificationService.info(`Sending to backend: ${fileName}`);
      const response = await this.backendClient.ingest(validated);

      // Step 6: Update cache with successful content
      this.updateCache(fileUri, content);

      // Success notification
      this.notificationService.success(response);

      return {
        success: true,
        artifactId: response.artifact_id,
        pdfLocation: response.pdf_location,
        provider
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
   * Transform markdown with AI using fallback chain
   */
  private async transformWithAI(markdown: string, fileUri: vscode.Uri): Promise<{
    result: StructuredJSON;
    provider: string;
  }> {
    try {
      const sourcePath = vscode.workspace.asRelativePath(fileUri);
      return await this.aiFactory.transformWithFallback(markdown, sourcePath);
    } catch (error: any) {
      throw new Error(`AI transformation failed: ${error.message}`);
    }
  }

  /**
   * Check if content is duplicate
   */
  private async isDuplicate(fileUri: vscode.Uri, content: string): Promise<boolean> {
    const hash = this.calculateHash(content);
    const cachedHash = this.contentCache.get(fileUri.fsPath);
    return hash === cachedHash;
  }

  /**
   * Update content cache
   */
  private updateCache(fileUri: vscode.Uri, content: string): void {
    const hash = this.calculateHash(content);
    this.contentCache.set(fileUri.fsPath, hash);
  }

  /**
   * Calculate SHA-256 hash
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
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
