# Start the PDF Visualization Frontend
# This script starts the Vite development server for the frontend

Write-Host "Starting PDF Visualization Frontend..." -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "frontend/node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
    Write-Host ""
}

# Start the frontend development server
Write-Host "Starting frontend development server on http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

Set-Location frontend
npm run dev
