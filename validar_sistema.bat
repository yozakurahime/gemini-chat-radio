@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"

if exist "%ROOT%tools\bin\tool-env.cmd" (
  call "%ROOT%tools\bin\tool-env.cmd" --ensure
  if errorlevel 1 goto :fail
)

call "%ROOT%tools\bin\npm.cmd" run check:all
if errorlevel 1 goto :fail

echo.
echo ==========================================
echo VALIDACAO COMPLETA FINALIZADA COM SUCESSO
echo ==========================================
exit /b 0

:fail
echo.
echo ==========================================
echo FALHA NA VALIDACAO COMPLETA
echo ==========================================
exit /b 1
