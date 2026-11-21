# Removes the DemoDrop helper registration from all browsers, and the installed
# copy in %LOCALAPPDATA%\Programs\DemoDrop if that's where this runs from.
# Remove the extension itself from your browser's extensions page.

$HostName = 'com.leifhauskendev.demodrop'
$BrowserKeys = @(
  'Opera Software\Opera GX Stable',
  'Opera Software\Opera Stable',
  'Google\Chrome',
  'Microsoft\Edge',
  'BraveSoftware\Brave-Browser'
)

foreach ($browserKey in $BrowserKeys) {
  Remove-Item -Path "HKCU:\Software\$browserKey\NativeMessagingHosts\$HostName" -Force -ErrorAction SilentlyContinue
}
Remove-Item -Path (Join-Path $PSScriptRoot "host\$HostName.json"), (Join-Path $PSScriptRoot 'host\demodrop-host.bat') -Force -ErrorAction SilentlyContinue
Write-Host 'DemoDrop helper unregistered.'

$installed = Join-Path $env:LOCALAPPDATA 'Programs\DemoDrop'
if ((Resolve-Path $PSScriptRoot).Path.TrimEnd('\') -eq $installed) {
  # Can't delete the folder this script runs from, so do it just after we exit.
  Start-Process cmd.exe -ArgumentList '/c', "timeout /t 2 /nobreak >nul & rmdir /s /q `"$installed`"" -WindowStyle Hidden
  Write-Host "Removed $installed"
}
Write-Host 'Last step: remove DemoDrop from your browser''s extensions page.'
