# Start Docker Backend + Frontend
# The VS Code extension (install via .\INSTALL-EXTENSION.ps1) is what watches
# and processes markdown files now - there is no separate watcher process.

Write-Host ("=" * 80) -ForegroundColor Cyan
Write-Host "Starting Speckit Auto-AI - Backend + Frontend (Docker)" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Cyan
Write-Host ""

# Step 1: Build/start Docker services
# NOTE: --build is required (not optional) since backend/Dockerfile installs
# Node.js + mmdc (Mermaid CLI) for local diagram rendering; a plain `up -d`
# would keep reusing a stale image if that file has changed.
Write-Host "[1/2] Building and starting Docker Backend..." -ForegroundColor Yellow
Push-Location infra
docker-compose up -d --build
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "      [FAIL] docker-compose failed - is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host "      Waiting for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5
Write-Host "      [OK] Docker services started" -ForegroundColor Green
Write-Host ""

# Step 2: Start Frontend
Write-Host "[2/2] Starting Frontend..." -ForegroundColor Yellow
if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "      Installing frontend dependencies (first run)..." -ForegroundColor Gray
    Push-Location frontend
    npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Host "      [FAIL] npm install failed" -ForegroundColor Red
        exit 1
    }
}
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; Write-Host 'Frontend Dev Server' -ForegroundColor Cyan; Write-Host ''; npm run dev"
Write-Host "      Waiting for frontend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5
Write-Host "      [OK] Frontend started" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host ("=" * 80) -ForegroundColor Green
Write-Host "Backend + Frontend Started!" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Green
Write-Host ""

Write-Host "Services:" -ForegroundColor Yellow
Write-Host "  Backend API (Docker):  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Frontend UI:           http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

Write-Host "How to Use:" -ForegroundColor Yellow
Write-Host "  1. Install/reinstall the VS Code extension: .\INSTALL-EXTENSION.ps1" -ForegroundColor White
Write-Host "  2. Open VS Code in a workspace with markdown files" -ForegroundColor White
Write-Host "  3. Save a .md file - the extension detects it, transforms it with" -ForegroundColor White
Write-Host "     whatever AI is active (or rule-based fallback), and submits it" -ForegroundColor White
Write-Host "     to the backend automatically" -ForegroundColor White
Write-Host "  4. Open http://localhost:5173 - the new artifact/PDF will appear" -ForegroundColor White
Write-Host ""

Write-Host "Get PDFs directly from Docker:" -ForegroundColor Yellow
Write-Host "  docker cp infra-backend-1:/tmp/doc-output/ ./my-pdfs/" -ForegroundColor Gray
Write-Host ""

Write-Host "To Stop Services:" -ForegroundColor Yellow
Write-Host "  - Close the Frontend terminal window" -ForegroundColor White
Write-Host "  - Run: docker-compose -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""
