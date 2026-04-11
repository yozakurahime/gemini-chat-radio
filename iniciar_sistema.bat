@echo off
setlocal EnableExtensions EnableDelayedExpansion
title INICIALIZADOR HIME FIT (CLOUD)
color 0A

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "HIME_TUNNEL_TOKEN=eyJhIjoiZDFhZWUxZWNhZDY2ZjI4ZjI1OTc2YjU1NWQ3NmE2ZGEiLCJ0IjoiZGU2Nzc4NGItMGNjNC00NTMwLWE3ZGQtZmRjZWI3ZjFiODFhIiwicyI6InJzSTk3UkJFRjJUYVppVmN0cDA0L2pwcHl3ekM2eU4wdy9xdmZBQ3lDR2s9In0="
set "SITE_URL=https://www.academiaoxigenio.com"
set "PANEL_URL=https://www.academiaoxigenio.com/painel"
set "LEGACY_PANEL_URL=https://www.academiaoxigenio.com/painel-legado"
set "RADIO_URL=https://radio.academiaoxigenio.com"
set "SERVER_DIR=%ROOT%apps\\server"
set "NODE_ENTRY=%SERVER_DIR%\\index.js"
set "PANEL_DIST=%ROOT%apps\\panel-v2\\dist\\index.html"
set "LANDING_DIST=%ROOT%apps\\landing\\dist\\index.html"
set "LOG_DIR=%ROOT%logs"
set "BACKEND_OUT_LOG=%LOG_DIR%\\backend.out.log"
set "BACKEND_ERR_LOG=%LOG_DIR%\\backend.err.log"
set "CLOUDFLARED_OUT_LOG=%LOG_DIR%\\cloudflared.out.log"
set "CLOUDFLARED_ERR_LOG=%LOG_DIR%\\cloudflared.err.log"
set "AUTO_CLOSE=0"
set "HIMEFIT_DATA_ROOT=%ROOT%runtime"
set "APP_PANEL_BASE_URL=%PANEL_URL%"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul

if /I "%~1"=="--autoclose" set "AUTO_CLOSE=1"
if /I "%~1"=="/autoclose" set "AUTO_CLOSE=1"

echo ==========================================
echo      INICIALIZADOR HIME FIT (CLOUD)
echo ==========================================
echo Pasta: %ROOT%
echo.

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH.
  goto :fail
)

set "CLOUDFLARED_EXE="
if exist "%ROOT%cloudflared.exe" set "CLOUDFLARED_EXE=%ROOT%cloudflared.exe"
if not defined CLOUDFLARED_EXE if exist "%SERVER_DIR%\\cloudflared.exe" set "CLOUDFLARED_EXE=%SERVER_DIR%\\cloudflared.exe"
if not defined CLOUDFLARED_EXE (
  for /f "delims=" %%I in ('where cloudflared.exe 2^>nul') do (
    set "CLOUDFLARED_EXE=%%I"
    goto :cloudflared_found
  )
)
:cloudflared_found
if not defined CLOUDFLARED_EXE (
  echo [ERRO] cloudflared.exe nao encontrado.
  goto :fail
)

if not exist "%NODE_ENTRY%" (
  echo [ERRO] Arquivo index.js nao encontrado.
  goto :fail
)

if not exist "%PANEL_DIST%" (
  echo [1/7] Buildando panel_v2 - dist ausente...
  if not exist "%ROOT%apps\\panel-v2\\node_modules" (
    echo      Instalando dependencias do panel_v2...
    call npm --prefix apps\\panel-v2 install
    if errorlevel 1 (
      echo [ERRO] Falha ao instalar dependencias do panel_v2.
      goto :fail
    )
  )
  call npm run panel_v2:build
  if errorlevel 1 (
    echo [ERRO] Falha ao buildar panel_v2.
    goto :fail
  )
) else (
  echo [1/7] panel_v2 dist encontrado.
)

if not exist "%LANDING_DIST%" (
  echo [2/7] Buildando landing publica - dist ausente...
  if not exist "%ROOT%apps\\landing\\node_modules" (
    echo      Instalando dependencias da landing...
    call npm --prefix apps\\landing install
    if errorlevel 1 (
      echo [ERRO] Falha ao instalar dependencias da landing.
      goto :fail
    )
  )
  call npm run landing:build
  if errorlevel 1 (
    echo [ERRO] Falha ao buildar landing publica.
    goto :fail
  )
) else (
  echo [2/7] landing dist encontrado.
)

echo [3/7] Verificando tunnel Cloudflare...
powershell -NoProfile -Command "$token=$env:HIME_TUNNEL_TOKEN; $p=Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*tunnel*run*' -and $_.CommandLine -like ('*' + $token + '*') }; if($p){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo      Iniciando tunnel...
  powershell -NoProfile -Command "$exe=$env:CLOUDFLARED_EXE; $token=$env:HIME_TUNNEL_TOKEN; $out=$env:CLOUDFLARED_OUT_LOG; $err=$env:CLOUDFLARED_ERR_LOG; Start-Process -FilePath $exe -ArgumentList @('tunnel','--protocol','http2','run','--token',$token) -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
  powershell -NoProfile -Command "Start-Sleep -Seconds 3" >nul 2>nul
  powershell -NoProfile -Command "$token=$env:HIME_TUNNEL_TOKEN; $p=Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*tunnel*run*' -and $_.CommandLine -like ('*' + $token + '*') }; if($p){exit 0}else{exit 1}" >nul 2>nul
  if errorlevel 1 (
    echo [ERRO] Tunnel Cloudflare nao ficou ativo apos iniciar.
    echo [ERRO] Log cloudflared out: %CLOUDFLARED_OUT_LOG%
    echo [ERRO] Log cloudflared err: %CLOUDFLARED_ERR_LOG%
    goto :fail
  )
) else (
  echo      Tunnel ja em execucao.
)

echo [4/7] Verificando backend Node...
powershell -NoProfile -Command "$p=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue; if($p){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo      Iniciando backend...
  powershell -NoProfile -Command "$root=$env:SERVER_DIR; $out=$env:BACKEND_OUT_LOG; $err=$env:BACKEND_ERR_LOG; Start-Process -FilePath 'node' -ArgumentList 'index.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
) else (
  echo      Backend ja em execucao.
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>nul
  if errorlevel 1 (
    echo      Backend existente nao respondeu /api/health. Reiniciando...
    powershell -NoProfile -Command "$c=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul
    powershell -NoProfile -Command "$root=$env:SERVER_DIR; $out=$env:BACKEND_OUT_LOG; $err=$env:BACKEND_ERR_LOG; Start-Process -FilePath 'node' -ArgumentList 'index.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
  )
)

echo [5/7] Aguardando API local...
powershell -NoProfile -Command "$ok=$false; 1..60 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 500 }; if(-not $ok){ $listener=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1; $node=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*index.js*' } | Select-Object -First 1; if($listener -and $node){ $ok=$true } }; if($ok){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo [AVISO] API local nao respondeu em http://127.0.0.1:3001
  echo [AVISO] Log backend out: %BACKEND_OUT_LOG%
  echo [AVISO] Log backend err: %BACKEND_ERR_LOG%
) else (
  echo      API local pronta.
)

echo [6/7] Validando rotas administrativas do painel...
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/admin/system/config -TimeoutSec 2 | Out-Null; exit 0 } catch { if($_.Exception.Response){ $code=[int]$_.Exception.Response.StatusCode; if($code -eq 401 -or $code -eq 403){ exit 0 } elseif($code -eq 404){ exit 2 } else { exit 1 } } else { exit 1 } }" >nul 2>nul
set "FEATURE_CHECK=%errorlevel%"
if "%FEATURE_CHECK%"=="2" (
  echo      Backend antigo detectado na porta 3001. Reiniciando com este projeto...
  powershell -NoProfile -Command "$c=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1; if($c){ Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>nul
  powershell -NoProfile -Command "$root=$env:SERVER_DIR; $out=$env:BACKEND_OUT_LOG; $err=$env:BACKEND_ERR_LOG; Start-Process -FilePath 'node' -ArgumentList 'index.js' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
  powershell -NoProfile -Command "$ok=$false; 1..60 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/api/health -TimeoutSec 1; if($r.StatusCode -eq 200){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 500 }; if($ok){exit 0}else{exit 1}" >nul 2>nul
  if errorlevel 1 (
    echo [AVISO] Reinicio do backend falhou.
    echo [AVISO] Log backend out: %BACKEND_OUT_LOG%
    echo [AVISO] Log backend err: %BACKEND_ERR_LOG%
  ) else (
    powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/admin/system/config -TimeoutSec 2 | Out-Null; exit 0 } catch { if($_.Exception.Response){ $code=[int]$_.Exception.Response.StatusCode; if($code -eq 401 -or $code -eq 403){ exit 0 } else { exit 1 } } else { exit 1 } }" >nul 2>nul
    if errorlevel 1 (
      echo [AVISO] Rotas /admin/system ainda indisponiveis apos reinicio.
      echo [AVISO] Log backend out: %BACKEND_OUT_LOG%
      echo [AVISO] Log backend err: %BACKEND_ERR_LOG%
    ) else (
      echo      Rotas administrativas OK.
    )
  )
) else (
  if "%FEATURE_CHECK%"=="1" (
    echo [AVISO] Nao foi possivel validar /admin/system/config agora.
  ) else (
    echo      Rotas administrativas OK.
  )
)

echo [7/7] Validando roteamento por host (site/painel/radio)...
powershell -NoProfile -Command "$ok=$true; try { $site=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/ -Headers @{ Host='www.academiaoxigenio.com' } -TimeoutSec 3; if($site.StatusCode -ne 200){$ok=$false}; $app=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/painel -Headers @{ Host='www.academiaoxigenio.com' } -TimeoutSec 3; if($app.StatusCode -ne 200){$ok=$false}; $legacy=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/painel-legado -Headers @{ Host='www.academiaoxigenio.com' } -TimeoutSec 3; if($legacy.StatusCode -ne 200){$ok=$false}; $radio=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001/ -Headers @{ Host='radio.academiaoxigenio.com' } -TimeoutSec 3; if($radio.StatusCode -ne 200){$ok=$false} } catch { $ok=$false }; if($ok){exit 0}else{exit 1}" >nul 2>nul
if errorlevel 1 (
  echo [AVISO] Falha ao validar roteamento por host neste momento.
) else (
  echo      Roteamento por host OK.
)

echo Ambiente pronto.
echo.
echo ==========================================
echo   HIME FIT ONLINE (CANARY COM FALLBACK)
echo ==========================================
echo Site publico : %SITE_URL%
echo Painel novo  : %PANEL_URL%
echo Painel legado: %LEGACY_PANEL_URL%
echo Radio publico: %RADIO_URL%
echo.
echo Dica: se precisar voltar imediato, use /painel-legado
echo ==========================================
if "%AUTO_CLOSE%"=="1" (
  timeout /t 5 >nul 2>nul
) else (
  echo.
  echo Pressione qualquer tecla para fechar esta janela...
  pause >nul
)
exit /b 0

:fail
echo.
echo ==========================================
echo    FALHA AO INICIAR HIME FIT
echo ==========================================
echo Verifique os erros acima.
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
exit /b 1
