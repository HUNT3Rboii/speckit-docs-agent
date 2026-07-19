# Installation Guide: Documentation Agent Extension

## Prerequisites

- **Docker Desktop** installed and running
- **Spec Kit** version 0.11.9 or higher
- **Git** for cloning the repository

---

## Installation Steps

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd speckit-docs-agent
```

### 2. Start the Backend Services

**On Windows:**
```powershell
.\start.ps1
```

**On Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

This will:
- Build the backend Docker image (first time only, takes 2-3 minutes)
- Start PostgreSQL database
- Start FastAPI backend
- Create persistent volumes for PDFs and database

**Expected Output:**
```
✅ Services are running!

📊 Service URLs:
   Backend API: http://localhost:8000
   PostgreSQL:  localhost:5432
```

### 3. Verify Installation

Check that both services are healthy:

```bash
cd infra
docker-compose ps
```

**Expected Output:**
```
NAME                COMMAND                  SERVICE   STATUS
infra-backend-1     "uvicorn app.main:app"  backend   Up
infra-db-1          "docker-entrypoint"     db        Up (healthy)
```

---

## Install Extension in Spec Kit

### Option 1: Copy Extension Files

1. Copy the `extension/` directory to your Spec Kit extensions folder:
   - Windows: `%USERPROFILE%\.speckit\extensions\docs-agent\`
   - Mac/Linux: `~/.speckit/extensions/docs-agent/`

2. Restart Spec Kit

### Option 2: Workspace-Level Extension

1. Copy the `extension/` directory to your Spec Kit workspace:
   ```bash
   cp -r extension/ /path/to/your/speckit-workspace/.speckit/extensions/docs-agent/
   ```

2. Reload Spec Kit workspace

---

## Configure the Extension

In Spec Kit, run:

```
/speckit.ext.setup
```

Provide the following values:
- **API Base URL**: `http://localhost:8000`
- **API Key**: `dev-key`

The extension will:
- Save configuration to your workspace
- Register your project with the backend
- Verify the connection

---

## Test the Installation

### Quick Test

1. Create a test markdown file:

```bash
mkdir -p specs/test
cat > specs/test/spec.md << 'EOF'
# Test Specification

## Overview

This is a test document for the Documentation Agent.

## Requirements

- Generate PDF from this markdown
- Store in PostgreSQL database
- Create professional cover page
EOF
```

2. In Spec Kit, open `specs/test/spec.md` and run:

```
/speckit.ext.docgen
```

3. Verify PDF was created:

```bash
cd infra
docker-compose exec backend ls -la /app/pdf-output/
```

You should see `artifact-1.pdf` (or similar).

4. Copy the PDF to view it:

```bash
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ./test-output.pdf
```

Open `test-output.pdf` to verify it has:
- ✅ Professional cover page
- ✅ Table of contents
- ✅ All section headings
- ✅ Footer with metadata

---

## Optional: Local PDF Access

For easier PDF access during development, mount a local directory:

1. Edit `infra/docker-compose.yml`:

```yaml
backend:
  volumes:
    - ../backend:/app
    - ../pdf-output:/app/pdf-output  # Add this line
```

2. Restart services:

```bash
cd infra
docker-compose down
docker-compose up -d
```

3. PDFs will now appear in `pdf-output/` directory in your project root.

---

## Uninstallation

### Stop Services

```bash
cd infra
docker-compose down
```

### Remove Data (Optional)

To remove all PDFs and database data:

```bash
docker-compose down -v
```

### Remove Extension

Delete the extension directory from Spec Kit:
- `~/.speckit/extensions/docs-agent/` (global)
- or `.speckit/extensions/docs-agent/` (workspace)

---

## Troubleshooting

### Docker Issues

**Problem**: "Docker is not running"

**Solution**: Start Docker Desktop and wait for it to be ready.

---

**Problem**: Port 5432 or 8000 already in use

**Solution**: 
1. Check what's using the ports:
   ```bash
   netstat -ano | findstr :8000
   netstat -ano | findstr :5432
   ```

2. Stop conflicting services or change ports in `docker-compose.yml`.

---

### Backend Issues

**Problem**: Backend fails to start

**Solution**: Check logs:
```bash
cd infra
docker-compose logs backend
```

---

**Problem**: "psycopg2 not installed" error

**Solution**: Rebuild the Docker image:
```bash
docker-compose down
docker-compose build --no-cache backend
docker-compose up -d
```

---

### Extension Issues

**Problem**: Commands not found in Spec Kit

**Solution**: 
1. Verify extension directory structure:
   ```
   .speckit/extensions/docs-agent/
   ├── extension.yml
   ├── commands/
   │   ├── setup.md
   │   ├── docgen.md
   │   ├── status.md
   │   └── regenerate.md
   └── ...
   ```

2. Restart Spec Kit

---

**Problem**: "Connection refused" when running commands

**Solution**: 
1. Verify backend is running:
   ```bash
   curl http://localhost:8000/api/projects -H "Authorization: Bearer dev-key"
   ```

2. Check API URL in extension config matches: `http://localhost:8000`

---

## Next Steps

- Read `QUICKSTART-USER.md` for usage instructions
- Read `USER-GUIDE.md` for detailed documentation
- Follow `TESTING-CHECKLIST.md` for comprehensive testing

---

## Support

- Check backend logs: `docker-compose logs -f backend`
- Check database: `docker-compose exec db psql -U docsagent -d docsagent`
- View all documentation files in the repository root

---

**Installation Complete! 🎉**
