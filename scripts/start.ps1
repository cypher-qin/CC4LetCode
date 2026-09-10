$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$appUrl = 'http://127.0.0.1:3210'
try {
    $existingApp = Invoke-RestMethod -Uri "$appUrl/api/bootstrap" -TimeoutSec 2
    if ($existingApp.sample.slug -eq 'merge-sorted-array' -and $existingApp.settings) {
        Start-Process $appUrl
        exit 0
    }
} catch {}
try {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    if (!(Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    if (!(Test-Path -LiteralPath 'dist/index.html')) {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    }
    $logDir = Join-Path $projectRoot '.local'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $serverScript = Join-Path $projectRoot 'server/index.js'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverScript + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log') -PassThru
    Set-Content -LiteralPath (Join-Path $logDir 'server.pid') -Value $serverProcess.Id
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 400
        try {
            $startedApp = Invoke-RestMethod -Uri "$appUrl/api/bootstrap" -TimeoutSec 1
            if ($startedApp.sample.slug -eq 'merge-sorted-array') { Start-Process $appUrl; exit 0 }
        } catch {}
        if ($serverProcess.HasExited) { break }
    }
    throw 'Server did not start. Check .local/server-error.log and port 3210.'
} catch {
    Write-Host $_ -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}
