# Start Markdown File Watcher (for Docker Backend)
# This script monitors markdown files in your workspace and automatically generates PDFs

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "Starting Markdown File Watcher (Docker Backend)" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

# Use current directory as workspace root (where your .md files are)
$WorkspaceRoot = $PWD
$ApiUrl = "http://localhost:8000"  # Docker backend
$ApiKey = "dev-key"

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Workspace Root: $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  API URL: $ApiUrl (Docker)" -ForegroundColor Gray
Write-Host "  API Key: $ApiKey" -ForegroundColor Gray
Write-Host ""

# Check if Docker backend is running
Write-Host "Checking Docker backend..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/docs" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✅ Docker backend is running" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Docker backend is NOT running!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start the Docker backend first:" -ForegroundColor Yellow
    Write-Host "  cd infra" -ForegroundColor Gray
    Write-Host "  docker-compose up -d" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""

# Set environment variables
$env:SPECKIT_EXT_ROOT = $WorkspaceRoot
$env:SPECKIT_EXT_API_URL = $ApiUrl
$env:SPECKIT_EXT_API_KEY = $ApiKey

Write-Host "Watching for .md file changes..." -ForegroundColor Green
Write-Host "  - Edit any .md file in: $WorkspaceRoot" -ForegroundColor Gray
Write-Host "  - Save it (Ctrl+S)" -ForegroundColor Gray
Write-Host "  - PDF will be generated automatically!" -ForegroundColor Gray
Write-Host ""
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
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Make sure Python is installed: python --version" -ForegroundColor Gray
    Write-Host "  2. Make sure Docker backend is running: docker ps" -ForegroundColor Gray
    Write-Host "  3. Test backend API: curl http://localhost:8000/docs" -ForegroundColor Gray
    exit 1
}
