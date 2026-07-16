# Documentation Agent Pipeline

Automatically generate polished PDF documentation from your markdown spec files using AI-powered transformation and validation.

## Features

- 🔄 **Event-driven ingestion** - Hooks onto markdown file creation/modification
- 🤖 **AI transformation** - Converts raw markdown into structured documents with titles, abstracts, and grouped sections
- ✅ **Validation** - Ensures completeness and correctness before rendering
- 📦 **Deduplication** - Skips unchanged content automatically
- 📄 **PDF generation** - Creates polished PDFs with cover pages, table of contents, and grouped sections
- 🗄️ **Version tracking** - Maintains complete version history in PostgreSQL

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Python 3.11+ (for local development)

### Running with Docker

1. **Start the services:**

```bash
cd infra
docker-compose up -d
```

This will start:
- PostgreSQL database on port 5432
- FastAPI backend on port 8000

2. **Check the services are running:**

```bash
docker-compose ps
```

3. **View logs:**

```bash
docker-compose logs -f backend
```

### Testing the Pipeline

1. **Create a project:**

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key" \
  -d '{
    "name": "my-project",
    "repo_url": "https://github.com/user/repo"
  }'
```

2. **Ingest a markdown file:**

```bash
curl -X POST http://localhost:8000/api/artifacts/ingest-raw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-key" \
  -d '{
    "project_id": "proj-1",
    "source_path": "specs/001-feature/spec.md",
    "raw_content": "# My Feature\n\nThis is a test feature.\n\n## Overview\n\nSome details here.",
    "commit_hash": "abc123"
  }'
```

3. **List artifacts:**

```bash
curl http://localhost:8000/api/projects/proj-1/artifacts \
  -H "Authorization: Bearer dev-key"
```

4. **Check PDF output:**

The PDFs are stored in the `pdf_output` Docker volume, which maps to `/app/pdf-output` inside the container.

To access them:

```bash
docker-compose exec backend ls -la /app/pdf-output
```

### Stopping the Services

```bash
cd infra
docker-compose down
```

To remove volumes (database and PDFs):

```bash
docker-compose down -v
```

## Architecture

```
┌─────────────────┐
│  Markdown Files │
└────────┬────────┘
         │
    ┌────▼────────────────┐
    │  Event Hooks        │
    │  - File watcher     │
    │  - Post-commit hook │
    │  - Agent commands   │
    └────┬────────────────┘
         │
    ┌────▼─────────────────┐
    │  Ingestion Service   │
    │  - Classification    │
    │  - Deduplication     │
    └────┬─────────────────┘
         │
    ┌────▼──────────────────┐
    │  Transform Service    │
    │  - AI or heuristics   │
    │  - Structure building │
    └────┬──────────────────┘
         │
    ┌────▼──────────────────┐
    │  Validation Service   │
    │  - Heading checks     │
    │  - Section validation │
    └────┬──────────────────┘
         │
    ┌────▼──────────────────┐
    │  Rendering Service    │
    │  - PDF generation     │
    │  - Cover + TOC        │
    └────┬──────────────────┘
         │
    ┌────▼──────────────────┐
    │  PostgreSQL Database  │
    │  - Projects           │
    │  - Artifacts          │
    │  - Doc Versions       │
    └───────────────────────┘
```

## Environment Variables

### Backend Configuration

- `SPECKIT_EXT_API_KEY` - API authentication key (default: `dev-key`)
- `DOC_OUTPUT_DIR` - Directory for PDF output (default: `/app/pdf-output`)
- `USE_POSTGRES` - Use PostgreSQL instead of SQLite (default: `true`)

### PostgreSQL Configuration

- `POSTGRES_HOST` - Database host (default: `db`)
- `POSTGRES_PORT` - Database port (default: `5432`)
- `POSTGRES_DB` - Database name (default: `docsagent`)
- `POSTGRES_USER` - Database user (default: `docsagent`)
- `POSTGRES_PASSWORD` - Database password (default: `docsagent`)

### AI Transformation (Optional)

- `SPECKIT_MODEL_ENDPOINT` - AI model endpoint URL
- `SPECKIT_MODEL_NAME` - AI model name (default: `gpt-4.1-mini`)

## Development

### Local Development Setup

1. **Install dependencies:**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install psycopg2-binary
```

2. **Run tests:**

```bash
pytest
```

3. **Run the backend locally:**

```bash
# Start PostgreSQL first
cd infra
docker-compose up -d db

# Run the backend
cd ../backend
export USE_POSTGRES=true
export POSTGRES_HOST=localhost
uvicorn app.main:app --reload
```

## Extension Commands

The system provides Spec Kit extension commands:

- `/speckit.ext.setup` - Configure backend connection
- `/speckit.ext.docgen` - Generate docs from active markdown
- `/speckit.ext.status` - View artifact status
- `/speckit.ext.regenerate <path>` - Force re-render

## License

[Your License Here]
