# Installs the standalone VSIX into VS Code.
#
# Run this from a terminal OUTSIDE VS Code, with every VS Code window closed.
# That is not a nicety: an extension whose folder is being read by a running
# window cannot be replaced on Windows, and a half-finished install leaves the
# extension registry pointing at a directory that no longer exists - which VS
# Code reports forever after as "Please restart VS Code before reinstalling".
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-standalone.ps1
#
# Pass -Package to rebuild and repackage the VSIX first.

param(
    [switch]$Package
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtensionId = 'HUNT3Rboii.colophon'
$ExtensionsDir = Join-Path $env:USERPROFILE '.vscode\extensions'

Set-Location $RepoRoot

if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] The 'code' command is not on PATH." -ForegroundColor Red
    Write-Host "       In VS Code: Ctrl+Shift+P -> 'Shell Command: Install code command in PATH'" -ForegroundColor Yellow
    exit 1
}

# A running window is the one thing that makes every step below fail.
$running = @(Get-Process Code -ErrorAction SilentlyContinue)
if ($running.Count -gt 0) {
    Write-Host "[FAIL] VS Code is running ($($running.Count) process(es))." -ForegroundColor Red
    Write-Host "       Save your work, close every VS Code window, and run this again" -ForegroundColor Yellow
    Write-Host "       from an ordinary PowerShell - not from VS Code's own terminal." -ForegroundColor Yellow
    exit 1
}

if ($Package) {
    Write-Host '[1/3] Building and packaging...' -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Host '[FAIL] Build failed' -ForegroundColor Red; exit 1 }
    npx --yes @vscode/vsce package --target win32-x64
    if ($LASTEXITCODE -ne 0) { Write-Host '[FAIL] Packaging failed' -ForegroundColor Red; exit 1 }
} else {
    Write-Host '[1/3] Using the VSIX already in the repository root' -ForegroundColor Yellow
}

$vsix = Get-ChildItem -Path $RepoRoot -Filter 'colophon-*.vsix' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $vsix) {
    Write-Host '[FAIL] No VSIX found. Re-run with -Package.' -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Installing $($vsix.Name)..." -ForegroundColor Yellow
code --install-extension $vsix.FullName --force

if ($LASTEXITCODE -eq 0) {
    Write-Host '[3/3] Nothing to repair.' -ForegroundColor Yellow
} else {
    # Only reached when VS Code refuses. The usual cause is a record in
    # extensions.json pointing at a folder a failed install already deleted:
    # VS Code reads that as "installed, pending removal" and answers every
    # further install with "Please restart VS Code before reinstalling".
    #
    # Editing that file is a last resort - it is VS Code's own state, and it
    # lists every extension the user has - so it happens only after a real
    # failure, only for this extension's id, and only for records whose folder
    # is genuinely missing.
    Write-Host '[3/3] Install refused - checking the extension registry for a stale record...' -ForegroundColor Yellow

    $registry = Join-Path $ExtensionsDir 'extensions.json'
    if (-not (Test-Path $registry)) {
        Write-Host '[FAIL] Installation failed, and there is no extensions.json to repair.' -ForegroundColor Red
        exit 1
    }

    # Windows PowerShell hands the whole JSON array to the pipeline as a single
    # object, so it is collected with += rather than @() - wrapping it produces
    # an array of one array, and every property read below then returns a
    # collection instead of a string.
    $entries = @()
    $entries += (Get-Content $registry -Raw | ConvertFrom-Json)

    $live = @()
    $dropped = 0
    foreach ($entry in $entries) {
        $location = $entry.relativeLocation
        $isOurs = $entry.identifier.id -eq $ExtensionId
        $missing = [string]::IsNullOrWhiteSpace($location) -or
            -not (Test-Path (Join-Path $ExtensionsDir $location))

        if ($isOurs -and $missing) {
            $dropped++
        } else {
            $live += $entry
        }
    }

    if ($dropped -eq 0) {
        Write-Host '[FAIL] Installation failed, and no stale record explains it.' -ForegroundColor Red
        Write-Host '       Check that every VS Code process really has exited.' -ForegroundColor Yellow
        exit 1
    }

    $backup = "$registry.bak"
    Copy-Item $registry $backup -Force

    # -Compress on a single surviving record yields an object, not an array, so
    # the brackets are re-added by hand; and the file must have no BOM, because
    # VS Code parses it with JSON.parse, which rejects one.
    $json = $live | ConvertTo-Json -Depth 20 -Compress
    if ($live.Count -le 1) { $json = "[$json]" }
    [System.IO.File]::WriteAllText($registry, $json, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host "      removed $dropped stale record(s); previous file kept at $backup" -ForegroundColor Gray

    code --install-extension $vsix.FullName --force
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[FAIL] Installation still failed. Restore with:' -ForegroundColor Red
        Write-Host "       Copy-Item '$backup' '$registry' -Force" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ''
Write-Host '[OK] Installed.' -ForegroundColor Green
Write-Host 'Open VS Code and look for the Colophon icon in the Activity Bar.' -ForegroundColor White
