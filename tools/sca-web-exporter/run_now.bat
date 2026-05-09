@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if exist "%ROOT%update_self.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%update_self.ps1"
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%run_sca_web_export.ps1"
exit /b %ERRORLEVEL%
