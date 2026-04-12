@echo off
set "TOOLS_ROOT=%~dp0.."
for %%I in ("%TOOLS_ROOT%") do set "TOOLS_ROOT=%%~fI"
set "LOCAL_EXE=%TOOLS_ROOT%\runtime\node\node.exe"
if exist "%LOCAL_EXE%" (
  "%LOCAL_EXE%" %*
  exit /b %errorlevel%
)

for /f "delims=" %%I in ('where.exe node.exe 2^>nul') do (
  if /I not "%%~fI"=="%LOCAL_EXE%" (
    "%%~fI" %*
    exit /b %errorlevel%
  )
)

echo [tools] node.exe nao encontrado. Execute tools\bootstrap-tools.ps1
exit /b 9009
