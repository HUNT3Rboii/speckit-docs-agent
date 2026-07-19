#!/usr/bin/env pwsh
# Quick start script for markdown file watcher
# Run from the backend repository root

param(
    [string]$WorkspaceRoot,
    [string]$ApiUrl = "http://127.0.0.1:8000",
    [string]$ApiKey = "dev-key"
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Documentation Agent File Watcher" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Validate workspace root
if (-not $WorkspaceRoot) {
    Write-Host "Error: Workspace root required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\start-watcher.ps1 -WorkspaceRoot 'C:\Users\MSI\Desktop\testing'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Optional parameters:" -ForegroundColor Yellow
    Write-Host "  -ApiUrl 'http://127.0.0.1:8000'  (default)" -ForegroundColor Gray
    Write-Host "  -ApiKey 'dev-key'                 (default)" -ForegroundColor Gray
    exit 1
}

if (-not (Test-Path $WorkspaceRoot)) {
    Write-Host "Error: Workspace not found: $WorkspaceRoot" -ForegroundColor Red
    exit 1
}

# Check if backend is running
Write-Host "Checking backend connection..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/api/projects" -Method GET -Headers @{
        "Authorization" = "Bearer $ApiKey"
    } -TimeoutSec 5 -UseBasicParsing
    Write-Host "Backend is running!" -ForegroundColor Green
} catch {
    Write-Host "Warning: Backend not reachable at $ApiUrl" -ForegroundColor Yellow
    Write-Host "Start backend first with: docker-compose up -d" -ForegroundColor Gray
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") {
        exit 1
    }
}

Write-Host ""
Write-Host "Starting watcher..." -ForegroundColor Cyan
Write-Host "  Workspace: $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the watcher
$env:SPECKIT_EXT_ROOT = $WorkspaceRoot
$env:SPECKIT_EXT_API_URL = $ApiUrl
$env:SPECKIT_EXT_API_KEY = $ApiKey

$watcherScript = Join-Path $PSScriptRoot "extension\scripts\python\markdown_watcher.py"

try {
    python $watcherScript
} catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
