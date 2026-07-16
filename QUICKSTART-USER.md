# Quick Start: Testing as a Spec Kit User

**Goal**: Generate a PDF from your markdown spec files in under 5 minutes.

---

## Step 1: Start Backend (1 minute)

Open terminal in this project directory:

**Windows:**
```powershell
.\start.ps1
```

**Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

✅ **Wait for**: "Services are running!" message

---

## Step 2: Configure Extension in Spec Kit (30 seconds)

In your Spec Kit workspace, run:

```
/speckit.ext.setup
```

When prompted:
- **API Base URL**: `http://localhost:8000`
- **API Key**: `dev-key`

✅ **Wait for**: Configuration success message

---

## Step 3: Generate Your First PDF (1 minute)

### Option A: From Existing File (Easiest)

1. Open any markdown spec file (e.g., `specs/001-documentation-agent/spec.md`)
2. Run command:
   ```
   /speckit.ext.docgen
   ```

### Option B: Create New Test File

1. Create file: `specs/test-doc/spec.md`
   ```markdown
   # Test Document
   
   ## Overview
   This is a test.
   
   ## Details
   More content here.
   ```

2. In Spec Kit, open the file and run:
   ```
   /speckit.ext.docgen
   ```

✅ **Wait for**: Success message (should take 3-5 seconds)

---

## Step 4: Get Your PDF (30 seconds)

**Copy PDF to your computer:**

```bash
cd infra
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ../my-spec.pdf
```

✅ **Result**: `my-spec.pdf` appears in your project root

**Open it!** You should see:
- Professional cover page
- Table of contents
- All your markdown sections formatted nicely
- Footer with metadata

---

## Step 5: Check Status (Optional)

In Spec Kit:
```
/speckit.ext.status
```

You'll see a list of all processed documents with their status.

---

## That's It! 🎉

You now have:
- ✅ Backend running with PostgreSQL
- ✅ PDF generated from markdown
- ✅ Document stored in database
- ✅ PDF saved and accessible

---

## What Happens Behind the Scenes

```
Your Markdown → Transform → Validate → Render PDF → Store in DB + Volume
```

1. **Transform**: Converts markdown to structured JSON with title, abstract, sections
2. **Validate**: Checks all headings are present, sections are correctly classified
3. **Render**: Generates PDF with cover, TOC, grouped sections
4. **Store**: Saves PDF path in PostgreSQL, file in Docker volume

---

## Ongoing Usage

### Generate PDF from any file:
1. Open markdown file in Spec Kit
2. Run `/speckit.ext.docgen`
3. Done!

### Or use automatic processing:
Just commit your markdown files:
```bash
git add specs/my-feature/spec.md
git commit -m "Add feature spec"
```

The post-commit hook automatically generates the PDF!

---

## Get PDFs Easily (Recommended Setup)

Edit `infra/docker-compose.yml`:

```yaml
backend:
  volumes:
    - ../backend:/app
    - ../pdf-output:/app/pdf-output  # Add this line
```

Restart:
```bash
cd infra
docker-compose down && docker-compose up -d
```

Now PDFs appear directly in `pdf-output/` folder! 📁

---

## Troubleshooting

### "Connection refused"
Backend isn't running. Run `.\start.ps1` again.

### "Validation error"
Check backend logs:
```bash
cd infra
docker-compose logs backend
```

### Need help?
See detailed guides:
- `USER-GUIDE.md` - Complete user documentation
- `TESTING-CHECKLIST.md` - Full test scenarios
- `SETUP-GUIDE.md` - Detailed setup and troubleshooting

---

## Stop Services

When done testing:
```bash
cd infra
docker-compose down
```

To delete all data (PDFs + database):
```bash
docker-compose down -v
```

---

**Questions? Check the USER-GUIDE.md for detailed instructions!**
