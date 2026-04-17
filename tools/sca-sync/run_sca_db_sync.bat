@echo off
setlocal EnableExtensions
set "ROOT=%~dp0..\.."
pushd "%ROOT%" >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Nao foi possivel acessar a raiz do projeto.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\tools\sca-sync\run_sca_db_sync.ps1"
set "CODE=%errorlevel%"
popd >nul 2>nul
exit /b %CODE%
