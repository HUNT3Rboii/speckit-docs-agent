# Contributing to Speckit Auto-AI Extension

Thank you for your interest in contributing! This document provides guidelines and instructions for development.

## Development Setup

### Prerequisites

- Node.js 20.x or later
- VS Code 1.85.0 or later
- TypeScript 5.3.x or later
- Git

### Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/HUNT3Rboii/speckit-docs-agent.git
   cd vscode-speckit-auto-ai/vscode-extension
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile TypeScript**
   ```bash
   npm run compile
   ```

4. **Run in development mode**
   - Open the project in VS Code
   - Press `F5` to launch Extension Development Host
   - Test your changes in the new VS Code window

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── types/
│   │   └── index.ts          # TypeScript interfaces
│   ├── services/
│   │   ├── config.ts         # Configuration management
│   │   ├── fileWatcher.ts    # File monitoring
│   │   ├── aiProvider.ts     # Base AI provider
│   │   ├── aiProviderFactory.ts  # Provider detection
│   │   ├── jsonParser.ts     # JSON parsing/validation
│   │   ├── backendClient.ts  # Backend API client
│   │   ├── notificationService.ts  # User notifications
│   │   └── transformPipeline.ts  # Pipeline orchestration
│   ├── providers/
│   │   ├── copilotProvider.ts    # GitHub Copilot
│   │   ├── claudeProvider.ts     # Claude AI
│   │   ├── genericProvider.ts    # Generic AI
│   │   └── ruleBasedProvider.ts  # Fallback parser
│   └── utils/
├── test/                      # Test files
├── package.json              # Extension manifest
├── tsconfig.json            # TypeScript config
└── README.md                # User documentation
```

## Architecture

### Core Components

1. **ConfigurationManager** (`services/config.ts`)
   - Loads and validates extension settings
   - Listens for configuration changes
   - Provides type-safe config access

2. **FileWatcher** (`services/fileWatcher.ts`)
   - Monitors markdown files using VS Code API
   - Implements debouncing and duplicate detection
   - Filters files based on include/exclude patterns

3. **AI Provider Layer** (`services/aiProvider.ts`, `providers/`)
   - Abstract base class for all providers
   - Concrete implementations: Copilot, Claude, Generic, Rule-based
   - Factory pattern with automatic fallback chain

4. **JSONParser** (`services/jsonParser.ts`)
   - Extracts JSON from AI responses
   - Repairs common JSON errors
   - Validates against schema

5. **BackendClient** (`services/backendClient.ts`)
   - Communicates with Speckit backend API
   - Implements retry with exponential backoff
   - Handles health checks and fallback URLs

6. **NotificationService** (`services/notificationService.ts`)
   - Shows user notifications
   - Manages output channel logging
   - Implements rate limiting

7. **TransformPipeline** (`services/transformPipeline.ts`)
   - Orchestrates complete workflow
   - Manages processing queue
   - Implements concurrency limits

### Data Flow

```
File Change Event
    ↓
FileWatcher (debounce + filter)
    ↓
TransformPipeline.process()
    ↓
1. Read file content
2. AI Provider (transform)
3. JSON Parser (validate)
4. Backend Client (ingest)
5. Notification (success/error)
```

## Adding a New AI Provider

To add support for a new AI model:

1. **Create provider class** in `src/providers/yourProvider.ts`:
   ```typescript
   import { BaseAIProvider } from '../services/aiProvider';
   import { StructuredJSON } from '../types';
   import * as vscode from 'vscode';

   export class YourProvider extends BaseAIProvider {
     public async isAvailable(): Promise<boolean> {
       // Check if your provider is available
       const models = await vscode.lm.selectChatModels({
         vendor: 'your-vendor'
       });
       return models.length > 0;
     }

     public getProviderName(): string {
       return 'Your Provider Name';
     }

     public async transform(markdown: string, sourcePath: string): Promise<StructuredJSON> {
       // Implement transformation logic
       // Use this.createPrompt(markdown) for standard prompt
       // Use this.extractJSON(response) to parse AI response
     }
   }
   ```

2. **Register in factory** (`services/aiProviderFactory.ts`):
   ```typescript
   import { YourProvider } from '../providers/yourProvider';

   // Add to providers array in detectProviders()
   this.providers = [
     new CopilotProvider(),
     new YourProvider(),  // Add your provider
     new ClaudeProvider(),
     // ...
   ];
   ```

3. **Test your provider**:
   - Run extension in debug mode
   - Check logs for provider detection
   - Process a markdown file
   - Verify JSON structure

## Testing

### Unit Tests

```bash
npm run test
```

### Manual Testing

1. Launch Extension Development Host (F5)
2. Open a workspace with markdown files
3. Test scenarios:
   - File save triggers processing
   - Manual processing command
   - Backend connection
   - Configuration changes
   - Error handling

### Testing Checklist

- [ ] File watching detects changes
- [ ] Debouncing works correctly
- [ ] Duplicate detection prevents reprocessing
- [ ] AI provider detection works
- [ ] Fallback to rule-based works
- [ ] JSON parsing handles various responses
- [ ] Backend client retries on errors
- [ ] Notifications show correctly
- [ ] Configuration changes apply
- [ ] Commands work from palette

## Code Style

- Follow existing code formatting
- Use TypeScript strict mode
- Avoid `any` types
- Add JSDoc comments for public methods
- Use async/await for promises
- Handle errors explicitly

### Formatting

```bash
npm run lint
```

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clear commit messages
   - Follow code style guidelines
   - Add tests if applicable

3. **Test thoroughly**
   - Run unit tests
   - Test manually in Extension Development Host
   - Verify no regressions

4. **Submit PR**
   - Describe changes clearly
   - Reference related issues
   - Include screenshots if UI changes

5. **Code review**
   - Address reviewer feedback
   - Keep PR focused and atomic

## Common Development Tasks

### Debugging

- Set breakpoints in TypeScript files
- Use VS Code's debugger (F5)
- Check "Debug Console" for output
- View extension logs in output panel

### Adding Configuration Options

1. Add to `contributes.configuration` in `package.json`
2. Update `ExtensionConfig` interface in `types/index.ts`
3. Update `ConfigurationManager.getConfig()` with validation
4. Handle in relevant service

### Modifying AI Prompt

Edit `BaseAIProvider.createPrompt()` in `services/aiProvider.ts`

### Changing Backend API

Update `BackendClient` methods in `services/backendClient.ts`

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Test VSIX package: `npm run package`
4. Install and test locally
5. Create GitHub release
6. Publish to marketplace (maintainers only)

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Chat**: Join our Discord (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
