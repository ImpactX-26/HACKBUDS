$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GIGVAULT_APP_ORIGIN = 'http://localhost:3000'
$env:GIGVAULT_EVIDENCE_MODE = 'synthetic'
$demoCache = Join-Path $PSScriptRoot 'contracts/artifacts/demo-setup-cache'
if (Test-Path -LiteralPath (Join-Path $demoCache 'manifest.json')) { $env:GIGVAULT_LOCAL_SETUP_CACHE=$demoCache } else { Remove-Item Env:GIGVAULT_LOCAL_SETUP_CACHE -ErrorAction SilentlyContinue }
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'frontend')
Write-Host 'GigVault local demo: http://localhost:3000/passport'
Write-Host 'Keep this terminal running. Ctrl+C stops the web server.'
npm run dev -- --hostname 127.0.0.1 --port 3000
