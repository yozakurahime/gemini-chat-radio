@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%run_sca_mdb_sync.ps1"
set "CODE=%errorlevel%"
exit /b %CODE%
