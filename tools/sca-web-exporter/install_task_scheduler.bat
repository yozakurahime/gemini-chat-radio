@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "TASK_NAME=HimeFit - SCA Web Export"
set "RUNNER=%ROOT%run_hidden.vbs"

if not exist "%RUNNER%" (
  echo [ERRO] Runner nao encontrado: %RUNNER%
  exit /b 1
)

schtasks /Query /TN "%TASK_NAME%" >nul 2>nul
if not errorlevel 1 (
  schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
)

schtasks /Create ^
  /TN "%TASK_NAME%" ^
  /TR "\"%SystemRoot%\System32\wscript.exe\" //B //NoLogo \"%RUNNER%\"" ^
  /SC MINUTE ^
  /MO 5 ^
  /RL LIMITED ^
  /F
if errorlevel 1 (
  echo [ERRO] Falha ao criar tarefa agendada.
  exit /b 1
)

schtasks /Run /TN "%TASK_NAME%" >nul 2>nul
echo [OK] Tarefa instalada: %TASK_NAME%
echo [OK] Frequencia: a cada 5 minutos
exit /b 0
