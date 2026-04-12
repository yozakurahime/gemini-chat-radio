@echo off
set "TOOLS_ROOT=%~dp0.."
for %%I in ("%TOOLS_ROOT%") do set "TOOLS_ROOT=%%~fI"
set "LOCAL_NODE=%TOOLS_ROOT%\runtime\node\node.exe"
set "LOCAL_NPX_CLI=%TOOLS_ROOT%\runtime\node\node_modules\npm\bin\npx-cli.js"

if exist "%LOCAL_NODE%" if exist "%LOCAL_NPX_CLI%" (
  set "PATH=%TOOLS_ROOT%\runtime\node;%PATH%"
  "%LOCAL_NODE%" "%LOCAL_NPX_CLI%" %*
  exit /b %errorlevel%
)

for /f "delims=" %%I in ('where.exe npx.cmd 2^>nul') do (
  if /I not "%%~fI"=="%~f0" (
    call "%%~fI" %*
    exit /b %errorlevel%
  )
)

echo [tools] npx nao encontrado. Execute tools\bootstrap-tools.ps1
exit /b 9009
