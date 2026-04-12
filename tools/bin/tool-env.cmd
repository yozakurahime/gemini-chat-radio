@echo off
set "TOOLS_ROOT=%~dp0.."
for %%I in ("%TOOLS_ROOT%") do set "TOOLS_ROOT=%%~fI"
set "TOOLS_BIN=%TOOLS_ROOT%\bin"
set "TOOLS_NODE=%TOOLS_ROOT%\runtime\node"
set "TOOLS_GIT=%TOOLS_ROOT%\runtime\git\cmd"
set "TOOLS_RG=%TOOLS_ROOT%\runtime\rg"
set "PATH=%TOOLS_BIN%;%TOOLS_NODE%;%TOOLS_GIT%;%TOOLS_RG%;%PATH%"

if /I "%~1"=="--ensure" (
  if not exist "%TOOLS_ROOT%\runtime\node\node.exe" (
    echo [tools] Node local nao encontrado. Executando bootstrap...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%TOOLS_ROOT%\bootstrap-tools.ps1"
    if errorlevel 1 exit /b 1
  )
)

exit /b 0
