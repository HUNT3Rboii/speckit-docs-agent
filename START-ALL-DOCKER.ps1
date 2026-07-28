# Start all services: Docker Backend + Frontend + File Watcher
# Complete setup for the Documentation Agent with Docker

Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host "Starting Documentation Agent - Full Stack (Docker)" -ForegroundColor Cyan
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

$WorkspaceRoot = $PWD

# Step 1: Check/Start Docker services
Write-Host "[1/3] Checking Docker Backend..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" 2>$null
if ($containers -match "infra-backend-1" -and $containers -match "infra-db-1") {
    Write-Host "      ✅ Docker services are running" -ForegroundColor Green
} else {
    Write-Host "      ⚠️  Docker services not running. Starting them..." -ForegroundColor Yellow
    Push-Location infra
    docker-compose up -d
    Pop-Location
    Write-Host "      Waiting for services to initialize..." -ForegroundColor Gray
    Start-Sleep -Seconds 10
    Write-Host "      ✅ Docker services started" -ForegroundColor Green
}
Write-Host ""

# Step 2: Start Frontend
Write-Host "[2/3] Starting Frontend..." -ForegroundColor Yellow
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; Write-Host '🎨 Frontend Dev Server' -ForegroundColor Cyan; Write-Host ''; npm run dev"
Write-Host "      Waiting for frontend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5
Write-Host "      ✅ Frontend started" -ForegroundColor Green
Write-Host ""

# Step 3: Start File Watcher
Write-Host "[3/3] Starting File Watcher..." -ForegroundColor Yellow
$watcherScript = @"
`$env:SPECKIT_EXT_ROOT = '$WorkspaceRoot'
`$env:SPECKIT_EXT_API_URL = 'http://localhost:8000'
`$env:SPECKIT_EXT_API_KEY = 'dev-key'

Write-Host '👁️  Markdown File Watcher' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Monitoring: $WorkspaceRoot' -ForegroundColor Gray
Write-Host 'Backend: http://localhost:8000 (Docker)' -ForegroundColor Gray
Write-Host ''
Write-Host 'Watching for .md file changes...' -ForegroundColor Green
Write-Host 'Press Ctrl+C to stop' -ForegroundColor Yellow
Write-Host ''

python '$WorkspaceRoot\extension\scripts\python\markdown_watcher.py'
"@

$watcherScriptPath = "$env:TEMP\start-watcher-docker.ps1"
$watcherScript | Out-File -FilePath $watcherScriptPath -Encoding UTF8
Start-Process pwsh -ArgumentList "-NoExit", "-File", $watcherScriptPath

Write-Host "      ✅ File Watcher started" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "=" * 80 -ForegroundColor Green
Write-Host "All Services Started Successfully!" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Green
Write-Host ""

Write-Host "Services:" -ForegroundColor Yellow
Write-Host "  🐳 Backend API (Docker):  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  🎨 Frontend UI:           http://localhost:5173" -ForegroundColor Cyan
Write-Host "  👁️  File Watcher:          Monitoring $WorkspaceRoot" -ForegroundColor Cyan
Write-Host ""

Write-Host "How to Use:" -ForegroundColor Yellow
Write-Host "  1. Open frontend at http://localhost:5173" -ForegroundColor White
Write-Host "  2. Create or edit any .md file in this directory" -ForegroundColor White
Write-Host "  3. Save the file (Ctrl+S)" -ForegroundColor White
Write-Host "  4. Watch the Watcher terminal - it will process the file" -ForegroundColor White
Write-Host "  5. Refresh the frontend - new artifact will appear!" -ForegroundColor White
Write-Host ""

Write-Host "Example - Create a test file:" -ForegroundColor Yellow
Write-Host @"
  # Create test-spec.md
  @'
  # Test Specification
  
  ## Requirements
  - User authentication
  - Data validation
  
  ## Design
  Use JWT tokens for authentication.
  '@  | Out-File test-spec.md
"@ -ForegroundColor Gray
Write-Host ""

Write-Host "Get PDFs from Docker:" -ForegroundColor Yellow
Write-Host "  docker cp infra-backend-1:/tmp/doc-output/ ./my-pdfs/" -ForegroundColor Gray
Write-Host ""

Write-Host "To Stop Services:" -ForegroundColor Yellow
Write-Host "  - Close the Frontend and Watcher terminal windows" -ForegroundColor White
Write-Host "  - Run: docker-compose -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""
