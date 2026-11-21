# Sets up the DemoDrop helper from this folder (current user only, no admin needed):
#   1. makes sure Node.js 23.8+ is installed (installs Node LTS with winget if not)
#   2. registers the helper with every supported browser
#   3. opens your browser's extensions page so you can load the extension
# Run it again any time you move this folder or reinstall Node.

param(
  [switch]$NoBrowser  # skip opening the extensions page at the end
)

$ErrorActionPreference = 'Stop'

$HostName    = 'com.leifhauskendev.demodrop'
$ExtensionId = 'flmpmjjhpglklbianbfhacdipkppilnp'  # fixed by the "key" in extension/manifest.json
$HostDir     = Join-Path $PSScriptRoot 'host'
$ExtDir      = Join-Path $PSScriptRoot 'extension'

# Registry locations each browser reads native messaging hosts from.
$BrowserKeys = @(
  'Opera Software\Opera GX Stable',
  'Opera Software\Opera Stable',
  'Google\Chrome',
  'Microsoft\Edge',
  'BraveSoftware\Brave-Browser'
)

function Step($text) { Write-Host "`n> $text" -ForegroundColor Cyan }

# ---------- Node.js ----------

function Get-NodeExe {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $v = [version]((& $cmd.Source --version) -replace '^v', '')
  if ($v -lt [version]'23.8') { return $null }
  return $cmd.Source
}

Step 'Checking for Node.js'
$node = Get-NodeExe
if (-not $node) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'DemoDrop needs Node.js 23.8 or newer. Install the LTS version from https://nodejs.org and run this again.'
  }
  Write-Host 'Node.js 23.8+ not found. Installing Node.js LTS (you may see a Windows prompt)...'
  winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Host
  # Pick up the new PATH without restarting the terminal.
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $node = Get-NodeExe
  if (-not $node) { throw 'Node.js was installed but could not be found. Close this window and run the installer again.' }
}
Write-Host "Using $node ($(& $node --version))"

# ---------- helper ----------

Step 'Setting up the helper'
if (-not (Test-Path (Join-Path $HostDir 'node_modules\node-unrar-js'))) {
  # Release zips ship node_modules; a git checkout needs them installed.
  $npm = Join-Path (Split-Path $node) 'npm.cmd'
  Push-Location $HostDir
  try { & $npm install --omit=dev --no-fund --no-audit | Out-Null } finally { Pop-Location }
}

# The browser launches this .bat; it points at the exact node.exe found above.
$bat = Join-Path $HostDir 'demodrop-host.bat'
Set-Content -Path $bat -Encoding ascii -Value "@echo off`r`n`"$node`" `"%~dp0host.js`" %*"

$manifest = Join-Path $HostDir "$HostName.json"
$json = @{
  name            = $HostName
  description     = 'DemoDrop helper: unpacks CS2 demos into the game folder'
  path            = $bat
  type            = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json
# Write without a byte-order mark, which the browsers' manifest reader rejects.
[IO.File]::WriteAllText($manifest, $json, (New-Object Text.UTF8Encoding $false))

foreach ($browserKey in $BrowserKeys) {
  $regKey = "HKCU:\Software\$browserKey\NativeMessagingHosts\$HostName"
  New-Item -Path $regKey -Force | Out-Null
  Set-ItemProperty -Path $regKey -Name '(Default)' -Value $manifest
}
Write-Host 'Helper registered for Opera GX, Opera, Chrome, Edge and Brave.'

# ---------- loading the extension ----------

# Find the default browser's exe and its extensions page.
function Get-DefaultBrowser {
  $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction SilentlyContinue).ProgId
  if (-not $progId) { return $null }
  $cmd = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command" -ErrorAction SilentlyContinue).'(default)'
  if ($cmd -notmatch '^"([^"]+\.exe)"') { return $null }
  $exe = $Matches[1]
  $page = switch -Regex ((Split-Path $exe -Leaf)) {
    '^opera'  { 'opera://extensions' }
    '^chrome' { 'chrome://extensions' }
    '^msedge' { 'edge://extensions' }
    '^brave'  { 'brave://extensions' }
    default   { $null }
  }
  if (-not $page) { return $null }
  return @{ Exe = $exe; Page = $page }
}

Set-Clipboard -Value $ExtDir

Write-Host ''
Write-Host 'DemoDrop helper installed.' -ForegroundColor Green
Write-Host ''
Write-Host 'Last step: load the extension in your browser (browsers only allow you to do this yourself):'
Write-Host '  1. On the extensions page, turn on "Developer mode".'
Write-Host '  2. Click "Load unpacked".'
Write-Host '  3. Paste this folder path (it is already copied) and press Select Folder:'
Write-Host "     $ExtDir" -ForegroundColor Yellow

if (-not $NoBrowser) {
  $browser = Get-DefaultBrowser
  if ($browser) {
    Start-Process -FilePath $browser.Exe -ArgumentList $browser.Page
  } else {
    Write-Host ''
    Write-Host 'Open your browser''s extensions page (opera://extensions, chrome://extensions, edge://extensions or brave://extensions).'
  }
}
