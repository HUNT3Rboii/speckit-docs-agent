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

# Optional friendly-hostname reverse proxy (http://speckit.local instead of
# http://localhost:5173). Opt-in: only starts it if the one-time hosts-file
# entry is already present, otherwise skips silently and just prints a tip.
$hostsPath = "$env:WINDIR\System32\drivers\etc\hosts"
$hasFriendlyHost = (Test-Path $hostsPath) -and (Select-String -Path $hostsPath -Pattern "speckit\.local" -Quiet -ErrorAction SilentlyContinue)
if ($hasFriendlyHost) {
    Write-Host "Starting friendly-URL proxy (http://speckit.local -> :5173)..." -ForegroundColor Green
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev:proxy"
} else {
    Write-Host "Tip: run as Administrator to use http://speckit.local instead of a port:" -ForegroundColor DarkGray
    Write-Host "  Add-Content `"$hostsPath`" `"`n127.0.0.1  speckit.local`"" -ForegroundColor DarkGray
}

# Start the frontend development server
Write-Host "Starting frontend development server on http://localhost:5173" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

Set-Location frontend
npm run dev
