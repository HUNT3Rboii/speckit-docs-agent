/**
 * Configuration Management Service
 * Handles loading, validation, and change tracking of extension settings
 */

import * as vscode from 'vscode';
import { CustomModelEntry, ExtensionConfig, ProviderId } from '../types';

const VALID_PROVIDER_IDS: ProviderId[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];
const DEFAULT_PROVIDER_PRIORITY: ProviderId[] = ['copilot', 'claude', 'kiro', 'generic', 'custom'];

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
    // Defaults to the backend's own dev default (SPECKIT_EXT_API_KEY in
    // infra/docker-compose.yml) so a fresh clone works out of the box for
    // local dev - previously this fell back to '', which sends no
    // Authorization header at all (getHeaders() only adds it when apiKey is
    // truthy), so every backend call 401'd with no indication the API key
    // was the actual problem. Matches frontend/src/config/env.ts's same
    // 'dev-key' fallback for the same reason.
    const apiKey = this.validateString(config.get<string>('apiKey'), 'dev-key');
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
    const providerPriority = this.validateProviderPriority(config.get<string[]>('providerPriority'));
    const customModels = this.validateCustomModels(config);

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
      enableCopilotProgressTracking,
      providerPriority,
      customModels
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

  /**
   * Validate speckit.providerPriority: must be a non-empty array of known
   * provider ids. Unknown entries (e.g. a typo in settings.json) are
   * dropped rather than rejecting the whole list, since one bad entry
   * shouldn't silently revert every other deliberately-chosen priority
   * back to the default order too. Duplicate entries (e.g. from editing
   * the array via the Settings UI) are also collapsed to their first
   * occurrence - a repeated id wouldn't change try-order (the provider is
   * already fully tried/skipped the first time it's reached), it would
   * only show up as a confusing duplicate in the "not available" list.
   */
  private validateProviderPriority(value: string[] | undefined): ProviderId[] {
    if (!Array.isArray(value)) {
      return DEFAULT_PROVIDER_PRIORITY;
    }
    const filtered = [
      ...new Set(value.filter((id): id is ProviderId => (VALID_PROVIDER_IDS as string[]).includes(id)))
    ];
    return filtered.length > 0 ? filtered : DEFAULT_PROVIDER_PRIORITY;
  }

  /**
   * Validate speckit.customModels: an array of custom-model entries, any
   * number of which may be enabled at once (see CustomModelEntry). Falls
   * back to synthesizing a single entry from the old speckit.customModel.*
   * flat settings (from before multiple custom models were supported) so
   * an existing setup keeps working without the user having to redo it -
   * a one-time runtime fallback only, never written back to settings.json.
   */
  private validateCustomModels(config: vscode.WorkspaceConfiguration): CustomModelEntry[] {
    const raw = config.get<any[]>('customModels');
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .map((entry, index) => this.normalizeCustomModelEntry(entry, index))
        .filter((entry): entry is CustomModelEntry => entry !== null);
    }

    const legacyEnabled = config.get<boolean>('customModel.enabled');
    const legacyBaseUrl = this.validateString(config.get<string>('customModel.baseUrl'), '');
    const legacyModelName = this.validateString(config.get<string>('customModel.modelName'), '');
    if (!legacyEnabled && !legacyBaseUrl && !legacyModelName) {
      return [];
    }
    return [
      {
        id: 'legacy',
        enabled: legacyEnabled ?? false,
        name: this.validateString(config.get<string>('customModel.name'), ''),
        baseUrl: legacyBaseUrl,
        apiKey: this.validateString(config.get<string>('customModel.apiKey'), ''),
        modelName: legacyModelName
      }
    ];
  }

  /**
   * Normalizes one speckit.customModels array entry, tolerating a
   * malformed member (e.g. hand-edited settings.json) by dropping it
   * rather than rejecting the whole list - same philosophy as
   * validateProviderPriority. `id` defaults to a positional placeholder if
   * missing, since it only needs to be stable enough for this one
   * getConfig() call, not persisted identity.
   */
  private normalizeCustomModelEntry(entry: any, index: number): CustomModelEntry | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    return {
      id: this.validateString(entry.id, `custom-${index}`),
      enabled: Boolean(entry.enabled),
      name: this.validateString(entry.name, ''),
      baseUrl: this.validateString(entry.baseUrl, ''),
      apiKey: this.validateString(entry.apiKey, ''),
      modelName: this.validateString(entry.modelName, ''),
      models: Array.isArray(entry.models)
        ? entry.models.filter((m: unknown): m is string => typeof m === 'string')
        : undefined
    };
  }
}
