# Speckit Auto-AI - Documentation Generation System

Automatically generate polished PDF documentation from markdown files using AI-powered transformation. Now featuring a native VS Code extension for fully automatic processing!

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

## 🚀 Features

- ✨ **Fully Automatic** - VS Code extension monitors and processes markdown files on save
- 🤖 **AI-Powered** - Uses GitHub Copilot, Claude, or other AI models for intelligent analysis
- 📄 **Professional PDFs** - Generates polished PDFs with cover pages, TOC, and grouped sections
- 🔄 **Smart Fallback** - Works with or without AI using rule-based parsing
- ⚡ **Fast Processing** - Complete transformation in under 10 seconds
- 🗄️ **Version Tracking** - Maintains complete history in PostgreSQL
- 🎯 **Zero Configuration** - Works immediately with sensible defaults

## ⚡ Quick Start (2 Steps)

### Step 1: Start Backend

```powershell
.\START-EVERYTHING.ps1
```

This starts the Docker backend (FastAPI + PostgreSQL) on `http://localhost:8000`

### Step 2: Install VS Code Extension

```powershell
.\INSTALL-EXTENSION.ps1
```

This compiles and installs the VS Code extension.

**That's it!** Now just save any `.md` file in VS Code and it will automatically:
1. Detect the file change
2. Analyze the document with AI (or rule-based fallback)
3. Generate a professional PDF
4. Show you a notification with a link to open the PDF

## 📖 How It Works

### New Architecture (VS Code Extension)

```
Save .md file in VS Code
    ↓
Extension detects change (automatic)
    ↓
AI analyzes structure (Copilot/Claude/fallback)
    ↓
Sends to backend API
    ↓
PDF generated
    ↓
Notification with PDF link
```

**Zero manual steps!** Just edit and save.


## 📚 What You Get

### Backend (Docker)
- **FastAPI server** - REST API for document processing
- **PostgreSQL database** - Version tracking and artifact storage
- **PDF generator** - Professional PDF output with cover pages and TOC
- **AI diagram service** - Optional diagram generation

### VS Code Extension
- **Automatic file monitoring** - Watches for markdown changes
- **AI provider support** - GitHub Copilot, Claude, generic models
- **Rule-based fallback** - Works without AI
- **User notifications** - Real-time status updates
- **Command palette** - Manual processing and configuration
- **Settings UI** - Full configuration through VS Code

## 🎯 VS Code Extension Commands

Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

| Command | Description |
|---------|-------------|
| `Speckit: Process Current File` | Manually process active markdown file |
| `Speckit: Show Extension Logs` | View detailed processing logs |
| `Speckit: Check Backend Status` | Verify backend connection |
| `Speckit: Toggle Auto-Processing` | Enable/disable automatic processing |

## ⚙️ Configuration

VS Code Settings (`Ctrl+,` or `Cmd+,` → search "Speckit"):

| Setting | Default | Description |
|---------|---------|-------------|
| `speckit.backendUrl` | `http://localhost:8000` | Backend API URL |
| `speckit.autoProcess` | `true` | Auto-process on save |
| `speckit.includePatterns` | `["**/*.md"]` | Files to process |
| `speckit.excludePatterns` | `[...]` | Files to ignore |
| `speckit.debounceMs` | `500` | Debounce delay (ms) |
| `speckit.maxConcurrentProcessing` | `3` | Max concurrent files |
| `speckit.enableDebugLogging` | `false` | Verbose logging |

## 🔍 What's New

### ✅ Added: VS Code Extension
- Native integration - no Python scripts needed
- Multiple AI providers with automatic fallback
- Better error handling and user experience
- Automatic activation on VS Code startup

### ✂️ Removed: Python Bridge
The old `backend/copilot_bridge.py` system has been replaced by the VS Code extension.

**Old way (manual)**:
1. Run Python file watcher
2. Run Python AI bridge
3. Manually use Copilot Chat for each file
4. Wait for processing

**New way (automatic)**:
1. Install extension
2. Save markdown file
3. PDF appears automatically ✨

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────┐
│         VS Code Extension               │
│  ┌─────────────────────────────────┐   │
│  │  File Watcher (automatic)       │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  AI Providers (fallback chain)  │   │
│  │  • Copilot → Claude → Generic   │   │
│  │  • Rule-based (always works)    │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  JSON Parser & Validator        │   │
│  └──────────────┬──────────────────┘   │
└─────────────────┼────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│      Backend API (Docker)               │
│  ┌─────────────────────────────────┐   │
│  │  FastAPI Server (port 8000)     │   │
│  └──────────────┬──────────────────┘   │
│                 ↓                        │
│  ┌─────────────────────────────────┐   │
│  │  PDF Generator + Database       │   │
│  └──────────────┬──────────────────┘   │
└─────────────────┼────────────────────────┘
                  ↓
              PDF Output
```

### Data Flow

1. **Save** → Extension detects markdown file change
2. **Transform** → AI analyzes structure (or rule-based fallback)
3. **Validate** → JSON parser validates structured data
4. **Ingest** → Backend API receives structured JSON
5. **Generate** → PDF created with formatting
6. **Store** → Saved to database + file volume
7. **Notify** → User gets notification with PDF link

---

## 🔧 Project Structure

```
.
├── vscode-extension/        # 🆕 VS Code Extension (NEW!)
│   ├── src/
│   │   ├── extension.ts              # Entry point
│   │   ├── services/                 # Core services
│   │   │   ├── config.ts            # Configuration
│   │   │   ├── fileWatcher.ts       # File monitoring
│   │   │   ├── aiProviderFactory.ts # AI detection
│   │   │   ├── jsonParser.ts        # Parsing/validation
│   │   │   ├── backendClient.ts     # API client
│   │   │   ├── notificationService.ts # User feedback
│   │   │   └── transformPipeline.ts  # Orchestration
│   │   ├── providers/                # AI providers
│   │   │   ├── copilotProvider.ts   # GitHub Copilot
│   │   │   ├── claudeProvider.ts    # Claude AI
│   │   │   ├── genericProvider.ts   # Generic model
│   │   │   └── ruleBasedProvider.ts # Fallback
│   │   └── types/                    # TypeScript interfaces
│   ├── package.json                  # Extension manifest
│   └── README.md                     # Extension docs
│
├── backend/                 # FastAPI Backend (Docker)
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── services/       # Business logic
│   │   ├── repositories/   # Database layer
│   │   └── models/         # Data schemas
│   ├── tests/              # Tests
│   ├── Dockerfile          # Backend container
│   └── requirements.txt    # Python dependencies
│
├── infra/                  # Infrastructure
│   └── docker-compose.yml  # Service orchestration
│
├── START-EVERYTHING.ps1    # Start backend
├── INSTALL-EXTENSION.ps1   # 🆕 Install VS Code extension
└── README.md               # This file
```

## 🧪 Testing

### Test the Extension

1. Open `vscode-extension/` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new VS Code window:
   - Open a workspace with markdown files
   - Save a `.md` file
   - Check notifications and logs

### Test the Backend

```powershell
cd backend
pytest tests/
```

---

## 📋 Prerequisites

- **Docker** & Docker Compose
- **Node.js** 20+ (for extension development)
- **VS Code** 1.85.0 or later
- **GitHub Copilot** or **Claude** extension (optional, for AI features)

---

## 🐛 Troubleshooting

### Extension Not Activating

1. Check VS Code version: Help → About (must be 1.85.0+)
2. View extension logs: Ctrl+Shift+P → "Speckit: Show Extension Logs"
3. Reload window: Ctrl+Shift+P → "Developer: Reload Window"

### Backend Not Available

1. Check Docker: `docker ps` (should see backend container)
2. Check logs: `docker logs infra-backend-1`
3. Verify URL: `curl http://localhost:8000/health`
4. Try extension command: "Speckit: Check Backend Status"

### No AI Provider Detected

Extension will use rule-based fallback automatically. For AI features:
1. Install GitHub Copilot or Claude extension
2. Reload VS Code window
3. Check logs for provider detection

### Files Not Processing

1. Check auto-process setting: `speckit.autoProcess` (should be `true`)
2. Check file patterns: `speckit.includePatterns` and `excludePatterns`
3. View logs: "Speckit: Show Extension Logs"
4. Try manual: "Speckit: Process Current File"

### More Help

See `vscode-extension/TROUBLESHOOTING.md` for detailed debugging guide.

---
