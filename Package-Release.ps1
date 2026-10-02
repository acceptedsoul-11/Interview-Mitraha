param([string]$Version = '1.0.0')
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must use MAJOR.MINOR.PATCH format.' }
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDir = Split-Path -Parent $projectDir
$baseName = "Interview-Mitraha-v$Version"
$archivePath = Join-Path $outputDir "$baseName.zip"
$hashPath = Join-Path $outputDir "$baseName.sha256"

if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $hashPath)) {
    throw "Release output already exists. Move it aside before packaging again: $baseName"
}

Compress-Archive -Path (Join-Path $projectDir '*') -DestinationPath $archivePath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $hashPath -Value "$hash  $baseName.zip" -Encoding ascii
Write-Host "Created $archivePath" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Cyan
