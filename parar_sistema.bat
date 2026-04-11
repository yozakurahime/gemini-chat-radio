@echo off
setlocal EnableExtensions EnableDelayedExpansion
title PARAR HIME FIT
color 0C

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "HIME_TUNNEL_TOKEN=eyJhIjoiZDFhZWUxZWNhZDY2ZjI4ZjI1OTc2YjU1NWQ3NmE2ZGEiLCJ0IjoiZGU2Nzc4NGItMGNjNC00NTMwLWE3ZGQtZmRjZWI3ZjFiODFhIiwicyI6InJzSTk3UkJFRjJUYVppVmN0cDA0L2pwcHl3ekM2eU4wdy9xdmZBQ3lDR2s9In0="
set "AUTO_CLOSE=0"

if /I "%~1"=="--autoclose" set "AUTO_CLOSE=1"
if /I "%~1"=="/autoclose" set "AUTO_CLOSE=1"

echo ==========================================
echo          PARAR HIME FIT (CLOUD)
echo ==========================================
echo Pasta: %ROOT%
echo.

echo [1/3] Encerrando backend da porta 3001...
powershell -NoProfile -Command "$conns = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue; if($conns){ $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique; foreach($pid in $pids){ Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } ; exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo      Nenhum processo em LISTEN na porta 3001.
) else (
  echo      Backend encerrado.
)

echo [2/3] Encerrando node index.js desta pasta (fallback)...
powershell -NoProfile -Command "$root=$env:ROOT; $procs=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*index.js*' -and $_.CommandLine -like ('*' + $root + '*') }; if($procs){ foreach($p in $procs){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } ; exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo      Nenhum node index.js encontrado para esta pasta.
) else (
  echo      Nodes encerrados.
)

echo [3/3] Encerrando tunnel cloudflared deste Himefit...
powershell -NoProfile -Command "$token=$env:HIME_TUNNEL_TOKEN; $procs=Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*tunnel run*' -and $_.CommandLine -like ('*' + $token + '*') }; if($procs){ foreach($p in $procs){ Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } ; exit 0 } else { exit 1 }" >nul 2>nul
if errorlevel 1 (
  echo      Nenhum tunnel deste token estava ativo.
) else (
  echo      Tunnel encerrado.
)

echo.
echo ==========================================
echo          HIME FIT ENCERRADO
echo ==========================================
if "%AUTO_CLOSE%"=="1" (
  timeout /t 2 >nul 2>nul
) else (
  echo.
  echo Pressione qualquer tecla para fechar esta janela...
  pause >nul
)
exit /b 0
