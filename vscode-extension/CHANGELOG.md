# Change Log

All notable changes to the "Speckit Auto-AI" extension will be documented in this file.

## [0.1.0] - Unreleased

### Added
- Initial release of Speckit Auto-AI extension
- Automatic markdown file detection and monitoring
- AI-powered markdown transformation using IDE Language Model API
- Support for GitHub Copilot, Claude, and generic AI providers
- Rule-based fallback transformation when no AI provider is available
- Robust JSON parsing and validation
- Backend API integration for PDF generation
- User notifications for processing status
- Configuration options for customization
- Extension commands for manual operations
- Comprehensive type definitions and interfaces
- Project structure with services, providers, and utilities

### Features
- Zero-configuration installation and activation
- Automatic processing on file save
- Smart file watching with debouncing and duplicate detection
- Multi-provider AI fallback chain
- Error handling and retry logic
- Debug logging capabilities

### Technical
- TypeScript with strict mode enabled
- ES2020 target compilation
- Mocha test framework setup
- ESLint configuration
- VS Code Extension API 1.85.0+
- Comprehensive type safety

## Format

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
