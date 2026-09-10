$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.local/server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'No background service PID found.'; exit 0 }
$savedProcessId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedProcessId"
$expectedScript = Join-Path $projectRoot 'server/index.js'
if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine.Replace('/', '\').Contains($expectedScript.Replace('/', '\'))) {
    & taskkill.exe /PID $savedProcessId /T /F
    if ($LASTEXITCODE -eq 0) { Write-Host 'CC4LetCode stopped.' }
} else {
    Write-Host 'The saved process is no longer this application. No process was stopped.'
}
