# Start the Digibib5 reader: Starlette backend (14115) + Vite frontend (14114).
# Usage:  powershell -ExecutionPolicy Bypass -File ./web_sota/start.ps1
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$web = $PSScriptRoot

Write-Host "Starting digibib5 backend on 14115..." -ForegroundColor Cyan
Start-Process -FilePath "C:/Users/sandr/.local/bin/uv.exe" `
    -ArgumentList "run", "python", "-m", "digibib5_mcp.api" `
    -WorkingDirectory $repo -WindowStyle Minimized

if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Write-Host "Installing frontend deps with bun..." -ForegroundColor Cyan
    Set-Location $web
    bun install
}

Write-Host "Starting Vite dev server on http://127.0.0.1:14114 ..." -ForegroundColor Green
Set-Location $web
bun run dev
