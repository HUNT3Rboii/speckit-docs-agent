/**
 * File Watching Service
 * Monitors markdown files for changes with debouncing and filtering
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { minimatch } from 'minimatch';
import { FileWatcher as IFileWatcher, FileWatcherConfig } from '../types';

/**
 * Implements file watching with debouncing and duplicate detection
 */
export class FileWatcher implements IFileWatcher {
  private watchers: vscode.FileSystemWatcher[] = [];
  private fileChangeCallbacks: Array<(uri: vscode.Uri) => void> = [];
  private fileCreateCallbacks: Array<(uri: vscode.Uri) => void> = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private contentHashes: Map<string, string> = new Map();
  private config: FileWatcherConfig;

  constructor(config: FileWatcherConfig) {
    this.config = config;
  }

  /**
   * Start watching for file changes
   */
  public async start(): Promise<void> {
    this.stop(); // Clean up any existing watchers

    // Create watcher for each include pattern
    for (const pattern of this.config.includePatterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Handle file changes
      watcher.onDidChange((uri) => this.handleFileChange(uri));

      // Handle file creation
      watcher.onDidCreate((uri) => this.handleFileCreate(uri));

      this.watchers.push(watcher);
    }
  }

  /**
   * Stop watching for file changes
   */
  public async stop(): Promise<void> {
    // Dispose all watchers
    this.watchers.forEach(watcher => watcher.dispose());
    this.watchers = [];

    // Clear all debounce timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Clear content hash cache
    this.contentHashes.clear();
  }

  /**
   * Register callback for file changes
   */
  public onFileChanged(callback: (uri: vscode.Uri) => void): void {
    this.fileChangeCallbacks.push(callback);
  }

  /**
   * Register callback for file creation
   */
  public onFileCreated(callback: (uri: vscode.Uri) => void): void {
    this.fileCreateCallbacks.push(callback);
  }

  /**
   * Update watcher configuration
   */
  public updateConfig(config: FileWatcherConfig): void {
    this.config = config;
    // Restart watchers with new config
    this.start();
  }

  /**
   * Clear content hash cache (useful after successful processing)
   */
  public clearCache(uri: vscode.Uri): void {
    this.contentHashes.delete(uri.fsPath);
  }

  /**
   * Handle file change event with debouncing
   */
  private handleFileChange(uri: vscode.Uri): void {
    if (!this.shouldProcess(uri)) {
      return;
    }

    const filePath = uri.fsPath;

    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);

      // Check for duplicate content
      if (await this.isDuplicate(uri)) {
        return;
      }

      // Notify all listeners
      this.fileChangeCallbacks.forEach(callback => {
        try {
          callback(uri);
        } catch (error) {
          console.error('Error in file change callback:', error);
        }
      });
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle file creation event
   */
  private handleFileCreate(uri: vscode.Uri): void {
    if (!this.shouldProcess(uri)) {
      return;
    }

    // Notify all listeners
    this.fileCreateCallbacks.forEach(callback => {
      try {
        callback(uri);
      } catch (error) {
        console.error('Error in file create callback:', error);
      }
    });
  }

  /**
   * Check if file should be processed based on exclude patterns
   */
  private shouldProcess(uri: vscode.Uri): boolean {
    const relativePath = vscode.workspace.asRelativePath(uri);

    // Check against exclude patterns
    for (const pattern of this.config.excludePatterns) {
      if (minimatch(relativePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if file content is duplicate of last processed version
   */
  private async isDuplicate(uri: vscode.Uri): Promise<boolean> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const contentStr = Buffer.from(content).toString('utf8');
      const hash = this.calculateHash(contentStr);

      const previousHash = this.contentHashes.get(uri.fsPath);
      if (previousHash === hash) {
        return true; // Duplicate content
      }

      // Update hash cache
      this.contentHashes.set(uri.fsPath, hash);
      return false;
    } catch (error) {
      console.error('Error checking for duplicate:', error);
      return false; // Process on error to be safe
    }
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
