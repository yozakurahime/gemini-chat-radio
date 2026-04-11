@echo off
setlocal EnableExtensions
title REINICIAR HIME FIT
color 0A

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ==========================================
echo         REINICIAR HIME FIT (CLOUD)
echo ==========================================
echo Pasta: %ROOT%
echo.
echo [1/2] Encerrando processos atuais...
call "%ROOT%parar_sistema.bat" --autoclose >nul
echo [2/2] Subindo sistema novamente...
call "%ROOT%iniciar_sistema.bat"
exit /b %errorlevel%
