# digibib5-mcp launcher. Delegates to web_sota\start.ps1 (backend 14115 + Vite 14114).
$webStart = Join-Path $PSScriptRoot "web_sota\start.ps1"
if (-not (Test-Path -LiteralPath $webStart)) {
    Write-Host "ERROR: web_sota\start.ps1 not found." -ForegroundColor Red
    exit 1
}
& $webStart
