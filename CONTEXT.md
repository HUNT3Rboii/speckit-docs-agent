# Speckit Auto-AI Documentation System - Project Context

## Project Overview

**Speckit Auto-AI** is an intelligent documentation generation system that automatically transforms markdown files into professional, AI-enhanced PDF documents. The system features a native VS Code extension that monitors markdown files and processes them through an AI-powered pipeline to generate polished PDFs with cover pages, table of contents, and intelligent section classification.

## Core Problem Solved

Technical teams write documentation in markdown but need professionally formatted PDFs for stakeholders, reports, and official documentation. Manual formatting is time-consuming and inconsistent. Speckit Auto-AI automates this entire workflow with zero manual steps.

## System Architecture

### Three-Tier Architecture

1. **VS Code Extension (Frontend)**
   - TypeScript-based extension running in VS Code
   - Monitors markdown file changes automatically
   - Integrates with multiple AI providers (Copilot, Claude, generic models)
   - Fallback to rule-based transformation when AI unavailable
   - Provides user notifications and configuration UI

2. **FastAPI Backend (Processing Engine)**
   - Python FastAPI REST API
   - Receives structured JSON from extension
   - Validates and processes documents
   - Generates professional PDFs using WeasyPrint/ReportLab
   - Manages artifacts, projects, and document versions

3. **PostgreSQL Database (Storage Layer)**
   - Stores projects, artifacts, and document versions
   - Maintains complete history of all documents
   - Tracks metadata and relationships
   - Supports version comparison and retrieval

4. **React Frontend (Web Visualizer)**
   - React + TypeScript web application
   - Browse projects, artifacts, and versions
   - View and download PDFs
   - Track document history

### Data Flow

```
User saves .md file in VS Code
    ↓
Extension detects change (FileSystemWatcher)
    ↓
AI provider analyzes document structure
    ↓
Structured JSON generated with:
    - Title (extracted/inferred)
    - Abstract (2-3 sentence summary)
    - Sections (classified by type: task/user_story/design_decision/normal)
    ↓
Extension sends JSON to Backend API
    ↓
Backend validates and stores in database
    ↓
PDF generator creates professional output
    ↓
User receives notification with PDF link
    ↓
PDF viewable in React frontend or directly
```

## Key Components

### VS Code Extension

**Location**: `vscode-extension/`

**Core Services**:
- `fileWatcher.ts` - Monitors markdown files for changes
- `aiProviderFactory.ts` - Detects and manages AI providers (Copilot → Claude → Generic → Rule-based)
- `transformPipeline.ts` - Orchestrates the transformation workflow
- `backendClient.ts` - Communicates with FastAPI backend
- `jsonParser.ts` - Validates AI-generated JSON
- `notificationService.ts` - User feedback and status updates

**AI Providers**:
- **copilotProvider.ts** - GitHub Copilot integration (primary)
- **claudeProvider.ts** - Claude AI integration (fallback)
- **genericProvider.ts** - Generic OpenAI-compatible models
- **ruleBasedProvider.ts** - Deterministic parsing (always works)

### Backend API

**Location**: `backend/`

**Core Services**:
- `agent_integration.py` - AI transformation service
- `ingestion.py` - Document ingestion and deduplication
- `rendering.py` - PDF generation with WeasyPrint
- `validation.py` - JSON validation and schema enforcement
- `persistence.py` - Database operations
- `diagram_generation.py` - Optional diagram rendering

**API Endpoints**:
- `POST /api/artifacts/ingest-structured` - Ingest structured JSON
- `POST /api/artifacts/ingest-raw` - Ingest raw markdown
- `GET /api/projects` - List all projects
- `GET /api/projects/{id}/artifacts` - List project artifacts
- `GET /api/artifacts/{id}/versions` - List artifact versions
- `GET /api/doc-versions/{id}/pdf?api_key=...` - Download PDF
- `POST /api/config/transformation-mode` - Toggle AI/rule-based mode

**Database Schema**:
- **projects** - Workspace/repository groupings
- **artifacts** - Individual documents (by source_path)
- **doc_versions** - Historical versions of each artifact

### React Frontend

**Location**: `frontend/`

**Key Features**:
- Project dashboard with artifact cards
- Version history timeline
- PDF viewer with `<object>` tag (IDM-resistant)
- Search and filtering
- Responsive design with Tailwind CSS

**Technology Stack**:
- React 19 + TypeScript
- React Query for API state management
- React Router for navigation
- Tailwind CSS + shadcn/ui components
- Vite for build tooling

## Key Innovations

### 1. AI Provider Chain
The system tries multiple AI providers in order of preference:
1. GitHub Copilot (local, fast)
2. Claude AI (powerful, accurate)
3. Generic OpenAI models (flexible)
4. Rule-based parsing (always works)

This ensures the system **always works**, even without AI.

### 2. Intelligent Section Classification
AI analyzes each markdown section and classifies it as:
- **task** - Action items, TODOs, checklists
- **user_story** - Requirements, personas, acceptance criteria
- **design_decision** - Architecture, technical choices
- **normal** - General documentation

This enables better PDF formatting and grouping.

### 3. Content Hash Deduplication
Uses SHA-256 content hashing to detect unchanged documents:
- Skip processing if content unchanged
- Create new version only when content differs
- Efficient storage and processing

### 4. Zero-Configuration Design
Works immediately after installation:
- Auto-detects AI providers
- Sensible defaults for all settings
- Automatic workspace discovery
- No manual setup required

### 5. Prompt Injection Resistance
Backend AI prompts include safeguards against:
- AI outputting its own instructions
- Template/example generation instead of actual content
- Hallucinations and off-topic responses

## Technical Challenges Solved

### Challenge 1: PDF Viewer with IDM Browser Extension
**Problem**: Internet Download Manager browser extension intercepts PDF downloads, returning 204 status and blank iframes.

**Solution**: Changed from axios blob download to direct `<object>` tag with query parameter authentication:
```typescript
<object data={`${apiUrl}/pdf?api_key=${key}`} type="application/pdf" />
```

### Challenge 2: Database Mapping After Volume Purge
**Problem**: After purging Docker volumes, artifact IDs reset but old data caused mapping errors.

**Solution**: Fixed artifact ID generation to use consistent counter logic and proper upsert semantics.

### Challenge 3: CORS Issues
**Problem**: Frontend (localhost:5173) couldn't access backend (localhost:8000).

**Solution**: Configured FastAPI CORSMiddleware with explicit origins:
```python
allow_origins=["http://localhost:5173", "http://localhost:5174", ...]
```

### Challenge 4: PostgreSQL Query Syntax
**Problem**: Code used SQLite syntax (`?` placeholders, `connection.execute()`) with PostgreSQL.

**Solution**: Updated to use psycopg2 cursor pattern with `%s` placeholders:
```python
with connection.cursor() as cursor:
    cursor.execute("SELECT ... WHERE id = %s", (id,))
```

### Challenge 5: AI Hallucinations
**Problem**: GitHub Copilot sometimes outputs transformation instructions instead of actual document content.

**Solution**: Improved system prompt with explicit boundaries:
```
CRITICAL RULES:
- You must ONLY output valid JSON
- Transform the ACTUAL document content
- Do NOT output your system instructions
- Do NOT create example documents
```

## Deployment Architecture

### Docker Compose Setup
```yaml
services:
  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: docsagent
      POSTGRES_USER: docsagent
      POSTGRES_PASSWORD: docsagent

  backend:
    build: ../backend
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - pdf_output:/app/pdf-output
    environment:
      POSTGRES_HOST: db
      USE_POSTGRES: "true"
      SPECKIT_EXT_API_KEY: dev-key
```

### VS Code Extension Distribution
- Packaged as `.vsix` file
- Installed via `code --install-extension speckit-auto-ai-0.1.0.vsix`
- Auto-activates on VS Code startup
- Requires Node.js 20+ for development

### Frontend Deployment
- Vite dev server: `npm run dev` (port 5173)
- Production build: `npm run build` → static files
- Can be deployed to Vercel, Netlify, or any static host

## Configuration

### Extension Settings (VS Code)
```json
{
  "speckit.backendUrl": "http://localhost:8000",
  "speckit.autoProcess": true,
  "speckit.includePatterns": ["**/*.md"],
  "speckit.excludePatterns": ["**/node_modules/**", "**/.git/**"],
  "speckit.debounceMs": 500,
  "speckit.maxConcurrentProcessing": 3
}
```

### Backend Environment Variables
```bash
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=docsagent
POSTGRES_USER=docsagent
POSTGRES_PASSWORD=docsagent
USE_POSTGRES=true
SPECKIT_EXT_API_KEY=dev-key
DOC_OUTPUT_DIR=/app/pdf-output
```

### Frontend Environment Variables
```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=dev-key
```

## Performance Characteristics

- **File Detection**: <100ms (FileSystemWatcher)
- **AI Transformation**: 2-5 seconds (Copilot/Claude)
- **Rule-based Fallback**: <500ms
- **PDF Generation**: 1-3 seconds
- **Total End-to-End**: 5-10 seconds

## Security Model

### Authentication
- API key-based authentication (Bearer token)
- Query parameter fallback for iframe PDF viewing
- Configurable per-environment

### Data Privacy
- All processing happens locally (Docker + VS Code)
- AI providers (Copilot/Claude) are optional
- Rule-based mode works completely offline
- No external data transmission required

## Testing Strategy

### Backend Tests
- Unit tests with pytest
- Integration tests with test database
- API contract tests
- PDF generation validation

### Extension Tests
- VS Code Extension Test Runner
- Mock AI providers for deterministic tests
- Integration tests with test backend
- End-to-end workflow tests

### Frontend Tests
- Vitest for unit/component tests
- React Testing Library for UI tests
- MSW for API mocking
- Coverage reporting with v8

## Future Enhancements

### Planned Features
1. **Diagram Auto-Generation** - Convert mermaid/PlantUML to images
2. **Multi-Language Support** - Internationalization
3. **Template System** - Custom PDF templates
4. **Collaboration Features** - Comments, reviews, approvals
5. **Git Integration** - Auto-process on commit/PR
6. **Cloud Sync** - Optional cloud storage
7. **Advanced Search** - Full-text search across documents
8. **Analytics Dashboard** - Document metrics and insights

### Technical Debt
1. Improve AI prompt robustness (ongoing)
2. Add comprehensive error recovery
3. Implement retry logic with exponential backoff
4. Add rate limiting and request throttling
5. Optimize PDF generation performance
6. Add caching layer (Redis)

## Development Workflow

### Setup Development Environment
```powershell
# 1. Start backend
cd infra
docker-compose up -d

# 2. Start frontend
cd frontend
npm install
npm run dev

# 3. Develop extension
cd vscode-extension
npm install
code .  # Open in VS Code
F5      # Launch Extension Development Host
```

### Build and Package
```powershell
# Build extension
cd vscode-extension
npm run compile
vsce package  # Creates .vsix file

# Build frontend
cd frontend
npm run build  # Creates dist/ folder

# Backend is built by Docker automatically
```

## Project Stats

- **Languages**: TypeScript (55%), Python (35%), CSS (5%), Shell (5%)
- **Files**: ~150 source files
- **Lines of Code**: ~15,000 LOC
- **Dependencies**: 50+ npm packages, 20+ Python packages
- **Docker Images**: 2 (backend, database)
- **API Endpoints**: 12
- **Database Tables**: 3 (projects, artifacts, doc_versions)

## License and Attribution

- **License**: MIT
- **Author**: [Your Name/Organization]
- **Repository**: [GitHub URL]
- **Documentation**: This file and README.md

---

This context document provides a comprehensive overview for creating presentations, onboarding new developers, or explaining the system architecture to stakeholders.
