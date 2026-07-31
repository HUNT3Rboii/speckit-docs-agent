#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start the Speckit Auto-AI backend (Docker).

.DESCRIPTION
    Builds and starts the Docker backend (FastAPI + PostgreSQL) on
    http://localhost:8000. The VS Code extension is the only supported
    client now: it detects whatever AI provider is already active in your
    IDE (Copilot/Claude/etc.) and submits directly to the backend's
    /api/process endpoint -- no separate AI bridge or file-watcher process
    is needed. Install/reinstall it with .\INSTALL-EXTENSION.ps1.

.NOTES
    Rebuilds unconditionally (--build) since backend/Dockerfile installs
    Node.js + mmdc (Mermaid CLI) for local diagram rendering; a plain
    `docker-compose up -d` would keep reusing a stale image if that file
    has changed.
#>

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Speckit Auto-AI - Start Backend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Building and starting Docker services..." -ForegroundColor Yellow
Push-Location infra
docker-compose up -d --build
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] docker-compose failed - is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Waiting for backend to become healthy..." -ForegroundColor Yellow
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
    Write-Host "[OK] Backend is healthy" -ForegroundColor Green
} else {
    Write-Host "[WARN] Backend did not respond yet - check: docker logs infra-backend-1" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Backend Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Backend API:    http://localhost:8000" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Install/reinstall the VS Code extension: .\INSTALL-EXTENSION.ps1" -ForegroundColor White
Write-Host "  2. Open VS Code in a workspace with markdown files" -ForegroundColor White
Write-Host "  3. Save a .md file - the extension does the rest" -ForegroundColor White
Write-Host ""
Write-Host "See README.md for the full walkthrough." -ForegroundColor Gray
Write-Host ""

Write-Host "To Stop:" -ForegroundColor Yellow
Write-Host "  docker-compose -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""
