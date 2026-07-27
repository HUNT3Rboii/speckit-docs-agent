# Requirements Document: VS Code Speckit Auto-AI Extension

## Introduction

This document specifies the requirements for a VS Code extension (and similar IDE extensions) that provides fully automatic AI-powered markdown-to-PDF documentation generation. The system integrates with Speckit's existing backend infrastructure and leverages the IDE's active AI model (GitHub Copilot, Claude, Cursor, etc.) to transform markdown files into professional PDFs without manual intervention or separate API keys.

## Glossary

- **Extension**: The IDE plugin component that monitors file changes and coordinates AI processing
- **Speckit_Backend**: The existing Docker-based backend service at http://localhost:8000 that generates PDFs
- **IDE_AI**: The AI model currently active in the user's IDE (GitHub Copilot, Claude, Kiro, Cursor, etc.)
- **Language_Model_API**: VS Code's API for programmatic access to AI models (vscode.lm)
- **File_Watcher**: Component that monitors workspace for markdown file changes
- **Transform_Pipeline**: The sequence of operations from markdown detection to PDF generation
- **Bridge_Server**: Host-based server that connects Docker backend with IDE environment
- **Workspace**: The root directory of the user's project being monitored

## Requirements

### Requirement 1: Zero-Configuration Installation

**User Story:** As a developer, I want to install the extension and have it work immediately, so that I don't waste time on setup or configuration.

#### Acceptance Criteria

1. WHEN the user installs the Extension, THE Extension SHALL activate automatically without requiring configuration steps
2. WHEN the Extension activates, THE Extension SHALL detect the Workspace root directory automatically
3. WHEN the Extension activates, THE Extension SHALL verify Speckit_Backend availability within 2 seconds
4. IF Speckit_Backend is unavailable, THEN THE Extension SHALL display a notification with setup instructions
5. THE Extension SHALL work with default settings without requiring API keys or credentials

### Requirement 2: Automatic Markdown File Detection

**User Story:** As a developer, I want all markdown file changes to be detected automatically, so that I don't have to manually trigger processing.

#### Acceptance Criteria

1. WHEN a markdown file (.md extension) is saved in the Workspace, THE File_Watcher SHALL detect the change within 500 milliseconds
2. WHEN a markdown file is created in the Workspace, THE File_Watcher SHALL detect the creation within 500 milliseconds
3. THE File_Watcher SHALL monitor all subdirectories recursively from the Workspace root
4. THE File_Watcher SHALL ignore markdown files in node_modules, .git, and .vscode directories
5. WHILE the Extension is active, THE File_Watcher SHALL maintain continuous monitoring without manual activation

### Requirement 3: IDE-Agnostic AI Model Integration

**User Story:** As a developer, I want to use whatever AI model is already active in my IDE, so that I don't need separate API keys or subscriptions.

#### Acceptance Criteria

1. WHEN processing a markdown file in VS Code, THE Extension SHALL attempt to use the Language_Model_API to access the IDE_AI
2. WHERE GitHub Copilot is available, THE Extension SHALL use GitHub Copilot for transformation
3. WHERE Claude or other AI extensions are available, THE Extension SHALL detect and use the available AI provider
4. IF no IDE_AI is available, THEN THE Extension SHALL fallback to rule-based transformation and notify the user
5. THE Extension SHALL detect AI availability within 1 second of activation
6. FOR ALL AI providers, THE Extension SHALL use a consistent prompt format for transformation

### Requirement 4: Markdown-to-JSON Transformation

**User Story:** As a developer, I want markdown files automatically transformed into structured JSON, so that the backend can generate professional PDFs.

#### Acceptance Criteria

1. WHEN a markdown file is detected, THE Transform_Pipeline SHALL send the file content to IDE_AI with a structured transformation prompt
2. THE IDE_AI SHALL return JSON containing title, abstract, sections array with heading/content/type fields within 10 seconds
3. WHEN IDE_AI returns a response, THE Transform_Pipeline SHALL validate the JSON structure before forwarding to Speckit_Backend
4. IF the JSON structure is invalid, THEN THE Transform_Pipeline SHALL attempt to repair common formatting issues
5. IF JSON repair fails, THEN THE Transform_Pipeline SHALL fallback to rule-based transformation
6. THE Transform_Pipeline SHALL preserve all original markdown content including code blocks and formatting
7. FOR ALL transformations, THE Transform_Pipeline SHALL classify sections as task, user_story, design_decision, or normal based on content analysis

### Requirement 5: Parser and Pretty Printer for Structured JSON

**User Story:** As a developer, I want robust parsing of AI-generated JSON responses, so that the system handles formatting variations gracefully.

#### Acceptance Criteria

1. WHEN IDE_AI returns a response, THE JSON_Parser SHALL accept responses with or without markdown code blocks (```json)
2. WHEN IDE_AI returns a response, THE JSON_Parser SHALL handle responses with leading or trailing whitespace
3. IF the JSON_Parser encounters invalid JSON, THEN THE JSON_Parser SHALL extract JSON content between first { and last } characters
4. THE Pretty_Printer SHALL format valid JSON with 2-space indentation for debugging purposes
5. FOR ALL valid JSON objects, parsing then pretty printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 6: Backend API Integration

**User Story:** As a developer, I want processed markdown automatically sent to the Speckit backend, so that PDFs are generated without manual intervention.

#### Acceptance Criteria

1. WHEN the Transform_Pipeline completes JSON validation, THE Extension SHALL send a POST request to Speckit_Backend endpoint /api/artifacts/ingest-structured within 1 second
2. THE Extension SHALL include project_id, source_path, and structured_json in the request payload
3. THE Extension SHALL set Content-Type header to application/json and include authentication token
4. WHEN Speckit_Backend returns a successful response (HTTP 200), THE Extension SHALL extract the artifact_id and pdf_location from the response
5. IF Speckit_Backend returns an error (HTTP 4xx or 5xx), THEN THE Extension SHALL retry the request up to 3 times with exponential backoff (1s, 2s, 4s)
6. IF all retry attempts fail, THEN THE Extension SHALL log the error and notify the user with the specific error message

### Requirement 7: User Notifications and Feedback

**User Story:** As a developer, I want clear feedback on processing status, so that I know when PDFs are ready or if errors occur.

#### Acceptance Criteria

1. WHEN a markdown file is detected, THE Extension SHALL display a status bar message indicating processing has started
2. WHEN PDF generation completes successfully, THE Extension SHALL show a notification with the document title and a link to open the PDF
3. IF processing fails at any stage, THEN THE Extension SHALL display an error notification with the specific failure reason
4. THE Extension SHALL include a "Show Details" action in error notifications that opens the extension log
5. WHILE processing multiple files, THE Extension SHALL show aggregate progress (e.g., "Processing 3 of 5 files")
6. THE Extension SHALL limit success notifications to 1 per 10 seconds to avoid notification spam during bulk saves

### Requirement 8: Performance and Efficiency

**User Story:** As a developer, I want markdown processing to complete quickly, so that I can continue working without interruption.

#### Acceptance Criteria

1. WHEN a markdown file under 50KB is saved, THE Transform_Pipeline SHALL complete end-to-end processing within 10 seconds
2. WHEN multiple markdown files are saved within 2 seconds, THE Extension SHALL debounce processing to avoid redundant operations
3. THE Extension SHALL process files asynchronously without blocking the VS Code UI thread
4. WHEN the same markdown file is saved multiple times within 5 seconds, THE Extension SHALL process only the final version
5. THE File_Watcher SHALL consume less than 50MB of memory during normal operation

### Requirement 9: Multi-IDE Compatibility Architecture

**User Story:** As a developer using different IDEs, I want the extension architecture to support VS Code, Cursor, and other IDEs, so that I can use the same workflow across tools.

#### Acceptance Criteria

1. THE Extension SHALL implement a plugin interface that abstracts IDE-specific APIs (file watching, AI access, notifications)
2. WHERE VS Code is the host IDE, THE Extension SHALL implement the interface using vscode.workspace, vscode.lm, and vscode.window APIs
3. WHERE Cursor is the host IDE, THE Extension SHALL implement the interface using Cursor-specific APIs while maintaining the same core logic
4. THE Extension SHALL maintain shared core logic for transformation, validation, and backend communication across all IDE implementations
5. FOR ALL IDE implementations, THE Extension SHALL provide identical user-facing behavior for file detection, processing, and notifications

### Requirement 10: Bridge Server Communication

**User Story:** As a developer, I want the extension to communicate with the Docker backend seamlessly, so that I don't have to manage network configuration.

#### Acceptance Criteria

1. WHEN the Extension needs to access Speckit_Backend in Docker, THE Extension SHALL communicate via Bridge_Server at http://host.docker.internal:8000
2. THE Bridge_Server SHALL forward transformation requests from the Extension to Speckit_Backend within 100 milliseconds
3. WHEN Bridge_Server is unavailable, THE Extension SHALL attempt direct connection to http://localhost:8000 as a fallback
4. THE Extension SHALL verify Bridge_Server connectivity during activation with a health check request
5. IF both Bridge_Server and direct connection fail, THEN THE Extension SHALL display setup instructions for starting the backend

### Requirement 11: Error Handling and Diagnostics

**User Story:** As a developer troubleshooting issues, I want detailed error logs and diagnostics, so that I can resolve problems quickly.

#### Acceptance Criteria

1. WHEN any processing step fails, THE Extension SHALL log the error with timestamp, file path, and stack trace to the extension output channel
2. THE Extension SHALL expose a "Show Extension Logs" command in the VS Code command palette
3. WHEN a transformation fails, THE Extension SHALL include the AI provider name, prompt sent, and response received in the error log
4. THE Extension SHALL validate all configuration values on activation and log warnings for invalid or missing values
5. WHERE debug mode is enabled, THE Extension SHALL log all transformation requests and responses for inspection

### Requirement 12: Configuration and Customization

**User Story:** As a developer with specific needs, I want to customize extension behavior, so that it fits my workflow.

#### Acceptance Criteria

1. THE Extension SHALL provide a configuration setting for backend URL with default value http://localhost:8000
2. THE Extension SHALL provide a configuration setting to enable/disable automatic processing with default value true
3. THE Extension SHALL provide a configuration setting to specify file patterns to include with default value **/*.md
4. THE Extension SHALL provide a configuration setting to specify file patterns to exclude with default value **/node_modules/**, **/.git/**, **/.vscode/**
5. WHEN configuration values change, THE Extension SHALL reload the File_Watcher and Transform_Pipeline without requiring restart
6. THE Extension SHALL validate configuration changes and display warnings for invalid values

### Requirement 13: Testing and Quality Assurance

**User Story:** As a developer contributing to the extension, I want comprehensive tests, so that I can verify changes don't break functionality.

#### Acceptance Criteria

1. THE Extension SHALL include unit tests for JSON parsing with minimum 90% code coverage
2. THE Extension SHALL include integration tests that mock IDE_AI responses and verify transformation correctness
3. THE Extension SHALL include end-to-end tests that verify complete file detection through backend communication
4. FOR ALL valid markdown documents, transformation then serialization then parsing SHALL preserve document structure (round-trip property)
5. THE Extension SHALL include performance tests that verify processing completes within specified time limits

### Requirement 14: Security and Privacy

**User Story:** As a developer working on confidential projects, I want my markdown content handled securely, so that sensitive information is protected.

#### Acceptance Criteria

1. THE Extension SHALL transmit markdown content to IDE_AI using the IDE's standard API without external network requests
2. WHEN communicating with Speckit_Backend, THE Extension SHALL use authentication tokens from configuration
3. THE Extension SHALL not log sensitive content (API keys, tokens, or full file contents) in standard logging mode
4. WHERE debug mode is enabled, THE Extension SHALL warn users that sensitive content may be logged
5. THE Extension SHALL not store markdown content or transformation results in persistent storage outside the Workspace

### Requirement 15: Documentation and User Guidance

**User Story:** As a new user, I want clear documentation, so that I can understand how to use the extension effectively.

#### Acceptance Criteria

1. THE Extension SHALL include a README.md with installation instructions, usage examples, and troubleshooting guide
2. THE Extension SHALL provide a "Getting Started" walkthrough on first activation
3. WHEN no IDE_AI is detected, THE Extension SHALL display a notification with links to AI provider setup instructions
4. THE Extension SHALL include inline documentation for all configuration settings
5. THE Extension SHALL provide example markdown templates that demonstrate optimal formatting for PDF generation

