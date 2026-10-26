# Start the Digibib5 reader: Starlette backend (14115) + Vite frontend (14114).
# Usage:  powershell -ExecutionPolicy Bypass -File ./web_sota/start.ps1
#
# NOTE: do NOT set $ErrorActionPreference = "Stop" here. `bun` on this box is a
# PowerShell shim that writes a banner to stderr; under "Stop" that stderr is
# treated as a fatal NativeCommandError and the launcher aborts (looks like a
# crash). We invoke bun.exe directly and keep ErrorAction at Continue.
$ErrorActionPreference = "Continue"
$web = $PSScriptRoot
$repo = Split-Path -Parent $web

# Resolve the real bun.exe (never the .ps1 / .cmd shim).
$bun = @(
    "C:\Users\sandr\AppData\Roaming\npm\node_modules\bun\bin\bun.exe",
    (Get-Command bun.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $bun) {
    Write-Host "ERROR: bun.exe not found. Install Bun, then retry." -ForegroundColor Red
    exit 1
}

$uv = "C:\Users\sandr\.local\bin\uv.exe"

# Free the ports in case a previous run left something behind.
foreach ($port in 14114, 14115) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $c) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
}

Write-Host "Starting digibib5 backend on 14115..." -ForegroundColor Cyan
Start-Process -FilePath $uv `
    -ArgumentList "run", "python", "-m", "digibib5_mcp.api" `
    -WorkingDirectory $repo -WindowStyle Minimized

if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Write-Host "Installing frontend deps with bun..." -ForegroundColor Cyan
    & $bun install --cwd $web
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: bun install failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Starting Vite dev server on http://127.0.0.1:14114 ..." -ForegroundColor Green
Write-Host "(Ctrl+C here stops the frontend; run stop.bat to also stop the backend.)" -ForegroundColor DarkGray
Set-Location $web
& $bun run dev
