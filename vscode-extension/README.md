# Speckit Auto-AI Extension

Fully automatic AI-powered markdown-to-PDF documentation generation for VS Code. Transform your markdown documents into beautifully formatted PDFs with AI-enhanced structure analysis.

## Features

- **Fully Automatic**: Monitors markdown files and generates PDFs on save
- **AI-Powered**: Uses GitHub Copilot, Claude, or other AI models to intelligently analyze document structure
- **Smart Classification**: Automatically identifies tasks, user stories, design decisions, and general content
- **Robust Fallback**: Works even without AI using rule-based parsing
- **Real-time Processing**: Debounced file watching with duplicate detection
- **Backend Integration**: Seamless communication with Speckit backend API

## Prerequisites

1. **VS Code**: Version 1.85.0 or later
2. **Speckit Backend**: Running on `http://localhost:8000` (or custom URL)
3. **AI Provider** (Optional but recommended):
   - [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot)
   - Claude extension from Anthropic
   - Any other VS Code Language Model provider

## Installation

1. Install the extension from the VS Code Marketplace
2. Start the Speckit backend server
3. Configure the extension settings (optional)

## Usage

### Automatic Processing

By default, the extension automatically processes markdown files when you save them:

1. Open a markdown file in your workspace
2. Make changes and save
3. The extension will:
   - Analyze the document structure using AI
   - Generate structured JSON
   - Send to backend for PDF generation
   - Show notification with PDF link

### Manual Processing

Use the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run:

- **Speckit: Process Current File** - Manually process the active markdown file
- **Speckit: Check Backend Status** - Verify backend connection
- **Speckit: Toggle Auto-Processing** - Enable/disable automatic processing
- **Speckit: Show Extension Logs** - View detailed logs

## Configuration

Open VS Code Settings (`Ctrl+,` or `Cmd+,`) and search for "Speckit":

### Backend Settings

- **Backend URL** (`speckit.backendUrl`)
  - Default: `http://localhost:8000`
  - The URL of your Speckit backend server

- **API Key** (`speckit.apiKey`)
  - Default: empty
  - Optional authentication key for backend

### Processing Settings

- **Auto Process** (`speckit.autoProcess`)
  - Default: `true`
  - Automatically process markdown files on save

- **Debounce Delay** (`speckit.debounceMs`)
  - Default: `500` ms
  - Delay before processing after file changes

- **Max Concurrent Processing** (`speckit.maxConcurrentProcessing`)
  - Default: `3`
  - Maximum number of files to process simultaneously

### File Patterns

- **Include Patterns** (`speckit.includePatterns`)
  - Default: `["**/*.md"]`
  - Glob patterns for files to include

- **Exclude Patterns** (`speckit.excludePatterns`)
  - Default: `["**/node_modules/**", "**/.git/**", ...]`
  - Glob patterns for files to exclude

### Debugging

- **Enable Debug Logging** (`speckit.enableDebugLogging`)
  - Default: `false`
  - Enable verbose logging (⚠️ may log sensitive content)

## How It Works

1. **File Monitoring**: Watches for markdown file changes using VS Code's FileSystemWatcher API
2. **AI Analysis**: Sends content to available AI provider (Copilot → Claude → Generic → Rule-based)
3. **Structure Extraction**: AI identifies title, abstract, and classifies sections
4. **JSON Generation**: Creates structured JSON with document metadata
5. **Backend Processing**: Sends JSON to Speckit backend for PDF generation
6. **Notification**: Shows success message with link to open PDF

## Troubleshooting

### Backend Connection Issues

**Problem**: "Backend is not available" error

**Solutions**:
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check backend URL in settings
3. View logs: Command Palette → "Speckit: Show Extension Logs"
4. Try alternative URL with Docker bridge: `http://host.docker.internal:8000`

### AI Provider Not Detected

**Problem**: Using "Rule-Based (Fallback)" provider

**Solutions**:
1. Install GitHub Copilot or Claude extension
2. Ensure AI extension is activated
3. Check Language Model API permissions
4. View logs for provider detection details

### PDF Not Generated

**Problem**: Processing succeeds but no PDF appears

**Solutions**:
1. Check backend logs for errors
2. Verify backend has write permissions
3. Check output path configuration
4. View extension logs for backend response

### Duplicate Processing

**Problem**: File processed multiple times on save

**Solutions**:
1. Increase debounce delay in settings
2. Check if multiple extensions are triggering saves
3. View logs to identify duplicate triggers

### JSON Parsing Errors

**Problem**: "JSON parsing failed" errors

**Solutions**:
1. Enable debug logging to see AI responses
2. Try manual processing to see specific error
3. Check if AI provider is rate-limited
4. Consider using different AI provider or fallback

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Current file is not a markdown document" | Wrong file type | Open a `.md` file |
| "Backend request failed after 3 attempts" | Backend unavailable | Start backend server |
| "Copilot rate limit exceeded" | Too many requests | Wait or use different provider |
| "Document too large for Copilot" | File exceeds token limit | Split into smaller files |
| "No JSON object found in response" | AI response invalid | Enable debug logging, check AI output |

## Security & Privacy

- API keys are stored in VS Code settings (migration to secure storage planned)
- AI processing uses only the VS Code Language Model API
- No data is sent to external services except configured backend
- Debug logging may expose sensitive content - use with caution

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT - See LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/HUNT3Rboii/speckit-docs-agent/issues)
- **Documentation**: [Repository README](https://github.com/HUNT3Rboii/speckit-docs-agent)
- **Backend Setup**: See main Speckit documentation

## Credits

Built by [Mohamed Yassine Reggui](https://github.com/HUNT3Rboii) in the frame of a summer internship at **Talan Tunisie**, under the mentorship of **Rasha Friji**.

<a href="https://www.talan.com/"><img src="https://raw.githubusercontent.com/HUNT3Rboii/speckit-docs-agent/main/assets/talan-logo.png" alt="Talan" width="200"></a>
