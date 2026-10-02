param([switch]$NoOpenBrowser)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = 'http://127.0.0.1:4173'
$pidFile = Join-Path $env:TEMP 'interview-mitra-server.pid'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js is not installed. Install Node.js, then run this file again.' -ForegroundColor Yellow
    exit 1
}
$nodeVersionText = (& node --version).Trim().TrimStart('v')
if ([version]$nodeVersionText -lt [version]'20.0') {
    Write-Host "Interview मित्रः needs Node.js 20 or newer (found $nodeVersionText). Update Node.js and run this file again." -ForegroundColor Yellow
    exit 1
}

$modelReady = $false
try {
    $ollamaTags = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
    $modelReady = @($ollamaTags.models | ForEach-Object { $_.name }) -contains 'gemma3:4b'
} catch { }

if (-not $modelReady) {
    $ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
    $ollamaPath = if ($ollamaCommand) { $ollamaCommand.Source } else { $null }
    if (-not $ollamaPath) {
        $commonOllamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
        if (Test-Path -LiteralPath $commonOllamaPath) { $ollamaPath = $commonOllamaPath }
    }
    if (-not $ollamaPath) {
        Write-Host 'Ollama is not running or its command is not on PATH. Start/install Ollama from https://ollama.com/download, then run this file again.' -ForegroundColor Yellow
        exit 1
    }
    Write-Host 'Downloading Gemma 3 4B (~3.3 GB). This may take a while the first time...' -ForegroundColor Cyan
    & $ollamaPath pull gemma3:4b
    if ($LASTEXITCODE -ne 0) { throw 'Gemma download failed. Check Ollama and your internet connection, then try again.' }
}

$alreadyRunning = $false
try { Invoke-RestMethod "$url/api/status" -TimeoutSec 2 | Out-Null; $alreadyRunning = $true } catch { }

if (-not $alreadyRunning) {
    $serverFile = Join-Path $projectDir 'server.js'
    $server = Start-Process -FilePath 'node' -ArgumentList "`"$serverFile`"" -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru
    $serverProcess = Get-Process -Id $server.Id
    $startedUtcTicks = $serverProcess.StartTime.ToUniversalTime().Ticks
    Set-Content -LiteralPath $pidFile -Value "$($server.Id)|$serverFile|$startedUtcTicks"
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { Invoke-RestMethod "$url/api/status" -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { }
    }
    if (-not $ready) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        throw 'Interview मित्रः did not start. Confirm Node.js is installed and port 4173 is available.'
    }
}

if (-not $NoOpenBrowser) { Start-Process $url }
Write-Host "Interview मित्रः is ready at $url" -ForegroundColor Green
Write-Host 'To stop its local server, run Stop-Interview-Mitra.ps1.'
