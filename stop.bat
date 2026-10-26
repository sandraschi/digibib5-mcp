@echo off
REM Stop digibib5-mcp fleet ports (14114 frontend, 14115 backend)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0web_sota\stop.ps1"
if errorlevel 1 pause
