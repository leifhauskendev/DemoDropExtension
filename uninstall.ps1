# Removes the DemoDrop helper registration from Chrome.
# Remove the extension itself from chrome://extensions.

$HostName = 'com.leifhauskendev.demodrop'
Remove-Item -Path "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName" -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $PSScriptRoot "host\$HostName.json"), (Join-Path $PSScriptRoot 'host\demodrop-host.bat') -Force -ErrorAction SilentlyContinue
Write-Host 'DemoDrop helper unregistered.'
