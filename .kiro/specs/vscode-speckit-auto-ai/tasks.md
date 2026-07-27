# Implementation Plan: VS Code Speckit Auto-AI Extension

## Overview

This plan guides the implementation of a TypeScript-based VS Code extension that provides fully automatic AI-powered markdown-to-PDF documentation generation. The extension leverages the IDE's Language Model API to access GitHub Copilot, Claude, or other AI providers, transforming markdown files into structured JSON that feeds into the existing Speckit backend for PDF generation.

**Key Technologies:**
- TypeScript (VS Code Extension API)
- VS Code Language Model API (vscode.lm)
- FileSystemWatcher API for file monitoring
- Node.js fetch API for HTTP communication
- JSON parsing and validation

**Implementation Approach:**
- Build core infrastructure first (project setup, interfaces, types)
- Implement file watching and event handling
- Develop AI provider abstraction with fallback chain
- Create transformation pipeline with robust error handling
- Integrate with backend API and notification system
- Add comprehensive testing and documentation

---

## Tasks

### 1. Project Setup and Infrastructure

- [-] 1.1 Initialize TypeScript VS Code extension project
  - Create project using `yo code` generator (TypeScript extension template)
  - Configure TypeScript with strict mode and ES2020 target
  - Set up directory structure: `src/`, `test/`, `resources/`
  - Initialize package.json with extension metadata and dependencies
  - _Requirements: 1.1, 1.5_

- [ ] 1.2 Configure extension manifest (package.json)
  - Define extension activation events: `onStartupFinished`
  - Configure contribution points for commands and settings
  - Add Language Model API permission: `languageModels`
  - Specify minimum VS Code version (1.85.0 or later for lm API)
  - Add extension categories: `Documentation`, `Other`
  - _Requirements: 1.1, 12.1-12.4_

- [x] 1.3 Set up development tooling
  - Configure ESLint with TypeScript rules
  - Set up Prettier for code formatting
  - Add launch.json for debugging extension host
  - Configure .vscodeignore for packaging
  - Add pre-commit hooks for linting
  - _Requirements: 13.1_

- [ ] 1.4 Define core TypeScript interfaces and types
  - Create `src/types/index.ts` with all interface definitions
  - Define StructuredJSON, Section, SectionType types
  - Define service interfaces: FileWatcher, AIProvider, JSONParser, BackendClient, NotificationService
  - Define configuration interfaces and enums
  - _Requirements: 1.1, 9.1_

- [ ] 1.5 Checkpoint - Verify project builds and runs
  - Ensure all tests pass, ask the user if questions arise.

---

### 2. Configuration Management

- [ ] 2.1 Implement ConfigurationManager
  - Create `src/services/config.ts`
  - Implement getConfig() method using vscode.workspace.getConfiguration()
  - Add configuration validation with default value fallback
  - Implement configuration change listener with reload logic
  - Export ExtensionConfig interface with all settings
  - _Requirements: 12.1-12.6_

- [ ]* 2.2 Write unit tests for ConfigurationManager
  - Test configuration loading with valid settings
  - Test default value application for missing settings
  - Test configuration validation and error handling
  - Test configuration change events
  - _Requirements: 13.1_

- [ ] 2.3 Add VS Code configuration schema to package.json
  - Define configuration contribution point
  - Add all settings: backendUrl, autoProcess, includePatterns, excludePatterns, apiKey, enableDebugLogging, debounceMs, maxConcurrentProcessing
  - Provide clear descriptions and default values for each setting
  - Add settings validation patterns where applicable
  - _Requirements: 12.1-12.6, 15.4_

---

### 3. File Watching System

- [ ] 3.1 Implement FileWatcher service
  - Create `src/services/fileWatcher.ts`
  - Implement FileWatcher interface with start(), stop(), onFileChanged(), onFileCreated()
  - Use vscode.workspace.createFileSystemWatcher() with include/exclude patterns
  - Implement debouncing logic with configurable delay (default 500ms)
  - Add duplicate detection using content hash comparison
  - _Requirements: 2.1-2.5_

- [ ] 3.2 Implement ignore pattern filtering
  - Apply exclude patterns from configuration
  - Filter out node_modules, .git, .vscode, .ai-requests, .ai-responses directories
  - Add pattern matching logic using minimatch library
  - Support glob patterns with recursive directory matching
  - _Requirements: 2.4_

- [ ]* 3.3 Write unit tests for FileWatcher
  - Test file change event detection
  - Test file creation event detection
  - Test ignore pattern filtering
  - Test debouncing behavior
  - Mock vscode.workspace API for testing
  - _Requirements: 13.1_

- [ ]* 3.4 Write integration tests for FileWatcher
  - Test end-to-end file watching with temporary test files
  - Verify debouncing with rapid file saves
  - Test pattern exclusion with actual directory structure
  - _Requirements: 13.3_

---

### 4. AI Provider Abstraction Layer

- [ ] 4.1 Create AIProvider interface and base implementation
  - Create `src/services/aiProvider.ts`
  - Define AIProvider interface: isAvailable(), getProviderName(), transform()
  - Create abstract BaseAIProvider class with common functionality
  - Implement structured prompt template for markdown transformation
  - Add timeout handling and error recovery
  - _Requirements: 3.1-3.6_

- [ ] 4.2 Implement CopilotProvider
  - Create `src/providers/copilotProvider.ts`
  - Implement detection using vscode.lm.selectChatModels({ vendor: 'copilot' })
  - Implement transform() using vscode.lm.sendChatRequest()
  - Add request/response logging for debugging
  - Handle Copilot-specific errors (rate limiting, token limits)
  - _Requirements: 3.2_

- [ ] 4.3 Implement ClaudeProvider
  - Create `src/providers/claudeProvider.ts`
  - Implement detection using vscode.lm.selectChatModels({ vendor: 'anthropic' })
  - Implement transform() using Language Model API
  - Handle Claude-specific response formatting
  - _Requirements: 3.3_

- [ ] 4.4 Implement GenericProvider
  - Create `src/providers/genericProvider.ts`
  - Implement detection using vscode.lm.selectChatModels() without filters
  - Implement transform() with generic prompt adaptation
  - Handle unknown model response variations
  - _Requirements: 3.3_

- [ ] 4.5 Implement RuleBasedProvider fallback
  - Create `src/providers/ruleBasedProvider.ts`
  - Implement markdown parsing using marked or similar library
  - Extract title from first H1 heading
  - Generate abstract from first paragraph or first 2-3 sentences
  - Classify sections based on keyword matching (task, user story, design, normal)
  - _Requirements: 3.4_

- [ ] 4.6 Implement AIProviderFactory with fallback chain
  - Create `src/services/aiProviderFactory.ts`
  - Implement detectProviders() with priority order: Copilot → Claude → Generic → Rule-based
  - Add caching for detected providers (check once per activation)
  - Implement automatic fallback on provider failure
  - Log which provider was successfully detected
  - _Requirements: 3.1-3.4_

- [ ]* 4.7 Write unit tests for AI providers
  - Mock vscode.lm API responses for each provider
  - Test successful transformation with valid markdown input
  - Test error handling with invalid AI responses
  - Test fallback chain behavior
  - Test rule-based provider with various markdown structures
  - _Requirements: 13.2_

- [ ] 4.8 Checkpoint - Test AI provider detection and fallback
  - Ensure all tests pass, ask the user if questions arise.

---

### 5. JSON Parsing and Validation

- [ ] 5.1 Implement JSONParser service
  - Create `src/services/jsonParser.ts`
  - Implement parse() with multi-stage parsing strategy
  - Strip markdown code blocks (```json and ```)
  - Extract JSON between first { and last }
  - Handle leading/trailing whitespace
  - _Requirements: 5.1-5.3_

- [ ] 5.2 Implement JSON repair logic
  - Add repairAndParse() method for common JSON errors
  - Fix trailing commas in objects and arrays
  - Escape unescaped quotes in string values
  - Handle missing closing braces/brackets
  - Log repair attempts for debugging
  - _Requirements: 5.3_

- [ ] 5.3 Implement JSON validation
  - Create validate() method checking required fields
  - Validate title, abstract, sections presence and types
  - Validate section structure (heading, content, type)
  - Validate section type enum values
  - Return detailed ValidationResult with errors and warnings
  - _Requirements: 5.1_

- [ ] 5.4 Implement pretty printer
  - Add prettyPrint() method with configurable indentation
  - Format JSON with 2-space indentation for debugging
  - _Requirements: 5.4_

- [ ]* 5.5 Write unit tests for JSONParser
  - Test parsing valid JSON with and without markdown blocks
  - Test parsing JSON with whitespace variations
  - Test extraction between braces
  - Test JSON repair with trailing commas
  - Test JSON repair with escaped quotes
  - Test validation with valid and invalid structures
  - Test round-trip property: parse → prettyPrint → parse produces equivalent object
  - _Requirements: 13.1, 13.4_

---

### 6. Backend API Client

- [ ] 6.1 Implement BackendClient service
  - Create `src/services/backendClient.ts`
  - Implement ingest() method with fetch API
  - Construct request payload with project_id, source_path, structured_json
  - Add authentication header with API key from configuration
  - Parse response and extract artifact_id, pdf_location
  - _Requirements: 6.1-6.4_

- [ ] 6.2 Implement retry logic with exponential backoff
  - Create retryWithBackoff() helper method
  - Implement retry on 5xx errors (server errors)
  - Use exponential backoff: 1s, 2s, 4s delays
  - Maximum 3 retry attempts
  - Fail fast on 4xx errors (client errors)
  - _Requirements: 6.5_

- [ ] 6.3 Implement health check endpoint
  - Add checkHealth() method calling /health or /api/health
  - Return boolean indicating backend availability
  - Use during extension activation to verify backend connection
  - _Requirements: 10.4_

- [ ] 6.4 Implement bridge server communication
  - Add bridge server URL support (http://host.docker.internal:8000)
  - Implement automatic fallback to localhost:8000
  - Test both bridge and direct connection during health check
  - _Requirements: 10.1-10.3_

- [ ]* 6.5 Write unit tests for BackendClient
  - Mock fetch API responses
  - Test successful ingestion with valid response
  - Test retry logic with 5xx errors
  - Test failure after max retries
  - Test health check with available/unavailable backend
  - Test bridge server fallback to localhost
  - _Requirements: 13.2_

---

### 7. Notification Service

- [ ] 7.1 Implement NotificationService
  - Create `src/services/notificationService.ts`
  - Implement processing() showing status bar message
  - Implement success() with information message and PDF link
  - Implement error() with error message and "Show Details" action
  - Implement progress() for bulk operation status
  - _Requirements: 7.1-7.3_

- [ ] 7.2 Implement notification rate limiting
  - Add rate limiting to success() (max 1 per 10 seconds)
  - Queue notifications and display in batches
  - Show aggregate summary for multiple successful generations
  - _Requirements: 7.6_

- [ ] 7.3 Implement PDF opening functionality
  - Add action handler to open PDF in default viewer
  - Support both absolute and relative PDF paths
  - Handle file not found errors gracefully
  - _Requirements: 7.2_

- [ ] 7.4 Add extension output channel for logging
  - Create output channel using vscode.window.createOutputChannel()
  - Add logging methods: info(), warn(), error(), debug()
  - Include timestamps and context in log messages
  - Add "Show Extension Logs" command to open output channel
  - _Requirements: 11.1-11.2_

- [ ]* 7.5 Write unit tests for NotificationService
  - Mock vscode.window notification methods
  - Test rate limiting behavior
  - Test aggregate notification display
  - Test error notification with action buttons
  - _Requirements: 13.1_

---

### 8. Transform Pipeline Orchestration

- [ ] 8.1 Implement TransformPipeline service
  - Create `src/services/transformPipeline.ts`
  - Implement process() orchestrating complete workflow
  - Read file content using vscode.workspace.fs
  - Call AIProvider.transform() with markdown content
  - Call JSONParser.parseAndValidate() on AI response
  - Call BackendClient.ingest() with validated JSON
  - Return ProcessResult with success status and metadata
  - _Requirements: 4.1-4.6_

- [ ] 8.2 Implement duplicate detection caching
  - Add content hash calculation using crypto module
  - Maintain in-memory cache of file path → content hash
  - Check cache before processing to avoid redundant operations
  - Clear cache entries after successful processing
  - _Requirements: 8.4_

- [ ] 8.3 Implement processing queue management
  - Maintain Map of file path → processing Promise
  - Prevent duplicate concurrent processing of same file
  - Limit concurrent processing using configurable max (default 3)
  - _Requirements: 8.1, 8.3_

- [ ] 8.4 Add comprehensive error handling
  - Wrap each processing step in try-catch blocks
  - Provide specific error messages for each failure point
  - Log full stack traces to output channel
  - Attempt fallback providers on AI transformation failure
  - _Requirements: 11.1_

- [ ]* 8.5 Write integration tests for TransformPipeline
  - Mock all service dependencies (AIProvider, JSONParser, BackendClient)
  - Test successful end-to-end processing
  - Test error handling at each pipeline stage
  - Test duplicate detection with identical file saves
  - Test concurrent processing limits
  - _Requirements: 13.2-13.3_

- [ ] 8.6 Checkpoint - Test complete transformation pipeline
  - Ensure all tests pass, ask the user if questions arise.

---

### 9. Extension Lifecycle Management

- [ ] 9.1 Implement extension activation
  - Create `src/extension.ts` with activate() function
  - Initialize ConfigurationManager first
  - Create instances of all services
  - Initialize AIProviderFactory and detect available providers
  - Start FileWatcher service
  - Check backend health and display status
  - Register all commands and event handlers
  - _Requirements: 1.1-1.4_

- [ ] 9.2 Implement extension deactivation
  - Create deactivate() function in extension.ts
  - Stop FileWatcher service
  - Cancel all pending processing operations
  - Clear caches and temporary data
  - Dispose all subscriptions and resources
  - _Requirements: 1.1_

- [ ] 9.3 Wire FileWatcher events to TransformPipeline
  - Register onFileChanged() callback calling pipeline.process()
  - Register onFileCreated() callback calling pipeline.process()
  - Add error handling for processing failures
  - Update notification service during processing
  - _Requirements: 2.1, 4.1_

- [ ] 9.4 Implement configuration reload handling
  - Listen to workspace.onDidChangeConfiguration event
  - Restart FileWatcher with new patterns when config changes
  - Update BackendClient URL and credentials
  - Re-check backend health after URL change
  - _Requirements: 12.5_

- [ ]* 9.5 Write end-to-end tests for extension lifecycle
  - Test activation with all services initialized
  - Test deactivation and resource cleanup
  - Test configuration change handling
  - Mock VS Code extension API
  - _Requirements: 13.3_

---

### 10. User Commands and Features

- [ ] 10.1 Implement "Process Current File" command
  - Register command: `speckit.processCurrentFile`
  - Get active text editor document
  - Verify file is markdown (.md extension)
  - Manually trigger pipeline.process() for current file
  - Show success/error notification
  - _Requirements: 1.1_

- [ ] 10.2 Implement "Show Extension Logs" command
  - Register command: `speckit.showLogs`
  - Open extension output channel
  - Focus output panel
  - _Requirements: 11.2_

- [ ] 10.3 Implement "Check Backend Status" command
  - Register command: `speckit.checkBackend`
  - Call backendClient.checkHealth()
  - Display status notification (available/unavailable)
  - Show backend URL in status message
  - _Requirements: 1.4_

- [ ] 10.4 Implement "Toggle Auto-Processing" command
  - Register command: `speckit.toggleAutoProcess`
  - Read current autoProcess configuration value
  - Update configuration to opposite value
  - Show notification confirming new state
  - _Requirements: 12.2_

- [ ] 10.5 Add commands to package.json contribution
  - Define all commands in package.json contributes.commands
  - Add command palette titles and categories
  - Bind keyboard shortcuts (optional)
  - _Requirements: 15.1_

---

### 11. First-Run Experience and Setup

- [ ] 11.1 Implement first-run detection
  - Check workspace state for firstRun flag
  - Set flag to false after initial activation
  - Show welcome notification on first run
  - _Requirements: 15.2_

- [ ] 11.2 Create setup walkthrough notification
  - Display welcome message with extension overview
  - Include links to documentation and configuration
  - Offer to check backend status
  - Provide quick actions: "Check Backend", "View Docs", "Configure"
  - _Requirements: 15.2_

- [ ] 11.3 Implement AI provider detection notification
  - Check if any AI provider is available during activation
  - If no AI detected, show notification with setup links
  - Provide links to GitHub Copilot, Claude extension installation
  - Inform about rule-based fallback if no AI available
  - _Requirements: 3.4, 15.3_

- [ ] 11.4 Implement backend unavailable notification
  - If health check fails during activation, show setup notification
  - Include instructions for starting Speckit backend
  - Provide link to backend setup documentation
  - Offer "Retry Connection" action
  - _Requirements: 1.4, 10.5_

---

### 12. Testing Infrastructure

- [ ] 12.1 Set up testing framework
  - Install Mocha and @vscode/test-electron
  - Configure test scripts in package.json
  - Create test/runTest.ts for launching VS Code test instance
  - Create test/suite/index.ts for test suite setup
  - _Requirements: 13.1_

- [ ] 12.2 Create test utilities and mocks
  - Create test/mocks/ directory
  - Mock VS Code API interfaces (workspace, window, lm)
  - Create fixture markdown files for testing
  - Create test helper functions for common assertions
  - _Requirements: 13.2_

- [ ] 12.3 Implement performance tests
  - Create test/suite/performance.test.ts
  - Test file processing completes within 10 seconds for 50KB file
  - Test debouncing with rapid file saves
  - Test memory usage stays under 50MB during operation
  - _Requirements: 8.1-8.5, 13.5_

- [ ]* 12.4 Run complete test suite
  - Execute all unit tests
  - Execute all integration tests
  - Execute performance tests
  - Verify minimum 90% code coverage for core modules
  - _Requirements: 13.1-13.5_

- [ ] 12.5 Checkpoint - All tests passing
  - Ensure all tests pass, ask the user if questions arise.

---

### 13. Documentation

- [ ] 13.1 Create comprehensive README.md
  - Add extension overview and key features
  - Include installation instructions (from Marketplace)
  - Document prerequisites (VS Code version, backend setup)
  - Provide usage instructions and examples
  - Document all configuration settings
  - Add troubleshooting section for common issues
  - Include screenshots of notifications and workflow
  - _Requirements: 15.1_

- [ ] 13.2 Create CONTRIBUTING.md
  - Document development setup steps
  - Explain project architecture and component responsibilities
  - Provide guidelines for adding new AI providers
  - Include testing requirements and commands
  - Add pull request process
  - _Requirements: 13.1_

- [ ] 13.3 Create CHANGELOG.md
  - Document initial release version (0.1.0)
  - List all implemented features
  - Note breaking changes and migration paths (if any)
  - _Requirements: 15.1_

- [ ] 13.4 Add inline code documentation
  - Add JSDoc comments to all public interfaces
  - Document function parameters and return types
  - Include usage examples in comments
  - Add @param and @returns tags
  - _Requirements: 15.4_

- [ ] 13.5 Create troubleshooting guide
  - Document common errors and solutions
  - Add backend connection troubleshooting
  - Add AI provider detection issues
  - Add JSON parsing failure resolution
  - Include debugging tips (enable debug logging)
  - _Requirements: 15.1_

---

### 14. Security and Privacy

- [ ] 14.1 Implement secure credential handling
  - Store API key in VS Code secure storage (secrets API)
  - Add migration from plaintext config to secrets
  - Never log API keys or tokens
  - Sanitize logs to remove sensitive data
  - _Requirements: 14.2-14.3_

- [ ] 14.2 Implement debug mode warning
  - Check if enableDebugLogging is true
  - Display warning notification on activation
  - Inform user that sensitive content may be logged
  - Provide option to disable debug mode
  - _Requirements: 14.4_

- [ ] 14.3 Add security audit for data handling
  - Review all file read/write operations
  - Verify no data stored outside workspace
  - Confirm AI requests use only IDE Language Model API
  - Verify no external network calls except to configured backend
  - _Requirements: 14.1, 14.5_

---

### 15. Packaging and Distribution

- [ ] 15.1 Configure VSIX packaging
  - Update package.json metadata (publisher, repository, license)
  - Add extension icon and banner
  - Configure .vscodeignore to exclude dev files
  - Test packaging with `vsce package`
  - _Requirements: 1.1_

- [ ] 15.2 Create marketplace listing content
  - Write detailed extension description
  - Add feature highlights and screenshots
  - Create demo GIF showing workflow
  - List supported VS Code versions
  - Add keywords for discoverability
  - _Requirements: 15.1_

- [ ] 15.3 Test packaged extension
  - Install VSIX file in clean VS Code instance
  - Verify all features work as expected
  - Test with and without AI providers
  - Test with backend available and unavailable
  - _Requirements: 13.3_

- [ ] 15.4 Prepare release artifacts
  - Generate final VSIX package
  - Create GitHub release with notes
  - Prepare marketplace submission
  - Document installation instructions
  - _Requirements: 15.1_

---

### 16. Final Integration and Polish

- [ ] 16.1 Perform end-to-end integration testing
  - Test complete workflow: save markdown → PDF generated
  - Test with GitHub Copilot active
  - Test with no AI provider (rule-based fallback)
  - Test with multiple rapid file saves
  - Test with backend unavailable
  - _Requirements: 13.3_

- [ ] 16.2 Conduct error scenario testing
  - Test invalid markdown files
  - Test malformed AI responses
  - Test backend errors (4xx, 5xx)
  - Test network timeouts
  - Verify user receives clear error messages
  - _Requirements: 11.1-11.5_

- [ ] 16.3 Performance optimization review
  - Profile extension activation time
  - Optimize file watching patterns
  - Review memory usage during bulk operations
  - Optimize JSON parsing for large files
  - _Requirements: 8.1-8.5_

- [ ] 16.4 Code quality review
  - Run ESLint and fix all warnings
  - Run Prettier to format all code
  - Review and improve error messages
  - Remove debug logging and console.log statements
  - _Requirements: 13.1_

- [ ] 16.5 Final checkpoint - Ready for release
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- **No Property-Based Tests**: This extension focuses on integration with external systems (IDE APIs, backend services) rather than complex algorithms with universal properties. Testing emphasizes integration tests and mocking.

- **TypeScript Best Practices**: Use strict type checking, avoid `any` types, leverage TypeScript's type inference, use async/await consistently.

- **VS Code API Compliance**: Follow VS Code extension guidelines, use proper activation events, dispose resources properly, handle configuration changes gracefully.

- **Error Handling Strategy**: Fail gracefully at each stage, provide specific error messages, use fallbacks where appropriate (AI providers, backend connection).

- **Testing Strategy**: Focus on unit tests for parsing/validation logic, integration tests for service coordination, end-to-end tests with VS Code extension host.

- **Tasks marked with `*`**: Optional test tasks that can be skipped for faster MVP development. Core functionality tests should always be implemented.

---

## Success Criteria

The extension is complete when:

1. ✅ Markdown files are automatically detected and processed on save
2. ✅ AI transformation works with Copilot, Claude, or falls back to rule-based
3. ✅ JSON parsing handles AI response variations robustly
4. ✅ Backend integration successfully generates PDFs
5. ✅ Users receive clear notifications for success and failure
6. ✅ All configuration options work as specified
7. ✅ Extension passes all integration tests
8. ✅ Documentation is complete and accurate
9. ✅ Extension packages successfully as VSIX

---

## Implementation Order Rationale

1. **Foundation First**: Project setup and type definitions provide the foundation
2. **Core Services**: Configuration and file watching are prerequisites for transformation
3. **AI Layer**: AI provider abstraction enables flexible model selection
4. **Transformation**: Parsing and validation handle AI response variations
5. **Backend Integration**: API client connects to existing Speckit infrastructure
6. **User Experience**: Notifications and commands provide user feedback
7. **Quality**: Testing and documentation ensure reliability
8. **Polish**: Security, packaging, and final integration prepare for release
