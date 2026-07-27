/**
 * Speckit Auto-AI Extension Entry Point
 * Fully automatic AI-powered markdown-to-PDF documentation generation
 */

import * as vscode from 'vscode';
import { ConfigurationManager } from './services/config';
import { FileWatcher } from './services/fileWatcher';
import { AIProviderFactory } from './services/aiProviderFactory';
import { JSONParser } from './services/jsonParser';
import { BackendClient } from './services/backendClient';
import { NotificationService } from './services/notificationService';
import { TransformPipeline } from './services/transformPipeline';

// Global service instances
let configManager: ConfigurationManager;
let fileWatcher: FileWatcher;
let aiFactory: AIProviderFactory;
let jsonParser: JSONParser;
let backendClient: BackendClient;
let notificationService: NotificationService;
let transformPipeline: TransformPipeline;

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
    aiFactory = new AIProviderFactory();
    notificationService.info('Detecting AI providers...');
    const aiProvider = await aiFactory.detectProviders();
    notificationService.info(`AI Provider: ${aiProvider.getProviderName()}`);

    // Show AI provider notification
    const hasAI = await aiFactory.hasAIProvider();
    if (!hasAI) {
      vscode.window.showInformationMessage(
        'No AI provider detected. Using rule-based fallback for document analysis.',
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
 * Extension deactivation
 */
export async function deactivate() {
  console.log('Speckit Auto-AI extension deactivating...');

  try {
    // Stop file watcher
    if (fileWatcher) {
      await fileWatcher.stop();
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
