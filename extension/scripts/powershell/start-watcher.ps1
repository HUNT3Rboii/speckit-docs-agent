#!/usr/bin/env pwsh
# Start the markdown file watcher

param(
    [string]$WorkspaceRoot = $PWD,
    [string]$ApiUrl = "http://127.0.0.1:8000",
    [string]$ApiKey = "dev-key"
)

Write-Host "Starting Markdown File Watcher..." -ForegroundColor Cyan
Write-Host "  Workspace: $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "Watching for .md file changes (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host ""

$env:SPECKIT_EXT_ROOT = $WorkspaceRoot
$env:SPECKIT_EXT_API_URL = $ApiUrl
$env:SPECKIT_EXT_API_KEY = $ApiKey

$watcherScript = Join-Path $PSScriptRoot "..\python\markdown_watcher.py"

try {
    python $watcherScript
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
