# One-line installer:
#   irm https://github.com/leifhauskendev/DemoDropExtension/releases/latest/download/get-demodrop.ps1 | iex
# Downloads the latest DemoDrop release and installs it for the current user.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # makes Invoke-WebRequest much faster

$zipUrl = 'https://github.com/leifhauskendev/DemoDropExtension/releases/latest/download/DemoDrop.zip'
$work   = Join-Path $env:TEMP ("demodrop-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $work | Out-Null

try {
  Write-Host 'Downloading the latest DemoDrop...'
  $zip = Join-Path $work 'DemoDrop.zip'
  Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $work -Force
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $work 'setup.ps1')
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
