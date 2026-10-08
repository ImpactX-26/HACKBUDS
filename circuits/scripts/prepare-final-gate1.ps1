$ErrorActionPreference = 'Stop'
$labRoot = Split-Path $PSScriptRoot -Parent
$reviewRoot = Join-Path $labRoot '.scratch/backend-a-e991'
$archivePath = Join-Path $labRoot '.scratch/backend-a-e991.zip'
New-Item -ItemType Directory -Force -Path $reviewRoot | Out-Null
# Exact public source revision; no Git checkout, merge, credential access or branch mutation.
Invoke-WebRequest -Uri 'https://api.github.com/repos/Manas150706/HACKBUDS/zipball/e991f9036b2e563e2ecc1420d1b3ebad0968710e' -Headers @{ 'User-Agent' = 'GigVault-Gate1-review' } -OutFile $archivePath
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  foreach ($entry in $archive.Entries) {
    $relative = ($entry.FullName -split '/', 2)[1]
    if (-not $relative -or $relative.EndsWith('/')) { continue }
    if (-not ($relative.StartsWith('backend/') -or $relative.StartsWith('shared/proposal/'))) { continue }
    $destination = [System.IO.Path]::GetFullPath((Join-Path $reviewRoot $relative))
    $boundary = [System.IO.Path]::GetFullPath($reviewRoot) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $destination.StartsWith($boundary, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes isolated review directory' }
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
  }
} finally { $archive.Dispose() }
Push-Location $labRoot
try {
  node scripts/verify-final-source.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Published source manifest mismatch' }
} finally { Pop-Location }
Push-Location (Join-Path $reviewRoot 'backend')
try {
  npm ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Backend A dependency installation failed' }
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw 'Backend A typecheck failed' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Backend A build failed' }
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Backend A tests failed' }
} finally { Pop-Location }
