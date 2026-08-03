/**
 * Configuration Management Service
 * Handles loading, validation, and change tracking of extension settings
 */

import * as vscode from 'vscode';
import { ExtensionConfig } from '../types';

/**
 * Manages extension configuration with validation and change notifications
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private changeListeners: Array<(config: ExtensionConfig) => void> = [];
  private disposables: vscode.Disposable[] = [];

  private constructor() {
    // Listen for configuration changes
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('speckit')) {
        const newConfig = this.getConfig();
        this.notifyListeners(newConfig);
      }
    });
    this.disposables.push(configListener);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get current extension configuration with validation and defaults
   */
  public getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('speckit');

    // Get values with defaults
    const backendUrl = this.validateString(
      config.get<string>('backendUrl'),
      'http://localhost:8000'
    );
    const autoProcess = config.get<boolean>('autoProcess') ?? true;
    const includePatterns = this.validateStringArray(
      config.get<string[]>('includePatterns'),
      ['**/*.md']
    );
    const excludePatterns = this.validateStringArray(
      config.get<string[]>('excludePatterns'),
      [
        '**/node_modules/**',
        '**/.git/**',
        '**/.vscode/**',
        '**/.github/**',
        '**/.ai-requests/**',
        '**/.ai-responses/**',
        '**/dist/**',
        '**/out/**',
        '**/*.json',
        '**/.specify/templates/**'
      ]
    );
    const apiKey = config.get<string>('apiKey') ?? '';
    const enableDebugLogging = config.get<boolean>('enableDebugLogging') ?? false;
    const debounceMs = this.validateNumber(
      config.get<number>('debounceMs'),
      500,
      100,
      5000
    );
    const maxConcurrentProcessing = this.validateNumber(
      config.get<number>('maxConcurrentProcessing'),
      3,
      1,
      10
    );
    const allowRuleBasedFallback = config.get<boolean>('allowRuleBasedFallback') ?? false;
    const enableCopilotProgressTracking = config.get<boolean>('enableCopilotProgressTracking') ?? true;

    return {
      backendUrl,
      autoProcess,
      includePatterns,
      excludePatterns,
      apiKey,
      enableDebugLogging,
      debounceMs,
      maxConcurrentProcessing,
      allowRuleBasedFallback,
      enableCopilotProgressTracking
    };
  }

  /**
   * Register a listener for configuration changes
   * @param listener Callback function receiving new config
   */
  public onConfigChange(listener: (config: ExtensionConfig) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * Update a configuration value
   * @param key Configuration key (without 'speckit.' prefix)
   * @param value New value
   * @param target Configuration target (Global or Workspace)
   */
  public async updateConfig(
    key: string,
    value: any,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('speckit');
    await config.update(key, value, target);
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.changeListeners = [];
  }

  /**
   * Notify all registered listeners of configuration change
   */
  private notifyListeners(config: ExtensionConfig): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('Error in config change listener:', error);
      }
    });
  }

  /**
   * Validate string with fallback to default
   */
  private validateString(value: string | undefined, defaultValue: string): string {
    return value && typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : defaultValue;
  }

  /**
   * Validate string array with fallback to default
   */
  private validateStringArray(value: string[] | undefined, defaultValue: string[]): string[] {
    return Array.isArray(value) && value.length > 0 ? value : defaultValue;
  }

  /**
   * Validate number with min/max bounds and fallback to default
   */
  private validateNumber(
    value: number | undefined,
    defaultValue: number,
    min: number,
    max: number
  ): number {
    if (typeof value !== 'number' || isNaN(value)) {
      return defaultValue;
    }
    return Math.max(min, Math.min(max, value));
  }
}
