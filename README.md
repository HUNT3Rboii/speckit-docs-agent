# Documentation Agent Extension for Spec Kit

Automatically generate polished PDF documentation from your markdown spec files using AI-powered transformation and validation.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![Spec Kit](https://img.shields.io/badge/spec--kit-0.11.9+-green)
![License](https://img.shields.io/badge/license-MIT-orange)

## Features

- 🤖 **AI-powered transformation** - Uses your IDE's AI model (Copilot, Claude, Kiro) for intelligent parsing
- 🔄 **Automatic file watching** - Continuously monitors workspace for markdown changes
- 🎯 **Event-driven ingestion** - Hooks onto file creation, modification, and commits  
- ✨ **Smart content analysis** - AI generates professional titles, abstracts, and classifications
- ✅ **Validation** - Ensures completeness and correctness before rendering
- 📦 **Deduplication** - Skips unchanged content automatically
- 📄 **PDF generation** - Creates polished PDFs with cover pages, table of contents, and grouped sections
- 🗄️ **Version tracking** - Maintains complete version history in PostgreSQL
- 🔙 **Fallback support** - Works with or without AI (rule-based fallback)

## ⚡ Quick Start

**New to this extension?** → See **[CLONE-AND-TEST.md](CLONE-AND-TEST.md)** for step-by-step clone and test instructions.

### 1. Start Backend

```powershell
.\start.ps1  # Windows
# or
./start.sh   # Mac/Linux
```

### 2. Configure in Spec Kit

```
/speckit.ext.setup
```
- API URL: `http://localhost:8000`
- API Key: `dev-key`

### 3. Start Automatic File Watching (Optional but Recommended)

**In a separate terminal:**
```powershell
.\start-watcher.ps1 -WorkspaceRoot "C:\path\to\your\workspace"
```

Now all markdown file changes are automatically processed!

### 4. Or Generate PDF Manually

Open a markdown file in Spec Kit, then:
```
/speckit.ext.docgen
```

**Done!** Your PDF is generated and stored in the database.

📖 **Detailed guides:**
- **[WATCHER-QUICKSTART.md](WATCHER-QUICKSTART.md)** - Set up automatic file watching
- **[CLONE-AND-TEST.md](CLONE-AND-TEST.md)** - Clone and test in new environment
- **[INSTALLATION.md](INSTALLATION.md)** - Complete installation guide
- **[QUICKSTART-USER.md](QUICKSTART-USER.md)** - 5-minute user quick start

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[AGENTIC-PIPELINE.md](AGENTIC-PIPELINE.md)** | AI-powered transformation explained |
| **[WATCHER-QUICKSTART.md](WATCHER-QUICKSTART.md)** | Set up automatic file watching |
| **[INSTALLATION.md](INSTALLATION.md)** | Complete installation and setup guide |
| **[QUICKSTART-USER.md](QUICKSTART-USER.md)** | 5-minute quick start for Spec Kit users |
| **[USER-GUIDE.md](USER-GUIDE.md)** | Comprehensive user documentation |
| **[TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)** | Step-by-step testing scenarios |
| **[SETUP-GUIDE.md](SETUP-GUIDE.md)** | Detailed setup and troubleshooting |
| **[CHANGES-SUMMARY.md](CHANGES-SUMMARY.md)** | Technical implementation details |

---

## 🏗️ Architecture

```
Markdown Files → Event Hooks → Transform → Validate → Render → Store
                                                                ↓
                                                    PostgreSQL + PDF Volume
```

**Event-Driven Processing:**
- **File watcher** monitors for changes (automatic, continuous)
- **Post-commit hooks** trigger on git commits
- **Manual commands** for on-demand generation (`/speckit.ext.docgen`)

**Pipeline Stages:**
1. **Ingest** - Classify and deduplicate
2. **Transform** - AI or heuristic structuring  
3. **Validate** - Check completeness
4. **Render** - Generate PDF with cover + TOC
5. **Store** - Save to database + volume

See [CHANGES-SUMMARY.md](CHANGES-SUMMARY.md) for technical details.

---

## 🎯 Extension Commands

Use these commands in Spec Kit:

| Command | Description |
|---------|-------------|
| `/speckit.ext.setup` | Configure backend connection (one-time) |
| `/speckit.ext.docgen` | Generate PDF from active markdown file |
| `/speckit.ext.status` | View all artifacts and their status |
| `/speckit.ext.regenerate <path>` | Force regenerate a PDF |

---

## 🔧 Project Structure

```
.
├── extension/              # Spec Kit extension
│   ├── commands/          # Extension commands
│   ├── scripts/           # Hook scripts
│   └── extension.yml      # Extension manifest
│
├── backend/               # FastAPI backend
│   ├── app/
│   │   ├── api/          # API routes
│   │   ├── services/     # Business logic
│   │   ├── repositories/ # Database layer
│   │   └── models/       # Data schemas
│   ├── tests/            # Unit & integration tests
│   ├── Dockerfile        # Backend container
│   └── requirements.txt  # Python dependencies
│
├── infra/                # Infrastructure
│   └── docker-compose.yml # Service orchestration
│
├── specs/                # Feature specifications
│   └── 001-documentation-agent/
│
└── *.md                  # Documentation
```

---

## License

[Your License Here]
