# Setup Guide: Docker + PostgreSQL Integration

## What Was Added

### 1. **Backend Dockerfile** (`backend/Dockerfile`)
- Python 3.11 slim image
- System dependencies for WeasyPrint (PDF generation)
- PostgreSQL client library (psycopg2-binary)
- Proper PDF output directory setup

### 2. **PostgreSQL Repository** (`backend/app/repositories/postgres_artifact_repo.py`)
- Full PostgreSQL implementation replacing SQLite
- Connection pooling and proper transaction handling
- JSONB support for metadata and structured JSON
- Automatic schema initialization

### 3. **Updated Dependency Injection** (`backend/app/api/deps.py`)
- Dynamic repository selection (PostgreSQL vs SQLite)
- `USE_POSTGRES` environment variable for toggling
- Automatic fallback to SQLite if PostgreSQL fails

### 4. **Updated API Routes** (`backend/app/api/routes.py`)
- Lazy service initialization through dependency injection
- All routes now use the configurable repository

### 5. **Enhanced Docker Compose** (`infra/docker-compose.yml`)
- PostgreSQL service with health checks
- Persistent volumes for database and PDFs
- Environment variables for database connection
- Volume mounting for hot-reload during development
- Proper service dependencies

### 6. **Development Tools**
- `.dockerignore` - Excludes unnecessary files from Docker build
- `README.md` - Complete documentation
- `start.sh` / `start.ps1` - Quick start scripts
- `test-pipeline.sh` - Integration test script

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Markdown Files                           │
│              (specs/**, .kiro/specs/**)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                ┌───────▼────────┐
                │  Event Hooks   │
                │  (File Watch)  │
                └───────┬────────┘
                        │
                ┌───────▼────────────────────────────────┐
                │     FastAPI Backend (Port 8000)        │
                │  ┌──────────────────────────────────┐  │
                │  │  Ingestion → Transform →         │  │
                │  │  Validate → Render → Persist     │  │
                │  └──────────────────────────────────┘  │
                └───────┬────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼───────┐            ┌──────────▼────────┐
│  PostgreSQL   │            │   PDF Storage     │
│  (Port 5432)  │            │   (Volume)        │
│               │            │                   │
│ - projects    │            │ /app/pdf-output/  │
│ - artifacts   │            │   artifact-1.pdf  │
│ - doc_versions│            │   artifact-2.pdf  │
└───────────────┘            └───────────────────┘
```

## How PDFs Are Created

### Trigger Points
1. **POST /api/artifacts/ingest-structured** - Agent-native path
2. **POST /api/artifacts/ingest-raw** - Hook fallback path

### Process Flow
1. **Ingestion** - Content hash check for deduplication
2. **Transform** - AI or heuristic conversion to structured JSON
3. **Validate** - Check headings and section classification
4. **Render** - Generate PDF with WeasyPrint/ReportLab
5. **Persist** - Save to `/app/pdf-output/` and record in PostgreSQL

### PDF Output Location
- **Inside Container**: `/app/pdf-output/`
- **Docker Volume**: `pdf_output`
- **Naming**: `{artifact-id}.pdf` (e.g., `artifact-1.pdf`)

### Database Records
Each PDF is tracked in the `doc_versions` table:
```sql
CREATE TABLE doc_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    pdf_path TEXT NOT NULL,        -- Path to the PDF file
    structured_json JSONB NOT NULL, -- The structured document
    generated_by TEXT NOT NULL,
    generated_at TIMESTAMP NOT NULL
)
```

## Quick Start

### Option 1: Using Start Script (Recommended)

**On Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

**On Windows:**
```powershell
.\start.ps1
```

### Option 2: Manual Docker Compose

```bash
cd infra
docker-compose up -d
docker-compose logs -f backend
```

## Testing the Pipeline

### Run the Test Script

```bash
chmod +x test-pipeline.sh
./test-pipeline.sh
```

### Manual Testing

1. **Create a project:**
```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key" \
  -d '{"name": "my-project"}'
```

2. **Ingest a markdown file:**
```bash
curl -X POST http://localhost:8000/api/artifacts/ingest-raw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key" \
  -d '{
    "project_id": "proj-1",
    "source_path": "specs/001-feature/spec.md",
    "raw_content": "# My Feature\n\n## Overview\n\nThis is a test.",
    "commit_hash": "abc123"
  }'
```

3. **Check the PDF was created:**
```bash
docker-compose exec backend ls -la /app/pdf-output/
```

4. **Copy PDF to your local machine:**
```bash
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ./artifact-1.pdf
```

## Accessing PDFs

### Method 1: Docker Exec
```bash
docker-compose exec backend ls -la /app/pdf-output/
```

### Method 2: Docker Copy
```bash
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ./my-pdf.pdf
```

### Method 3: Volume Inspection
```bash
docker volume inspect infra_pdf_output
```

### Method 4: Mount Local Directory (Development)
Edit `docker-compose.yml`:
```yaml
volumes:
  - ../backend:/app
  - ./pdf-output:/app/pdf-output  # Local directory
```

Then PDFs appear in `infra/pdf-output/` on your machine.

## Database Access

### Using psql
```bash
docker-compose exec db psql -U docsagent -d docsagent
```

### View Projects
```sql
SELECT * FROM projects;
```

### View Artifacts
```sql
SELECT id, source_path, artifact_type, status FROM artifacts;
```

### View Document Versions
```sql
SELECT id, artifact_id, version_no, pdf_path FROM doc_versions;
```

## Troubleshooting

### PDFs Not Being Created

1. **Check backend logs:**
```bash
docker-compose logs backend
```

2. **Verify WeasyPrint is working:**
```bash
docker-compose exec backend python -c "from weasyprint import HTML; print('OK')"
```

3. **Check output directory permissions:**
```bash
docker-compose exec backend ls -la /app/
```

### Database Connection Issues

1. **Check PostgreSQL is running:**
```bash
docker-compose ps db
```

2. **Check database logs:**
```bash
docker-compose logs db
```

3. **Test connection:**
```bash
docker-compose exec backend python -c "from app.repositories.postgres_artifact_repo import PostgresArtifactRepository; repo = PostgresArtifactRepository(); print('Connected!')"
```

### Fallback to SQLite

If PostgreSQL isn't working, set:
```bash
USE_POSTGRES=false
```

The system will automatically use SQLite instead.

## Next Steps

1. ✅ Start the services with `./start.sh` or `./start.ps1`
2. ✅ Run the test script with `./test-pipeline.sh`
3. ✅ Check that PDFs are being created in the Docker volume
4. ✅ Access the PDFs using one of the methods above
5. ✅ Set up your markdown file hooks to trigger automatic ingestion

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SPECKIT_EXT_API_KEY` | `dev-key` | API authentication key |
| `DOC_OUTPUT_DIR` | `/app/pdf-output` | PDF output directory |
| `USE_POSTGRES` | `true` | Use PostgreSQL (false = SQLite) |
| `POSTGRES_HOST` | `db` | Database host |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_DB` | `docsagent` | Database name |
| `POSTGRES_USER` | `docsagent` | Database user |
| `POSTGRES_PASSWORD` | `docsagent` | Database password |
