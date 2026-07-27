# Speckit Auto-AI Extension Installer
# Installs the VS Code extension locally

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Speckit Auto-AI Extension Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if code command is available
try {
    $null = Get-Command code -ErrorAction Stop
} catch {
    Write-Host "❌ VS Code 'code' command not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure VS Code is installed and 'code' is in your PATH" -ForegroundColor Yellow
    Write-Host "In VS Code: Ctrl+Shift+P → 'Shell Command: Install code command in PATH'" -ForegroundColor Yellow
    exit 1
}

# Navigate to extension directory
Set-Location vscode-extension

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "🔨 Compiling TypeScript..." -ForegroundColor Yellow
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Packaging extension..." -ForegroundColor Yellow
npx vsce package
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Packaging failed" -ForegroundColor Red
    exit 1
}

# Find the VSIX file
$vsixFile = Get-ChildItem -Filter "*.vsix" | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "❌ VSIX file not found" -ForegroundColor Red
    exit 1
}

Write-Host "📥 Installing extension..." -ForegroundColor Yellow
code --install-extension $vsixFile.Name
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Installation failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Installation Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Reload VS Code (Ctrl+Shift+P → 'Developer: Reload Window')" -ForegroundColor White
Write-Host "2. Ensure backend is running: .\START-EVERYTHING.ps1" -ForegroundColor White
Write-Host "3. Open a markdown file and save it to test!" -ForegroundColor White
Write-Host ""
Write-Host "View logs: Ctrl+Shift+P → 'Speckit: Show Extension Logs'" -ForegroundColor Gray
Write-Host ""
