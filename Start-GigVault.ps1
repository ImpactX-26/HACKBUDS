$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
foreach ($appPart in @('circuits','contracts','backend','frontend')) {
  if (!(Test-Path -LiteralPath "$appPart/node_modules")) {
    Push-Location -LiteralPath $appPart
    try { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "Install failed: $appPart" } } finally { Pop-Location }
  }
}
Push-Location -LiteralPath circuits
try {
  if (!(Test-Path -LiteralPath 'build/eligibility-v02.r1cs')) {
  if (!(Test-Path -LiteralPath '.tools/circom.exe')) { npm run setup:circom; if ($LASTEXITCODE -ne 0) { throw 'Circom installation failed' } }
  if (!(Test-Path -LiteralPath 'build/eligibility-v02.r1cs')) { npm run predicates:build; if ($LASTEXITCODE -ne 0) { throw 'Circuit build failed' } }
  }
  node node_modules/typescript/bin/tsc -p tsconfig.json
  if ($LASTEXITCODE -ne 0) { throw 'Shared library build failed' }
} finally { Pop-Location }
$env:GIGVAULT_APP_ORIGIN='http://localhost:3000'
$env:GIGVAULT_LOCAL_SETUP_CACHE=Join-Path $PSScriptRoot 'contracts/artifacts/demo-setup-cache'
if (!(Test-Path -LiteralPath (Join-Path $env:GIGVAULT_LOCAL_SETUP_CACHE 'manifest.json'))) { Remove-Item Env:GIGVAULT_LOCAL_SETUP_CACHE }
Push-Location -LiteralPath frontend
try { Write-Host 'Open http://localhost:3000. First start may create a local proving key; keep this terminal open.'; npm run dev -- --hostname 127.0.0.1 --port 3000 } finally { Pop-Location }
