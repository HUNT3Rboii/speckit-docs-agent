# Testing Checklist: Documentation Agent as Spec Kit User

Follow these steps to test the Documentation Agent extension in your Spec Kit environment.

## ✅ Pre-Test Setup

### 1. Verify Prerequisites
- [ ] Spec Kit is installed (version 0.11.9+)
- [ ] Docker Desktop is installed and running
- [ ] You have a Spec Kit workspace with markdown files

### 2. Start the Backend
```powershell
# From this project directory
.\start.ps1
```

**Expected Output:**
```
✅ Services are running!
📊 Service URLs:
   Backend API: http://localhost:8000
   PostgreSQL:  localhost:5432
```

- [ ] Backend is running on port 8000
- [ ] PostgreSQL is running on port 5432

### 3. Verify Services
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

- [ ] Both services show "Up" status
- [ ] Database shows "(healthy)"

---

## 🧪 Test Scenario 1: Extension Setup

### In Spec Kit:

1. **Run setup command:**
```
/speckit.ext.setup
```

2. **Provide configuration:**
   - API Base URL: `http://localhost:8000`
   - API Key: `dev-key`

**Expected Result:**
- [ ] Configuration saved successfully
- [ ] Project registered with backend
- [ ] No error messages

**Verify in database:**
```bash
cd infra
docker-compose exec db psql -U docsagent -d docsagent -c "SELECT * FROM projects;"
```

- [ ] Your project appears in the projects table

---

## 🧪 Test Scenario 2: Generate PDF from Existing File

### In Spec Kit:

1. **Open an existing markdown spec:**
   - Navigate to `specs/001-documentation-agent/spec.md`
   - Make sure it's the active editor tab

2. **Run docgen command:**
```
/speckit.ext.docgen
```

**Expected Result:**
- [ ] Command executes without errors
- [ ] You see a success message
- [ ] Processing completes in < 10 seconds

**Verify PDF was created:**
```bash
cd infra
docker-compose exec backend ls -la /app/pdf-output/
```

- [ ] You see `artifact-1.pdf` (or similar)
- [ ] File size is > 0 bytes

**Verify in database:**
```bash
docker-compose exec db psql -U docsagent -d docsagent -c "SELECT id, source_path, status FROM artifacts;"
```

- [ ] Artifact appears with status "rendered"

```bash
docker-compose exec db psql -U docsagent -d docsagent -c "SELECT id, pdf_path, version_no FROM doc_versions;"
```

- [ ] PDF path is recorded in doc_versions table

---

## 🧪 Test Scenario 3: Check Status

### In Spec Kit:

1. **Run status command:**
```
/speckit.ext.status
```

**Expected Result:**
- [ ] List of all processed artifacts is shown
- [ ] Each artifact shows: path, type, status
- [ ] Previously generated artifact shows "rendered" status

---

## 🧪 Test Scenario 4: Create New Spec and Auto-Generate

### In Spec Kit workspace:

1. **Create a new spec directory:**
```bash
mkdir -p specs/999-test-feature
```

2. **Create a new spec file:**
```bash
cat > specs/999-test-feature/spec.md << 'EOF'
# Test Feature Specification

This is a test feature to verify the documentation agent works correctly.

## Overview

The documentation agent should automatically process this markdown file and generate a professional PDF document.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST generate a PDF from this markdown file
- **FR-002**: The PDF MUST include a cover page
- **FR-003**: The PDF MUST include a table of contents

## Success Criteria

- PDF is generated within 10 seconds
- PDF includes all section headings
- PDF is stored in the database with metadata

## Assumptions

- The backend services are running
- The extension is configured correctly
- WeasyPrint is working properly
EOF
```

3. **Generate documentation using agent command:**

Open the file in Spec Kit, then:
```
/speckit.ext.docgen
```

**Expected Result:**
- [ ] PDF is generated successfully
- [ ] No validation errors
- [ ] Status command shows the new artifact

**OR use git commit hook:**

```bash
git add specs/999-test-feature/spec.md
git commit -m "Test: Add test feature spec for documentation agent"
```

**Expected Result:**
- [ ] Commit succeeds
- [ ] Post-commit hook triggers
- [ ] PDF is generated automatically

**Verify the new PDF:**
```bash
cd infra
docker-compose exec backend ls -la /app/pdf-output/
```

- [ ] New artifact PDF appears (e.g., `artifact-2.pdf`)

---

## 🧪 Test Scenario 5: Access and View PDF

### Method 1: Copy PDF to Local Machine

```bash
cd infra
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-2.pdf ../test-feature-spec.pdf
```

- [ ] PDF is copied to project root
- [ ] Open `test-feature-spec.pdf` in a PDF viewer
- [ ] PDF contains:
  - [ ] Cover page with title
  - [ ] Source path metadata
  - [ ] Artifact type badge
  - [ ] Table of contents
  - [ ] All section headings from the markdown
  - [ ] Grouped sections (if applicable)
  - [ ] Footer with source and commit info

### Method 2: Set Up Local Mount (Recommended)

1. **Edit `infra/docker-compose.yml`:**

Add under backend volumes:
```yaml
volumes:
  - ../backend:/app
  - ../pdf-output:/app/pdf-output  # Add this line
```

2. **Recreate services:**
```bash
cd infra
docker-compose down
docker-compose up -d
```

3. **Generate a new PDF:**
```
/speckit.ext.docgen
```

4. **Check local directory:**
```bash
ls -la pdf-output/
```

- [ ] PDFs appear directly in `pdf-output/` folder
- [ ] You can open them directly from your file explorer

---

## 🧪 Test Scenario 6: Deduplication (No Changes)

### In Spec Kit:

1. **Run docgen on the same file again (no changes):**
```
/speckit.ext.docgen
```

**Expected Result:**
- [ ] Command succeeds quickly (< 1 second)
- [ ] Response indicates "skipped" (content unchanged)
- [ ] No new PDF version is created

**Verify in database:**
```bash
cd infra
docker-compose exec db psql -U docsagent -d docsagent -c "SELECT artifact_id, COUNT(*) FROM doc_versions GROUP BY artifact_id;"
```

- [ ] Version count hasn't increased for unchanged artifact

---

## 🧪 Test Scenario 7: Regenerate After Changes

### In Spec Kit workspace:

1. **Edit the test spec:**
```bash
cat >> specs/999-test-feature/spec.md << 'EOF'

## Additional Section

This is a new section added to test version incrementing.
EOF
```

2. **Generate updated PDF:**

Open the file in Spec Kit, then:
```
/speckit.ext.docgen
```

**Expected Result:**
- [ ] New version is created
- [ ] PDF includes the new section
- [ ] Version number is incremented

**Verify in database:**
```bash
docker-compose exec db psql -U docsagent -d docsagent -c "SELECT id, version_no, generated_at FROM doc_versions ORDER BY generated_at;"
```

- [ ] Two versions exist for the same artifact
- [ ] Version numbers are 1 and 2

---

## 🧪 Test Scenario 8: Force Regeneration

### In Spec Kit:

1. **Run regenerate command:**
```
/speckit.ext.regenerate specs/999-test-feature/spec.md
```

**Expected Result:**
- [ ] New version is created even without content changes
- [ ] Bypasses deduplication check
- [ ] Version number increments

---

## 🔍 Debugging Checklist

If something doesn't work:

### Check Backend Logs
```bash
cd infra
docker-compose logs -f backend
```

Look for:
- [ ] No Python errors
- [ ] API requests are being received
- [ ] No validation errors
- [ ] No rendering errors

### Check Database Connection
```bash
docker-compose exec backend python -c "from app.repositories.postgres_artifact_repo import PostgresArtifactRepository; repo = PostgresArtifactRepository(); print('Connected!')"
```

- [ ] Prints "Connected!" without errors

### Check PDF Generation
```bash
docker-compose exec backend python -c "from weasyprint import HTML; print('WeasyPrint OK')"
```

- [ ] Prints "WeasyPrint OK" without errors

### Check API Endpoint
```bash
curl http://localhost:8000/api/projects -H "Authorization: Bearer dev-key"
```

- [ ] Returns JSON with projects list
- [ ] No 401 Unauthorized error

---

## ✅ Success Criteria

You've successfully tested the Documentation Agent when:

- [x] Backend services start and run healthily
- [x] Extension setup completes without errors
- [x] PDF is generated from existing markdown file
- [x] PDF is stored in Docker volume
- [x] Metadata is recorded in PostgreSQL database
- [x] Status command shows all artifacts
- [x] New spec file triggers PDF generation
- [x] PDF contains cover page, TOC, and all sections
- [x] Deduplication works (unchanged content is skipped)
- [x] Version incrementing works (changed content creates new version)
- [x] PDFs can be accessed and viewed
- [x] All database tables are populated correctly

---

## 📊 Final Verification

Run this query to see everything working together:

```sql
-- In PostgreSQL
docker-compose exec db psql -U docsagent -d docsagent

SELECT 
    p.name as project_name,
    a.source_path,
    a.artifact_type,
    a.status,
    COUNT(dv.id) as version_count,
    MAX(dv.generated_at) as latest_version
FROM projects p
JOIN artifacts a ON a.project_id = p.id
LEFT JOIN doc_versions dv ON dv.artifact_id = a.id
GROUP BY p.name, a.source_path, a.artifact_type, a.status
ORDER BY latest_version DESC;
```

**Expected Result:**
- [ ] Shows all your test artifacts
- [ ] Shows version counts
- [ ] Shows timestamps
- [ ] All artifacts have status "rendered"

---

**🎉 If all checks pass, your Documentation Agent is working perfectly in Spec Kit!**
