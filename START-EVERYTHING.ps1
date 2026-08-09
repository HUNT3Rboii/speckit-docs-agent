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

# Always operate on the repo this script lives in, not on whatever directory
# the user happened to be in when they ran it.
Set-Location $PSScriptRoot

# Spawned windows/elevated helpers below use whichever PowerShell is
# actually installed - pwsh (7+) isn't present on every machine (e.g. a
# stock Windows install only has the built-in powershell.exe), and
# hardcoding "pwsh" would fail with "term not recognized" on those.
$shellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

# Prerequisite check up front, so a fresh clone gets one clear message instead
# of a confusing failure three steps in.
$missing = @()
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $missing += "Docker Desktop (https://docs.docker.com/desktop/)" }
if (-not (Get-Command npm    -ErrorAction SilentlyContinue)) { $missing += "Node.js 20+ (https://nodejs.org/)" }
if ($missing.Count -gt 0) {
    Write-Host "[FAIL] Missing prerequisites:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "       - $_" -ForegroundColor Red }
    exit 1
}

# `docker compose` (v2 plugin) is what ships with current Docker Desktop;
# `docker-compose` (v1 standalone) still exists on older installs.
$composeExe = 'docker'
$composeSub = @('compose')

# Probe with errors non-terminating: a native command writing to stderr under
# $ErrorActionPreference = "Stop" would otherwise abort the script here.
$previousEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker compose version > $null 2> $null
$hasComposeV2 = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $previousEap

if (-not $hasComposeV2) {
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $composeExe = 'docker-compose'
        $composeSub = @()
    } else {
        Write-Host "[FAIL] Could not run 'docker compose', and 'docker-compose' is not installed." -ForegroundColor Red
        Write-Host "       Docker Desktop is most likely installed but not running - start it and retry." -ForegroundColor Yellow
        exit 1
    }
}

# Compose only auto-loads a .env sitting next to the compose file (infra/.env),
# so the repo-root .env documented in .env.example has to be passed explicitly.
# No .env is a perfectly valid setup - the compose file's ${VAR:-default}
# fallbacks cover it - so this stays optional.
$composeArgs = @()
if (Test-Path ".env") {
    $composeArgs += @('--env-file', (Resolve-Path ".env").Path)
    Write-Host "Using environment overrides from .env" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Speckit Auto-AI - Start Everything" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Backend (Docker)
Write-Host "[1/2] Building and starting Docker backend..." -ForegroundColor Yellow
Push-Location infra
& $composeExe @composeSub @composeArgs up -d --build
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "      [FAIL] Compose failed - is Docker Desktop running?" -ForegroundColor Red
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
# .env.development is gitignored, so a fresh clone doesn't have one. The app
# has the same values baked in as fallbacks (src/config/env.ts), but seeding
# the file makes them visible and editable.
if (-not (Test-Path "frontend/.env.development")) {
    Copy-Item "frontend/.env.example" "frontend/.env.development"
    Write-Host "      Created frontend/.env.development from .env.example" -ForegroundColor Gray
}
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
Start-Process $shellExe -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; Write-Host 'Frontend Dev Server' -ForegroundColor Cyan; Write-Host ''; npm run dev"
Write-Host "      Waiting for frontend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5
Write-Host "      [OK] Frontend started" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Everything Started!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Services:" -ForegroundColor Yellow
Write-Host "  Backend API:  http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend UI:  http://localhost:5173" -ForegroundColor White
Write-Host "  PDF output:   $PSScriptRoot\pdf-output" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Install/reinstall the VS Code extension: .\INSTALL-EXTENSION.ps1" -ForegroundColor White
Write-Host "  2. Open VS Code in a workspace with markdown files" -ForegroundColor White
Write-Host "  3. Save a .md file - the extension does the rest" -ForegroundColor White
Write-Host ""
Write-Host "See README.md for the full walkthrough." -ForegroundColor Gray
Write-Host ""

Write-Host "To Stop:" -ForegroundColor Yellow
Write-Host "  - Close the frontend terminal window" -ForegroundColor White
Write-Host "  - Run: $composeExe $($composeSub -join ' ') -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""
