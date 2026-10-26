# Stop the digibib5 reader: free the frontend (14114) and backend (14115) ports.
$ErrorActionPreference = "SilentlyContinue"
foreach ($port in 14114, 14115) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen
    foreach ($c in $conns) {
        $procId = $c.OwningProcess
        if ($procId) {
            $name = (Get-Process -Id $procId).ProcessName
            Write-Host "Stopping PID $procId ($name) on port $port..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force
        }
    }
}
Write-Host "digibib5 ports 14114/14115 freed." -ForegroundColor Green
