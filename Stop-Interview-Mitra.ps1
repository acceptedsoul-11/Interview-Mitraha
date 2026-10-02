$pidFile = Join-Path $env:TEMP 'interview-mitra-server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'No Interview मित्रः server started by the launcher was found.'
    exit 0
}
$parts = (Get-Content -LiteralPath $pidFile -Raw).Trim() -split '\|', 3
$parsedPid = 0
$startedUtcTicks = [long]0
$hasValidRecord = $parts.Count -eq 3 -and [int]::TryParse($parts[0], [ref]$parsedPid) -and [long]::TryParse($parts[2], [ref]$startedUtcTicks)
if (-not $hasValidRecord) {
    Write-Host 'The saved server process record is invalid; removing the stale record.' -ForegroundColor Yellow
    Remove-Item -LiteralPath $pidFile -Force
    exit 0
}
$serverPid = $parsedPid
$serverFile = $parts[1]
$expectedServerFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'server.js'
$processInfo = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
$isOurNode = $processInfo -and $processInfo.Path -match '\\node\.exe$' -and
    $serverFile.Equals($expectedServerFile, [System.StringComparison]::OrdinalIgnoreCase) -and
    $processInfo.StartTime.ToUniversalTime().Ticks -eq $startedUtcTicks
if ($isOurNode) {
    Stop-Process -Id $serverPid -ErrorAction SilentlyContinue
} else {
    Write-Host 'The saved process no longer matches this app; leaving it untouched.' -ForegroundColor Yellow
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'Interview मित्रः local server stopped.' -ForegroundColor Green
