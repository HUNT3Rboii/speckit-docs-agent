#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start everything: the Speckit Auto-AI backend (Docker) and the frontend
    dashboard (Vite dev server).

.DESCRIPTION
    Builds and starts the Docker backend (FastAPI + PostgreSQL) on
    http://localhost:8000, then starts the frontend dashboard on
    http://localhost:5173 (installing its dependencies first if this is a
    fresh clone). The VS Code extension is the only supported processing
    client: it detects whatever AI provider is already active in your IDE
    (Copilot/Claude/etc.) and submits directly to the backend's
    /api/process endpoint -- no separate AI bridge or file-watcher process
    is needed. Install/reinstall it with .\INSTALL-EXTENSION.ps1.

.NOTES
    Rebuilds the backend image unconditionally (--build) since
    backend/Dockerfile installs Node.js + mmdc (Mermaid CLI) for local
    diagram rendering; a plain `docker-compose up -d` would keep reusing a
    stale image if that file has changed.
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Speckit Auto-AI - Start Everything" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Backend (Docker)
Write-Host "[1/2] Building and starting Docker backend..." -ForegroundColor Yellow
Push-Location infra
docker-compose up -d --build
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "      [FAIL] docker-compose failed - is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host "      Waiting for backend to become healthy..." -ForegroundColor Gray
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($healthy) {
    Write-Host "      [OK] Backend is healthy" -ForegroundColor Green
} else {
    Write-Host "      [WARN] Backend did not respond yet - check: docker logs infra-backend-1" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Frontend
Write-Host "[2/2] Starting frontend..." -ForegroundColor Yellow
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

# Optional friendly-hostname reverse proxy (http://speckit.local instead of
# http://localhost:5173). Opt-in: only starts it if the one-time hosts-file
# entry is already present, otherwise skips silently and just prints a tip.
$hostsPath = "$env:WINDIR\System32\drivers\etc\hosts"
$hasFriendlyHost = (Test-Path $hostsPath) -and (Select-String -Path $hostsPath -Pattern "speckit\.local" -Quiet -ErrorAction SilentlyContinue)
if ($hasFriendlyHost) {
    Write-Host "      Starting friendly-URL proxy (http://speckit.local -> :5173)..." -ForegroundColor Green
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev:proxy"
} else {
    Write-Host "      Tip: run as Administrator to use http://speckit.local instead of a port:" -ForegroundColor DarkGray
    Write-Host "        Add-Content `"$hostsPath`" `"`n127.0.0.1  speckit.local`"" -ForegroundColor DarkGray
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Everything Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Services:" -ForegroundColor Yellow
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor White
if ($hasFriendlyHost) {
    Write-Host "  Frontend UI:  http://speckit.local (or http://localhost:5173)" -ForegroundColor White
} else {
    Write-Host "  Frontend UI:  http://localhost:5173" -ForegroundColor White
}
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Install/reinstall the VS Code extension: .\INSTALL-EXTENSION.ps1" -ForegroundColor White
Write-Host "  2. Open VS Code in a workspace with markdown files" -ForegroundColor White
Write-Host "  3. Save a .md file - the extension does the rest" -ForegroundColor White
Write-Host ""
Write-Host "See README.md for the full walkthrough." -ForegroundColor Gray
Write-Host ""

Write-Host "To Stop:" -ForegroundColor Yellow
Write-Host "  - Close the frontend (and proxy, if started) terminal windows" -ForegroundColor White
Write-Host "  - Run: docker-compose -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""
