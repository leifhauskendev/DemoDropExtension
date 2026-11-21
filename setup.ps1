# Installs (or updates) DemoDrop into %LOCALAPPDATA%\Programs\DemoDrop and runs
# install.ps1 from there, so the unzipped download can be deleted afterwards.
# Started by Install.cmd or get-demodrop.ps1.

param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'

$Target = Join-Path $env:LOCALAPPDATA 'Programs\DemoDrop'
$Items  = 'extension', 'host', 'install.ps1', 'uninstall.ps1', 'README.md', 'LICENSE'

$source = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\')
if ($source -ne $Target.TrimEnd('\')) {
  Write-Host "Installing DemoDrop to $Target"
  New-Item -ItemType Directory -Force $Target | Out-Null
  foreach ($item in $Items) {
    $from = Join-Path $source $item
    if (-not (Test-Path $from)) { continue }
    $to = Join-Path $Target $item
    # Replace old files so updates don't leave stale ones behind; the
    # generated helper files are recreated by install.ps1.
    if (Test-Path $to) { Remove-Item $to -Recurse -Force }
    Copy-Item $from $to -Recurse -Force
  }
}

# Files from a downloaded zip are marked as "from the internet"; clear that so
# PowerShell and Node run them without prompts.
Get-ChildItem $Target -Recurse -File | Unblock-File

& (Join-Path $Target 'install.ps1') -NoBrowser:$NoBrowser
