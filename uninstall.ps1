# Removes the DemoDrop helper registration from Chrome.
# Remove the extension itself from chrome://extensions.

$HostName = 'com.leifhauskendev.demodrop'
foreach ($browserKey in 'Opera Software\Opera GX Stable', 'Opera Software\Opera Stable', 'Google\Chrome') {
  Remove-Item -Path "HKCU:\Software\$browserKey\NativeMessagingHosts\$HostName" -Force -ErrorAction SilentlyContinue
}
Remove-Item -Path (Join-Path $PSScriptRoot "host\$HostName.json"), (Join-Path $PSScriptRoot 'host\demodrop-host.bat') -Force -ErrorAction SilentlyContinue
Write-Host 'DemoDrop helper unregistered.'
