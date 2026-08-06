/**
 * Speckit Auto-AI Extension Entry Point
 * Fully automatic AI-powered markdown-to-PDF documentation generation
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigurationManager } from './services/config';
import { FileWatcher } from './services/fileWatcher';
import { AIProviderFactory } from './services/aiProviderFactory';
import { JSONParser } from './services/jsonParser';
import { BackendClient } from './services/backendClient';
import { NotificationService } from './services/notificationService';
import { TransformPipeline } from './services/transformPipeline';
import { CopilotInstructionsService } from './services/copilotInstructionsService';
import { GitignoreService } from './services/gitignoreService';
import { ProgressFileWatcher } from './services/progressFileWatcher';

// Global service instances
let configManager: ConfigurationManager;
let fileWatcher: FileWatcher;
let aiFactory: AIProviderFactory;
let jsonParser: JSONParser;
let backendClient: BackendClient;
let notificationService: NotificationService;
let transformPipeline: TransformPipeline;
let copilotInstructionsService: CopilotInstructionsService;
let gitignoreService: GitignoreService;
let progressFileWatcher: ProgressFileWatcher;
let processingStatusBarItem: vscode.StatusBarItem;
let processingStatusBarInterval: ReturnType<typeof setInterval> | undefined;
let retryPollInterval: ReturnType<typeof setInterval> | undefined;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Speckit Auto-AI extension activating...');

  try {
    // Initialize notification service first for logging
    notificationService = new NotificationService();
    notificationService.info('Initializing Speckit Auto-AI extension...');

    // Initialize configuration manager
    configManager = ConfigurationManager.getInstance();
    const config = configManager.getConfig();

    // Show debug warning if enabled
    if (config.enableDebugLogging) {
      vscode.window.showWarningMessage(
        'Speckit: Debug logging is enabled. Sensitive content may be logged.',
        'Disable Debug Mode'
      ).then(selection => {
        if (selection === 'Disable Debug Mode') {
          configManager.updateConfig('enableDebugLogging', false);
        }
      });
    }

    // Initialize backend client
    backendClient = new BackendClient(config.backendUrl, config.apiKey);

    // Check backend health
    notificationService.info('Checking backend connection...');
    const backendAvailable = await backendClient.checkHealth();
    
    if (!backendAvailable) {
      vscode.window.showWarningMessage(
        'Speckit backend is not available. Please start the backend server.',
        'Retry Connection',
        'View Documentation'
      ).then(selection => {
        if (selection === 'Retry Connection') {
          vscode.commands.executeCommand('speckit.checkBackend');
        } else if (selection === 'View Documentation') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/speckit/vscode-speckit-auto-ai'));
        }
      });
    } else {
      notificationService.info('Backend connection successful');
    }

    // Initialize AI provider factory
    aiFactory = new AIProviderFactory(config.allowRuleBasedFallback, config.providerPriority, config.customModel);
    notificationService.info('Detecting AI providers...');
    const aiProvider = await aiFactory.detectProviders();
    notificationService.info(`AI Provider: ${aiProvider.getProviderName()}`);

    // Show AI provider notification
    const hasAI = await aiFactory.hasAIProvider();
    if (!hasAI) {
      const message = config.allowRuleBasedFallback
        ? 'No AI provider detected. Using rule-based fallback for document analysis.'
        : 'No AI provider detected. Processing will fail until one is available (rule-based fallback is disabled - see speckit.allowRuleBasedFallback).';
      vscode.window.showInformationMessage(
        message,
        'Install GitHub Copilot',
        'Learn More'
      ).then(selection => {
        if (selection === 'Install GitHub Copilot') {
          vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot'));
        } else if (selection === 'Learn More') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/speckit/vscode-speckit-auto-ai'));
        }
      });
    }

    // Initialize JSON parser
    jsonParser = new JSONParser();

    // Initialize transform pipeline
    transformPipeline = new TransformPipeline(
      aiFactory,
      jsonParser,
      backendClient,
      notificationService,
      config.maxConcurrentProcessing
    );

    // Status bar item: visible only while something is actually
    // processing, click to stop everything currently in flight. Polls
    // rather than being event-driven since it's a lightweight UI concern
    // and TransformPipeline already exposes exactly the state needed
    // (getActiveFiles()) without requiring an event-emitter refactor.
    processingStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    processingStatusBarItem.command = 'speckit.stopProcessing';
    context.subscriptions.push(processingStatusBarItem);
    processingStatusBarInterval = setInterval(() => {
      const activeCount = transformPipeline.getActiveFiles().length;
      if (activeCount === 0) {
        processingStatusBarItem.hide();
        return;
      }
      processingStatusBarItem.text = `$(sync~spin) Speckit: Processing (${activeCount})`;
      processingStatusBarItem.tooltip = 'Click to stop all in-progress Speckit processing';
      processingStatusBarItem.show();
    }, 1000);

    // Poll for retry requests made from the web dashboard's PDF viewer -
    // the backend can only flag "please reprocess this" (it has no way to
    // run the AI itself), so the extension is what actually has to notice
    // and act. A workspace folder that was never processed (no matching
    // project on the backend yet) just gets an empty list back each time,
    // at negligible cost.
    retryPollInterval = setInterval(() => {
      void pollForRetryRequests();
    }, 15000);

    // Live Kanban task-progress tracking: auto-provision Copilot
    // instructions + a progress-signal watcher for any Speckit project in
    // this workspace (see copilotInstructionsMerge.ts for exactly what
    // Copilot is asked to do).
    copilotInstructionsService = new CopilotInstructionsService();
    gitignoreService = new GitignoreService();
    progressFileWatcher = new ProgressFileWatcher();
    await setupCopilotProgressTracking(config);

    // Initialize file watcher
    fileWatcher = new FileWatcher({
      includePatterns: config.includePatterns,
      excludePatterns: config.excludePatterns,
      debounceMs: config.debounceMs
    });

    // Wire file watcher events to pipeline
    if (config.autoProcess) {
      fileWatcher.onFileChanged(async (uri) => {
        notificationService.debug(`File changed: ${uri.fsPath}`);
        await transformPipeline.process(uri);
      });

      fileWatcher.onFileCreated(async (uri) => {
        notificationService.debug(`File created: ${uri.fsPath}`);
        await transformPipeline.process(uri);
      });

      await fileWatcher.start();
      notificationService.info('File watching started');
    } else {
      notificationService.info('Auto-processing disabled');
    }

    // Register configuration change handler
    configManager.onConfigChange(async (newConfig) => {
      notificationService.info('Configuration changed, reloading...');

      // Update backend client
      backendClient.setBackendUrl(newConfig.backendUrl);
      backendClient.setApiKey(newConfig.apiKey);

      // Update pipeline settings
      transformPipeline.setMaxConcurrent(newConfig.maxConcurrentProcessing);
      aiFactory.setAllowRuleBasedFallback(newConfig.allowRuleBasedFallback);
      aiFactory.setProviderPriority(newConfig.providerPriority);
      aiFactory.setCustomModelConfig(newConfig.customModel);

      // Re-evaluate live progress tracking (starts/stops the watcher if the
      // setting was just toggled; re-provisioning is a no-op if already done).
      await setupCopilotProgressTracking(newConfig);

      // Restart file watcher with new patterns
      await fileWatcher.stop();
      fileWatcher.updateConfig({
        includePatterns: newConfig.includePatterns,
        excludePatterns: newConfig.excludePatterns,
        debounceMs: newConfig.debounceMs
      });

      if (newConfig.autoProcess) {
        await fileWatcher.start();
      }

      // Re-check backend health
      const healthy = await backendClient.checkHealth();
      if (healthy) {
        notificationService.info('Backend connection verified after config change');
      }
    });

    // Register commands
    registerCommands(context);

    // Check if first run
    const firstRun = context.globalState.get<boolean>('speckit.firstRun', true);
    if (firstRun) {
      await context.globalState.update('speckit.firstRun', false);
      showWelcomeMessage();
    }

    notificationService.info('Speckit Auto-AI extension activated successfully');
    console.log('Speckit Auto-AI extension is now active');

  } catch (error: any) {
    console.error('Failed to activate Speckit Auto-AI:', error);
    vscode.window.showErrorMessage(`Failed to activate Speckit Auto-AI: ${error.message}`);
  }
}

/**
 * Checks every open workspace folder for pending retry requests (made via
 * the Retry button in the web dashboard's PDF viewer) and reprocesses each
 * one, exactly as if that file had just been saved. Best-effort: a failed
 * poll for one folder must not stop the others from being checked.
 */
async function pollForRetryRequests(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    try {
      const projectName = path.basename(folder.uri.fsPath);
      const requests = await backendClient.getRetryRequests(projectName);
      for (const request of requests) {
        const fileUri = vscode.Uri.joinPath(folder.uri, request.sourcePath);
        notificationService.info(`Retry requested from the dashboard: ${request.sourcePath}`);
        // force: true - the file's content is unchanged (that's the whole
        // point of retrying the same document), which would otherwise be
        // silently skipped by the normal unchanged-content dedup.
        void transformPipeline.process(fileUri, { force: true });
      }
    } catch (error: any) {
      notificationService.debug(`Retry-request poll failed for ${folder.name}: ${error.message}`);
    }
  }
}

/**
 * Sets up (or, if disabled, tears down) live Kanban task-progress tracking:
 * for every workspace folder that looks like a Speckit project (has a
 * .specify/ directory), auto-provisions .github/copilot-instructions.md +
 * a .gitignore entry, then watches that folder's
 * .speckit-auto-ai/progress/ for signals to relay to the backend. Called
 * both at activation and on every config change, so toggling
 * speckit.enableCopilotProgressTracking takes effect immediately without
 * requiring a window reload.
 */
async function setupCopilotProgressTracking(config: { enableCopilotProgressTracking: boolean }): Promise<void> {
  progressFileWatcher.dispose();

  if (!config.enableCopilotProgressTracking) {
    return;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const specifyDirUri = vscode.Uri.joinPath(folder.uri, '.specify');
    try {
      await vscode.workspace.fs.stat(specifyDirUri);
    } catch {
      continue; // Not a Speckit project (no .specify/) - nothing to provision here.
    }

    const wasAdded = await copilotInstructionsService.ensureInstructions(folder.uri);
    await gitignoreService.ensureProgressDirIgnored(folder.uri);

    if (wasAdded) {
      notificationService.info(`Added live task-progress-tracking instructions to ${folder.name}'s .github/copilot-instructions.md`);
      vscode.window.showInformationMessage(
        `Speckit Auto-AI added Copilot instructions for live task-progress tracking to "${folder.name}" ` +
          `(.github/copilot-instructions.md). If you have an existing Copilot Chat conversation open, start ` +
          `a new one for it to pick up the change.`,
        'Show Logs'
      ).then(selection => {
        if (selection === 'Show Logs') {
          notificationService.showLogs();
        }
      });
    }

    const projectId = path.basename(folder.uri.fsPath);
    progressFileWatcher.start(folder, (signal) => {
      notificationService.debug(`Progress signal for ${signal.task_key} (${signal.source_path}): ${signal.status}`);
      void backendClient.reportKanbanProgress(projectId, signal.source_path, signal.task_key, signal.status);
    });
  }
}

/**
 * Extension deactivation
 */
export async function deactivate() {
  console.log('Speckit Auto-AI extension deactivating...');

  try {
    // Stop file watcher
    if (fileWatcher) {
      await fileWatcher.stop();
    }

    // Stop the progress-signal watcher
    if (progressFileWatcher) {
      progressFileWatcher.dispose();
    }

    if (processingStatusBarInterval) {
      clearInterval(processingStatusBarInterval);
    }

    if (retryPollInterval) {
      clearInterval(retryPollInterval);
    }

    // Dispose services
    if (notificationService) {
      notificationService.info('Extension deactivating...');
      notificationService.dispose();
    }

    if (configManager) {
      configManager.dispose();
    }

    console.log('Speckit Auto-AI extension deactivated');
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // Command: Process Current File
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.processCurrentFile', async () => {
      const editor = vscode.window.activeTextEditor;
      
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const document = editor.document;
      
      // Check if markdown file
      if (document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('Current file is not a markdown document');
        return;
      }

      // Save document first
      if (document.isDirty) {
        await document.save();
      }

      // Process file
      try {
        const result = await transformPipeline.process(document.uri);
        if (result.success && !result.skipped) {
          vscode.window.showInformationMessage('File processed successfully!');
        } else if (result.skipped) {
          vscode.window.showInformationMessage('File skipped (no changes detected)');
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(`Processing failed: ${error.message}`);
      }
    })
  );

  // Command: Show Extension Logs
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.showLogs', () => {
      notificationService.showLogs();
    })
  );

  // Command: Check Backend Status
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.checkBackend', async () => {
      const config = configManager.getConfig();
      notificationService.info(`Checking backend at ${config.backendUrl}...`);
      
      const available = await backendClient.checkHealth();
      
      if (available) {
        vscode.window.showInformationMessage(`Backend is available at ${config.backendUrl}`);
      } else {
        vscode.window.showWarningMessage(
          `Backend is not available at ${config.backendUrl}`,
          'View Logs'
        ).then(selection => {
          if (selection === 'View Logs') {
            notificationService.showLogs();
          }
        });
      }
    })
  );

  // Command: Stop Processing
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.stopProcessing', () => {
      const activeFiles = transformPipeline.getActiveFiles();
      if (activeFiles.length === 0) {
        vscode.window.showInformationMessage('Speckit: nothing is currently processing.');
        return;
      }
      const cancelledCount = transformPipeline.stopProcessing();
      vscode.window.showInformationMessage(
        `Speckit: stopping ${cancelledCount} in-progress file${cancelledCount === 1 ? '' : 's'}.`
      );
    })
  );

  // Command: Toggle Auto-Processing
  context.subscriptions.push(
    vscode.commands.registerCommand('speckit.toggleAutoProcess', async () => {
      const config = configManager.getConfig();
      const newValue = !config.autoProcess;
      
      await configManager.updateConfig('autoProcess', newValue);
      
      const status = newValue ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Auto-processing ${status}`);
      
      notificationService.info(`Auto-processing ${status}`);
    })
  );
}

/**
 * Show welcome message on first run
 */
function showWelcomeMessage(): void {
  vscode.window.showInformationMessage(
    'Welcome to Speckit Auto-AI! Automatic markdown-to-PDF generation is now active.',
    'Check Backend',
    'View Documentation',
    'Configure'
  ).then(selection => {
    if (selection === 'Check Backend') {
      vscode.commands.executeCommand('speckit.checkBackend');
    } else if (selection === 'View Documentation') {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/speckit/vscode-speckit-auto-ai'));
    } else if (selection === 'Configure') {
      vscode.commands.executeCommand('workbench.action.openSettings', 'speckit');
    }
  });
}
