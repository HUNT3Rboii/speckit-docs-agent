# Start Markdown File Watcher
# This script monitors markdown files in your workspace and automatically generates PDFs

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "Starting Markdown File Watcher" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Use current directory as workspace root
$WorkspaceRoot = $PWD
$ApiUrl = "http://localhost:8000"
$ApiKey = "dev-key"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Workspace Root: $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  API URL: $ApiUrl" -ForegroundColor Gray
Write-Host "  API Key: $ApiKey" -ForegroundColor Gray
Write-Host ""

# Set environment variables
$env:SPECKIT_EXT_ROOT = $WorkspaceRoot
$env:SPECKIT_EXT_API_URL = $ApiUrl
$env:SPECKIT_EXT_API_KEY = $ApiKey

Write-Host "Watching for .md file changes..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Start the watcher
$watcherScript = Join-Path $PSScriptRoot "extension\scripts\python\markdown_watcher.py"

try {
    python $watcherScript
} catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure:" -ForegroundColor Yellow
    Write-Host "  1. Python is installed and in PATH" -ForegroundColor Gray
    Write-Host "  2. Backend is running on http://localhost:8000" -ForegroundColor Gray
    Write-Host "  3. You have the required Python packages installed" -ForegroundColor Gray
    exit 1
}
