@echo off
set "TOOLS_ROOT=%~dp0.."
for %%I in ("%TOOLS_ROOT%") do set "TOOLS_ROOT=%%~fI"
set "LOCAL_NODE=%TOOLS_ROOT%\runtime\node\node.exe"
set "LOCAL_NPM_CLI=%TOOLS_ROOT%\runtime\node\node_modules\npm\bin\npm-cli.js"

if exist "%LOCAL_NODE%" if exist "%LOCAL_NPM_CLI%" (
  set "PATH=%TOOLS_ROOT%\runtime\node;%PATH%"
  "%LOCAL_NODE%" "%LOCAL_NPM_CLI%" %*
  exit /b %errorlevel%
)

for /f "delims=" %%I in ('where.exe npm.cmd 2^>nul') do (
  if /I not "%%~fI"=="%~f0" (
    call "%%~fI" %*
    exit /b %errorlevel%
  )
)

echo [tools] npm nao encontrado. Execute tools\bootstrap-tools.ps1
exit /b 9009
