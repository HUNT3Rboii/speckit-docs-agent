#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start all services for the Documentation Agent with VS Code Copilot integration
    
.DESCRIPTION
    This script starts:
    1. Docker backend (if not running)
    2. AI Bridge with workspace directory set
    3. File watcher with correct root directory
    
.NOTES
    Press Ctrl+C in each terminal to stop services when done
#>

$ErrorActionPreference = "Stop"
$WorkspaceDir = "C:\Users\MSI\test"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Documentation Agent - Start All Services" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check workspace directory exists
if (-not (Test-Path $WorkspaceDir)) {
    Write-Host "❌ Workspace directory not found: $WorkspaceDir" -ForegroundColor Red
    Write-Host "Creating it now..." -ForegroundColor Yellow
    New-Item -Path $WorkspaceDir -ItemType Directory -Force | Out-Null
    Write-Host "✅ Created workspace directory" -ForegroundColor Green
}

# Step 1: Check Docker services
Write-Host "Step 1: Checking Docker services..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" 2>$null
if ($containers -match "infra-backend-1" -and $containers -match "infra-db-1") {
    Write-Host "✅ Docker services are running" -ForegroundColor Green
} else {
    Write-Host "⚠️  Docker services not running. Starting them..." -ForegroundColor Yellow
    Push-Location infra
    docker-compose up -d
    Pop-Location
    Start-Sleep -Seconds 5
    Write-Host "✅ Docker services started" -ForegroundColor Green
}

Write-Host ""

# Step 2: Start AI Bridge
Write-Host "Step 2: Starting AI Bridge..." -ForegroundColor Yellow
Write-Host "This will open a NEW terminal window for the AI Bridge" -ForegroundColor Cyan
Write-Host ""

$bridgeScript = @"
`$env:AI_WORKSPACE_DIR="$WorkspaceDir"
Write-Host "🚀 Starting AI Bridge with workspace: $WorkspaceDir" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
python backend/copilot_bridge.py
"@

$bridgeScriptPath = "$env:TEMP\start-bridge-$PID.ps1"
$bridgeScript | Out-File -FilePath $bridgeScriptPath -Encoding UTF8

Start-Process pwsh -ArgumentList "-NoExit", "-File", $bridgeScriptPath

Write-Host "✅ AI Bridge starting in new terminal" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Step 3: Start File Watcher
Write-Host "Step 3: Starting File Watcher..." -ForegroundColor Yellow
Write-Host "This will open a NEW terminal window for the Watcher" -ForegroundColor Cyan
Write-Host ""

$watcherScript = @"
`$env:SPECKIT_EXT_ROOT="$WorkspaceDir"
Write-Host "👁️  Starting File Watcher for: $WorkspaceDir" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
python extension/scripts/python/markdown_watcher.py
"@

$watcherScriptPath = "$env:TEMP\start-watcher-$PID.ps1"
$watcherScript | Out-File -FilePath $watcherScriptPath -Encoding UTF8

Start-Process pwsh -ArgumentList "-NoExit", "-File", $watcherScriptPath

Write-Host "✅ File Watcher starting in new terminal" -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ All Services Started!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "🐳 Backend API:    http://localhost:8000" -ForegroundColor White
Write-Host "🤖 AI Bridge:      http://localhost:5555" -ForegroundColor White
Write-Host "👁️  Watcher:        Monitoring $WorkspaceDir" -ForegroundColor White
Write-Host ""

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open VS Code with workspace: $WorkspaceDir" -ForegroundColor White
Write-Host "  2. Create or edit a .md file in that workspace" -ForegroundColor White
Write-Host "  3. Save it (Ctrl+S)" -ForegroundColor White
Write-Host "  4. Watch the AI Bridge terminal for instructions" -ForegroundColor White
Write-Host "  5. Use Copilot Chat to process AI requests (optional)" -ForegroundColor White
Write-Host ""

Write-Host "To Stop Services:" -ForegroundColor Yellow
Write-Host "  - Press Ctrl+C in the Bridge terminal" -ForegroundColor White
Write-Host "  - Press Ctrl+C in the Watcher terminal" -ForegroundColor White
Write-Host "  - Run: docker-compose -f infra/docker-compose.yml down" -ForegroundColor White
Write-Host ""

Write-Host "Documentation:" -ForegroundColor Yellow
Write-Host "  - VSCODE-COPILOT-READY.md  (Quick start)" -ForegroundColor White
Write-Host "  - RESTART-SERVICES.md      (Manual restart)" -ForegroundColor White
Write-Host "  - SETUP-VSCODE-COPILOT.md  (Full setup guide)" -ForegroundColor White
Write-Host ""
