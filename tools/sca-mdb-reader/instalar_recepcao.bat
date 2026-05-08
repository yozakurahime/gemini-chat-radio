@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"

if not exist "%ROOT%\.env" (
  if exist "%ROOT%\.env.recepcao.example" (
    copy /Y "%ROOT%\.env.recepcao.example" "%ROOT%\.env" >nul
    echo [OK] Arquivo .env criado a partir de .env.recepcao.example
    echo [ATENCAO] Configure SCA_SYNC_TOKEN e SCA_SYNC_API_URL no .env.
  ) else (
    echo [ERRO] .env.recepcao.example nao encontrado.
    exit /b 1
  )
)

if not exist "%ROOT%\runtime" mkdir "%ROOT%\runtime" >nul 2>nul
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs" >nul 2>nul
if not exist "%ROOT%\config" mkdir "%ROOT%\config" >nul 2>nul

call "%ROOT%\install_task_scheduler.bat"
if errorlevel 1 exit /b 1

echo.
echo [OK] Instalacao concluida.
echo [OK] Use run_now.bat para teste manual imediato.
exit /b 0
