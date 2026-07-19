# Files to Commit for Clean Extension Distribution

## ✅ Essential Files (Must Commit)

### Root Documentation
- `README.md` - Main project documentation
- `CLONE-AND-TEST.md` - Quick clone and test guide
- `INSTALLATION.md` - Complete installation instructions
- `QUICKSTART-USER.md` - 5-minute user quick start
- `USER-GUIDE.md` - Comprehensive user documentation
- `TESTING-CHECKLIST.md` - Testing scenarios
- `SETUP-GUIDE.md` - Detailed setup and troubleshooting
- `CHANGES-SUMMARY.md` - Technical implementation details
- `WATCHER-QUICKSTART.md` - Automatic file watching guide
- `AUTOMATIC-WATCHING-SUMMARY.md` - Watcher implementation details
- `TEST-AUTOMATIC-WATCHING.md` - Watcher testing procedures
- `FILES-TO-COMMIT.md` - This file
- `.gitignore` - Ignore patterns for clean repo

### Scripts
- `start.sh` - Linux/Mac startup script for backend
- `start.ps1` - Windows startup script for backend
- `start-watcher.sh` - Linux/Mac file watcher startup
- `start-watcher.ps1` - Windows file watcher startup  
- `test-pipeline.sh` - Integration test script

### Extension
```
extension/
├── extension.yml
├── config-template.yml
├── commands/
│   ├── setup.md
│   ├── docgen.md
│   ├── status.md
│   ├── regenerate.md
│   └── watch.md
└── scripts/
    ├── python/
    │   ├── markdown_watcher.py
    │   └── post_commit_hook.py
    ├── powershell/
    │   └── start-watcher.ps1
    └── bash/
        └── start-watcher.sh
```

### GitHub Copilot Integration
```
.github/
└── prompts/
    ├── README.md
    ├── speckit-ext-setup.prompt.md
    ├── speckit-ext-docgen.prompt.md
    ├── speckit-ext-status.prompt.md
    ├── speckit-ext-regenerate.prompt.md
    └── speckit-ext-watch.prompt.md
```

### Backend
```
backend/
├── Dockerfile
├── .dockerignore
├── requirements.txt
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── routes.py
│   │   └── deps.py
│   ├── services/
│   │   ├── ingestion.py
│   │   ├── validation.py
│   │   ├── rendering.py
│   │   ├── persistence.py
│   │   └── agent_transform.py
│   ├── models/
│   │   └── schemas.py
│   └── repositories/
│       ├── artifact_repo.py
│       └── postgres_artifact_repo.py
└── tests/
    └── unit/
        ├── test_ingestion.py
        ├── test_validation.py
        ├── test_rendering.py
        ├── test_persistence.py
        ├── test_agent_transform.py
        ├── test_deduplication.py
        ├── test_markdown_hook.py
        ├── test_markdown_watcher.py
        └── test_raw_ingest_flow.py
```

### Infrastructure
```
infra/
└── docker-compose.yml
```

### Specifications
```
specs/
└── 001-documentation-agent/
    ├── spec.md
    ├── plan.md
    ├── tasks.md
    └── checklists/
        ├── requirements.md
        └── pipeline-requirements.md
```

---

## ❌ DO NOT Commit (Covered by .gitignore)

### Temporary Files
- `backend/doc_agent.sqlite3` - SQLite database (using PostgreSQL now)
- `backend/tmp/` - Temporary files
- `backend/tmp-output/` - Temporary output
- `test-trigger.md` - Test file (deleted)
- `docs-agent-feature-spec.md` - Reference file (deleted)

### Python Artifacts
- `__pycache__/` directories
- `*.pyc`, `*.pyo` files
- `.pytest_cache/`
- `.venv/`, `venv/` directories

### IDE Files
- `.vscode/`
- `.idea/`
- `*.sublime-*`

### OS Files
- `.DS_Store` (Mac)
- `Thumbs.db` (Windows)

### Generated Files
- `pdf-output/` - Local PDF directory (if mounted)
- Docker volumes (managed by Docker)

---

## 🔍 Verify Before Committing

Run these checks:

### 1. Check Git Status

```bash
git status
```

Should only show source files, no temporary files.

### 2. Verify .gitignore Works

```bash
git check-ignore backend/doc_agent.sqlite3
git check-ignore backend/tmp/
git check-ignore backend/__pycache__/
```

Each should output the file path (confirming it's ignored).

### 3. Test Clean Clone

```bash
# In a different directory
git clone <your-repo-url> test-clone
cd test-clone

# Verify no temporary files exist
ls backend/
# Should NOT see: doc_agent.sqlite3, tmp/, __pycache__/

# Test it works
./start.ps1  # or ./start.sh
```

---

## 📦 Recommended Commit Structure

### Initial Commit

```bash
git add .
git commit -m "Initial commit: Documentation Agent Extension

- Extension commands for Spec Kit
- FastAPI backend with PostgreSQL
- Docker Compose infrastructure
- PDF generation pipeline
- Complete documentation
"
```

### Tag Release

```bash
git tag -a v0.1.0 -m "Release v0.1.0: Initial public release"
git push origin v0.1.0
```

---

## 📋 Pre-Release Checklist

- [ ] All temporary files removed or ignored
- [ ] .gitignore is comprehensive
- [ ] Documentation is complete and accurate
- [ ] Scripts are executable (chmod +x on Linux/Mac)
- [ ] Docker Compose file is correct
- [ ] Extension manifest (extension.yml) is valid
- [ ] All paths are relative (no hardcoded absolute paths)
- [ ] Tests pass
- [ ] Successfully cloned and tested in clean environment

---

## 🚀 Distribution Options

### Option 1: Git Repository

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

Users clone with:
```bash
git clone <your-repo-url>
```

### Option 2: ZIP Archive

Create a clean distribution ZIP:

```bash
# Exclude temporary files
git archive --format=zip --output=docs-agent-extension-v0.1.0.zip HEAD
```

Users extract and use directly.

### Option 3: Docker Hub (Optional)

Publish the backend image:

```bash
cd backend
docker build -t yourusername/docs-agent-backend:0.1.0 .
docker push yourusername/docs-agent-backend:0.1.0
```

Update `docker-compose.yml`:
```yaml
backend:
  image: yourusername/docs-agent-backend:0.1.0
  # Remove 'build' section
```

---

**Your repository is now clean and ready for distribution! 🎉**
