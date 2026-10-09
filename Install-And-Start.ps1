$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
foreach ($demoProject in @('circuits','contracts','backend','frontend')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "$demoProject/node_modules"))) {
    Push-Location -LiteralPath (Join-Path $PSScriptRoot $demoProject)
    try { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed: $demoProject" } } finally { Pop-Location }
  }
}
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'circuits')
try {
  if (-not (Test-Path -LiteralPath '.tools/circom.exe')) { npm run setup:circom; if ($LASTEXITCODE -ne 0) { throw 'Circom setup failed' } }
  if (-not (Test-Path -LiteralPath 'dist/circuits/src/provisional-poseidon.js')) { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Circuit build failed' } }
  if (-not (Test-Path -LiteralPath 'build/eligibility-v02.r1cs')) { npm run predicates:build; if ($LASTEXITCODE -ne 0) { throw 'Eligibility build failed' } }
} finally { Pop-Location }
& (Join-Path $PSScriptRoot 'Start-Local-Demo.ps1')
