# Clone and Test in New Environment

Follow these steps to test the Documentation Agent extension in a fresh environment.

## Prerequisites Checklist

- [ ] Docker Desktop installed and running
- [ ] Spec Kit installed (v0.11.9+)
- [ ] Git installed
- [ ] Terminal access

---

## Installation (5 minutes)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd speckit-docs-agent
```

### 2. Start Backend Services

**Windows:**
```powershell
.\start.ps1
```

**Mac/Linux:**
```bash
chmod +x start.sh
./start.sh
```

**Wait for:** "✅ Services are running!" message

### 3. Verify Services Started

```bash
cd infra
docker-compose ps
```

Both services should show "Up" status.

---

## Configure Extension in Spec Kit (1 minute)

### In your Spec Kit workspace:

```
/speckit.ext.setup
```

**Enter:**
- API Base URL: `http://localhost:8000`
- API Key: `dev-key`

---

## Quick Test (2 minutes)

### Create Test Spec

```bash
mkdir -p specs/quick-test
cat > specs/quick-test/spec.md << 'EOF'
# Quick Test Document

## Overview
Testing the Documentation Agent extension.

## Requirements
- Generate PDF
- Store in database
- Verify output

## Success Criteria
- PDF created within 5 seconds
- All sections preserved
- Professional formatting
EOF
```

### Generate PDF

In Spec Kit:
1. Open `specs/quick-test/spec.md`
2. Run: `/speckit.ext.docgen`
3. Wait for success message

### Verify PDF Created

```bash
cd infra
docker-compose exec backend ls -la /app/pdf-output/
```

Should show: `artifact-1.pdf`

### Get the PDF

```bash
docker cp $(docker-compose ps -q backend):/app/pdf-output/artifact-1.pdf ../test-result.pdf
```

### Open and Verify

Open `test-result.pdf` and check:
- [ ] Professional cover page with title
- [ ] Table of contents
- [ ] All 3 sections (Overview, Requirements, Success Criteria)
- [ ] Footer with source path and metadata
- [ ] Clean formatting

---

## ✅ Success!

If your PDF looks good, the extension is working correctly!

---

## Next Steps

- Read [USER-GUIDE.md](USER-GUIDE.md) for complete usage documentation
- Follow [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md) for comprehensive testing
- See [QUICKSTART-USER.md](QUICKSTART-USER.md) for daily usage workflow

---

## Cleanup (Optional)

### Stop Services

```bash
cd infra
docker-compose down
```

### Remove All Data (PDFs + Database)

```bash
docker-compose down -v
```

---

## Troubleshooting

### Services won't start

```bash
# Check Docker is running
docker info

# View logs
cd infra
docker-compose logs backend
docker-compose logs db
```

### Extension not working in Spec Kit

1. Verify extension is in correct location:
   - Global: `~/.speckit/extensions/docs-agent/`
   - Workspace: `.speckit/extensions/docs-agent/`

2. Check `extension.yml` exists

3. Restart Spec Kit

### "Connection refused" error

1. Verify backend is accessible:
   ```bash
   curl http://localhost:8000/api/projects -H "Authorization: Bearer dev-key"
   ```

2. Check API URL in extension config: `http://localhost:8000`

---

**That's it! You've successfully cloned and tested the extension. 🎉**
