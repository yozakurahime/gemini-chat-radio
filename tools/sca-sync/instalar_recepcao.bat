@echo off
setlocal EnableExtensions

set "ROOT=%~dp0..\.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
cd /d "%ROOT%"

if not exist ".env" (
  if exist ".env.recepcao.example" (
    copy /Y ".env.recepcao.example" ".env" >nul
    echo [OK] Arquivo .env criado a partir de .env.recepcao.example
    echo [ATENCAO] Edite o .env e configure SCA_SYNC_TOKEN antes de usar em producao.
  ) else (
    echo [ERRO] .env.recepcao.example nao encontrado.
    exit /b 1
  )
)

call "%ROOT%\tools\sca-sync\install_task_scheduler.bat"
if errorlevel 1 exit /b 1

echo.
echo [OK] Instalacao da recepcao concluida.
echo [OK] Use tools\sca-sync\run_sca_db_sync.bat para teste manual.
exit /b 0
