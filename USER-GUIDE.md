# User Guide: Testing Documentation Agent in Spec Kit

This guide shows you how to use the Documentation Agent extension as a Spec Kit user.

## Prerequisites

1. **Spec Kit installed** (version 0.11.9 or higher)
2. **Docker running** on your machine
3. **This extension installed** in your Spec Kit workspace

## Step 1: Start the Backend Services

Open a terminal in this project directory and start the services:

**On Windows:**
```powershell
.\start.ps1
```

**On Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

You should see:
```
✅ Services are running!

📊 Service URLs:
   Backend API: http://localhost:8000
   PostgreSQL:  localhost:5432
```

## Step 2: Set Up the Extension in Spec Kit

In your Spec Kit workspace (where you have your spec files), run:

```
/speckit.ext.setup
```

This command will prompt you for:
1. **API Base URL**: Enter `http://localhost:8000`
2. **API Key**: Enter `dev-key`

The extension will:
- Save these settings to your extension config file
- Register your current project with the backend
- Confirm the connection is working

## Step 3: Generate Documentation from a Spec File

### Option A: Using the Agent Command

1. Open any markdown spec file in Spec Kit (e.g., `specs/001-documentation-agent/spec.md`)
2. Make sure the file is the active editor
3. Run the command:

```
/speckit.ext.docgen
```

This will:
- Read the active markdown file
- Send it to the backend for processing
- Transform it into structured JSON
- Validate the structure
- Generate a PDF automatically
- Store metadata in PostgreSQL

### Option B: Just Create or Edit a Markdown File

The extension also has a **post-commit hook** that automatically processes markdown files when you commit them.

1. Create a new spec file: `specs/002-my-feature/spec.md`
2. Write some markdown content:

```markdown
# My New Feature

This is a test of the documentation agent.

## Overview

The system should process this file automatically.

## Requirements

- Requirement 1: The system must work
- Requirement 2: PDFs must be generated
```

3. Save the file
4. Commit it to git:

```bash
git add specs/002-my-feature/spec.md
git commit -m "Add new feature spec"
```

The post-commit hook will automatically:
- Detect the markdown file
- Send it to the backend
- Generate the PDF
- Store it in the database

## Step 4: Check the Status

To see what artifacts have been processed:

```
/speckit.ext.status
```

This will display:
- All artifacts in your project
- Their processing status (pending, rendered, stale)
- Source paths
- Artifact types

Example output:
```
Project: my-project

Artifacts:
- specs/001-documentation-agent/spec.md [spec] - rendered
- specs/002-my-feature/spec.md [spec] - rendered
```

## Step 5: View the Generated PDFs

PDFs are stored in the Docker volume. To access them:

### Method 1: Docker Command (Quick Check)

```bash
cd infra
docker-compose exec backend ls -la /app/pdf-output/
```

You should see files like:
```
artifact-1.pdf
artifact-2.pdf
```

### Method 2: Copy PDF to Your Machine

```bash
cd infra
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ../my-spec-doc.pdf
```

This copies the PDF to your project root directory.

### Method 3: Mount Local Directory (Recommended for Development)

Edit `infra/docker-compose.yml` and add a local mount:

```yaml
services:
  backend:
    volumes:
      - ../backend:/app
      - ../pdf-output:/app/pdf-output  # Add this line
```

Restart the services:
```bash
docker-compose down
docker-compose up -d
```

Now PDFs will appear in `pdf-output/` directory in your project root!

## Step 6: Force Regeneration (If Needed)

If you want to regenerate a PDF without changing the markdown content (e.g., after a template update):

```
/speckit.ext.regenerate specs/001-documentation-agent/spec.md
```

This bypasses the deduplication check and forces a fresh render.

## Complete User Workflow Example

Here's a typical workflow as a Spec Kit user:

### 1. Start Backend (Once)
```powershell
.\start.ps1
```

### 2. Configure Extension (Once per workspace)
```
/speckit.ext.setup
```
- API URL: `http://localhost:8000`
- API Key: `dev-key`

### 3. Work on Your Specs

#### Create a new spec:
```bash
mkdir -p specs/003-user-auth
echo "# User Authentication Feature" > specs/003-user-auth/spec.md
echo "" >> specs/003-user-auth/spec.md
echo "## Overview" >> specs/003-user-auth/spec.md
echo "Users need to log in securely." >> specs/003-user-auth/spec.md
```

#### Generate documentation:
Open the file in Spec Kit and run:
```
/speckit.ext.docgen
```

Or just commit it:
```bash
git add specs/003-user-auth/spec.md
git commit -m "Add user auth spec"
```

### 4. Check Status
```
/speckit.ext.status
```

### 5. Get Your PDF

```bash
cd infra
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-3.pdf ../user-auth-spec.pdf
```

Now you have `user-auth-spec.pdf` in your project root! 🎉

## Viewing PDFs in Database

You can also query the database directly to see all generated documents:

```bash
cd infra
docker-compose exec db psql -U docsagent -d docsagent
```

Then run:
```sql
-- View all artifacts
SELECT id, source_path, artifact_type, status FROM artifacts;

-- View all PDF versions
SELECT 
    dv.id, 
    dv.version_no, 
    dv.pdf_path, 
    dv.generated_at,
    a.source_path
FROM doc_versions dv
JOIN artifacts a ON dv.artifact_id = a.id
ORDER BY dv.generated_at DESC;

-- Exit
\q
```

## Troubleshooting

### "Connection refused" when running `/speckit.ext.setup`

**Problem**: Backend is not running

**Solution**:
```bash
cd infra
docker-compose ps
```

If services aren't running:
```bash
docker-compose up -d
```

### "No PDF generated" after `/speckit.ext.docgen`

**Problem**: Validation error or rendering failure

**Solution**: Check backend logs:
```bash
cd infra
docker-compose logs -f backend
```

Look for error messages about missing headings or validation failures.

### Want to see what's happening

**Enable verbose logging**:
```bash
cd infra
docker-compose logs -f backend
```

This shows all API requests and processing steps in real-time.

## Extension Commands Reference

| Command | Description | Usage |
|---------|-------------|-------|
| `/speckit.ext.setup` | Configure backend connection | Run once per workspace |
| `/speckit.ext.docgen` | Generate PDF from active file | Run with spec file open |
| `/speckit.ext.status` | View all artifacts | Run anytime |
| `/speckit.ext.regenerate <path>` | Force regenerate a PDF | When template changes |

## What Gets Processed Automatically?

The extension automatically processes:
- `spec.md`, `requirements.md` - Feature specifications
- `plan.md`, `design.md` - Implementation plans
- `tasks.md` - Task lists (in Kiro workspaces)
- `constitution.md` - Constitutional constraints
- `research.md` - Research notes
- `data-model.md` - Data models
- Files in `/contracts/` - Contract specifications
- `quickstart.md` - Quick start guides
- Any other `.md` files (classified as "other")

## PDF Features

Your generated PDFs include:
- **Cover page** with title, source path, and artifact type badge
- **Abstract** (auto-extracted from first paragraph)
- **Table of contents** with all section headings
- **Grouped sections**:
  - Task sections (with checkboxes)
  - User story sections
  - Design decision sections
  - Other sections (general content)
- **Footer** with source path and commit hash

## Tips for Best Results

1. **Use clear headings** - The system validates that all headings are preserved
2. **Include an overview section** - Becomes your abstract
3. **Use markdown lists for tasks** - Use `- [ ]` or `- [x]` syntax
4. **Write user stories clearly** - Use "As a..., I want..., so that..." format
5. **Commit regularly** - Each commit triggers documentation generation

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│  Documentation Agent - Quick Reference                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Start Backend:                                          │
│    ./start.ps1  (Windows)  or  ./start.sh  (Linux/Mac) │
│                                                          │
│  Configure (once):                                       │
│    /speckit.ext.setup                                    │
│                                                          │
│  Generate PDF:                                           │
│    /speckit.ext.docgen                                   │
│                                                          │
│  Check Status:                                           │
│    /speckit.ext.status                                   │
│                                                          │
│  Get PDF:                                                │
│    docker cp $(docker-compose ps -q backend):\           │
│      /app/pdf-output/artifact-N.pdf ./my-doc.pdf        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

**You're ready to generate professional documentation from your Spec Kit markdown files! 🚀**
