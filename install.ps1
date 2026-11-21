# Registers the DemoDrop helper with Opera GX / Chrome (current user only, no admin needed).
# Opera reads native messaging hosts from Chrome's registry location, so one key covers both.
# Run again any time you move this folder or reinstall Node.

$ErrorActionPreference = 'Stop'

$HostName    = 'com.leifhauskendev.demodrop'
$ExtensionId = 'flmpmjjhpglklbianbfhacdipkppilnp'  # fixed by the "key" in extension/manifest.json
$HostDir     = Join-Path $PSScriptRoot 'host'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js was not found. Install it from https://nodejs.org and run this again.' }

Write-Host 'Installing helper dependencies...'
Push-Location $HostDir
try { npm install --omit=dev --no-fund --no-audit | Out-Null } finally { Pop-Location }

# Chrome launches this .bat; it points at the exact node.exe found above.
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
# Write without a byte-order mark, which Chrome's manifest reader rejects.
[IO.File]::WriteAllText($manifest, $json, (New-Object Text.UTF8Encoding $false))

$regKey = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $regKey -Force | Out-Null
Set-ItemProperty -Path $regKey -Name '(Default)' -Value $manifest

Write-Host ''
Write-Host 'DemoDrop helper installed.' -ForegroundColor Green
Write-Host 'Next: open opera://extensions (Opera GX) or chrome://extensions (Chrome), turn on Developer mode,'
Write-Host "click 'Load unpacked' and choose: $(Join-Path $PSScriptRoot 'extension')"
