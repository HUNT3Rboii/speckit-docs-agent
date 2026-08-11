# Speckit Auto-AI Extension Installer
# Uninstalls any existing copy, rebuilds, tests, packages, and reinstalls the
# VS Code extension locally.

$ExtensionId = "HUNT3Rboii.speckit-auto-ai"

# The publisher field changed from the placeholder "speckit" to a real one, so
# the extension id changed with it. VS Code treats the old id as a separate
# extension and would happily keep running it alongside the new build; uninstall
# it too, or a machine that installed a pre-rename build ends up with both.
$LegacyExtensionIds = @("speckit.speckit-auto-ai")

# Resolve paths from the script's own location so this works regardless of the
# caller's working directory.
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Speckit Auto-AI Extension Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if code command is available
try {
    $null = Get-Command code -ErrorAction Stop
} catch {
    Write-Host "[FAIL] VS Code 'code' command not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure VS Code is installed and 'code' is in your PATH" -ForegroundColor Yellow
    Write-Host "In VS Code: Ctrl+Shift+P -> 'Shell Command: Install code command in PATH'" -ForegroundColor Yellow
    exit 1
}

# npm is needed for every step below
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] npm not found - install Node.js 20+ (https://nodejs.org/)" -ForegroundColor Red
    exit 1
}

# Navigate to extension directory
Set-Location vscode-extension

# Step 0: Uninstall any existing copy first (ignore failure if not installed)
Write-Host "[1/6] Uninstalling any existing copy..." -ForegroundColor Yellow
foreach ($id in @($ExtensionId) + $LegacyExtensionIds) {
    code --uninstall-extension $id 2>$null
}
Write-Host "[OK] Uninstall step complete (no-op if it wasn't installed)" -ForegroundColor Green
Write-Host ""

Write-Host "[2/6] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "[3/6] Compiling TypeScript..." -ForegroundColor Yellow
npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host "[4/6] Running unit tests..." -ForegroundColor Yellow
npm run test:unit
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Unit tests failed - fix before installing" -ForegroundColor Red
    exit 1
}

Write-Host "[5/6] Linting..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Lint failed" -ForegroundColor Red
    exit 1
}

Write-Host "[6/6] Packaging and installing extension..." -ForegroundColor Yellow
# Remove old .vsix files first so we don't accidentally install a stale one.
Get-ChildItem -Filter "*.vsix" | Remove-Item -Force -ErrorAction SilentlyContinue
npx vsce package
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Packaging failed" -ForegroundColor Red
    exit 1
}

# Find the VSIX file
$vsixFile = Get-ChildItem -Filter "*.vsix" | Select-Object -First 1

if (-not $vsixFile) {
    Write-Host "[FAIL] VSIX file not found" -ForegroundColor Red
    exit 1
}

Write-Host "Installing extension ($($vsixFile.Name))..." -ForegroundColor Yellow
code --install-extension $vsixFile.Name --force
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Installation failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[OK] Reinstall Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Reload VS Code (Ctrl+Shift+P -> 'Developer: Reload Window')" -ForegroundColor White
Write-Host "   or fully restart VS Code so the new build is loaded." -ForegroundColor White
Write-Host "2. Ensure backend is running: .\START-EVERYTHING.ps1" -ForegroundColor White
Write-Host "3. Open a markdown file and save it to test!" -ForegroundColor White
Write-Host ""
Write-Host "View logs: Ctrl+Shift+P -> 'Speckit: Show Extension Logs'" -ForegroundColor Gray
Write-Host ""
