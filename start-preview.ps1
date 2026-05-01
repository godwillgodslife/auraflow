$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'Starting AuraFlow preview server...'

$stdoutLog = Join-Path $PSScriptRoot 'preview-stdout.log'
$stderrLog = Join-Path $PSScriptRoot 'preview-stderr.log'
foreach ($logPath in @($stdoutLog, $stderrLog)) {
  if (Test-Path $logPath) {
    Remove-Item $logPath -Force
  }
}

try {
  Invoke-WebRequest -Uri 'http://127.0.0.1:3000/healthz' -UseBasicParsing -TimeoutSec 2 | Out-Null
  Write-Host 'AuraFlow preview is already running at http://localhost:3000'
  Start-Process 'http://localhost:3000'
  exit 0
} catch {
}

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$command = "cd /d `"$PSScriptRoot`" && node server.js 1>`"$stdoutLog`" 2>`"$stderrLog`""
$serverProcess = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $command) `
  -WorkingDirectory $PSScriptRoot `
  -WindowStyle Hidden `
  -PassThru

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if ($serverProcess.HasExited) {
    break
  }

  try {
    Invoke-WebRequest -Uri 'http://127.0.0.1:3000/healthz' -UseBasicParsing -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $ready) {
  Write-Host 'Preview server did not become ready.'
  if ($serverProcess.HasExited) {
    Write-Host "Node exited with code $($serverProcess.ExitCode)."
  } else {
    Write-Host 'Node is still running but localhost did not respond in time.'
  }

  if (Test-Path $stdoutLog) {
    Write-Host ''
    Write-Host '--- preview stdout ---'
    Get-Content $stdoutLog
  }

  if (Test-Path $stderrLog) {
    Write-Host ''
    Write-Host '--- preview stderr ---'
    Get-Content $stderrLog
  }

  Write-Host ''
  Write-Host 'Opening preview.html directly as a fallback.'
  Start-Process (Join-Path $PSScriptRoot 'preview.html')
  exit 1
}

Write-Host "AuraFlow preview is ready at http://localhost:3000 (PID $($serverProcess.Id))"
Start-Process 'http://localhost:3000'
