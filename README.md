# Himefit Modular

Projeto modular com backend Node (WhatsApp/radio/ponto), painel React (`apps/panel-v2`), landing pública e desktop Electron.

## Fonte oficial do painel

- Painel principal: `apps/panel-v2`
- Rotas legadas (`/painel-legado` e `/panel_legacy`) redirecionam para `/painel`

## Toolchain local (portable)

Sem depender de instalação global, use:

- `tools/bootstrap-tools.ps1`
- Wrappers em `tools/bin`: `node`, `npm`, `npx`, `git`, `rg`

Exemplo (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\bootstrap-tools.ps1
.\tools\bin\node.cmd -v
.\tools\bin\npm.cmd -v
```

## Comandos principais (raiz)

- `npm run bootstrap:tools`
- `npm run install:all`
- `npm run panel_v2:build`
- `npm run landing:build`
- `npm run panel_v2:test`
- `npm run server:test`
- `npm run sca:sync:run`
- `npm run sca:db:sync:run`
- `npm run sca:db:package`
- `npm run deploy:oracle:manual`
- `npm run check:all`

## Validação full em 1 comando

- `validar_sistema.bat`

Esse comando executa bootstrap de ferramentas, instalações, testes e builds de ponta a ponta.

## Inicialização do sistema

- `iniciar_sistema.bat`
- `reiniciar_sistema.bat`
- `parar_sistema.bat`

## Sincronização SCA (CSV)

- Configure `apps/server/.env`:
  - `SCA_SYNC_ENABLED=1`
  - `SCA_SYNC_TOKEN=seu_token`
  - `SCA_EXPORT_DIR=C:\caminho\do\export\sca`
- Execute manualmente:
  - `npm run sca:sync:run`
- Execução agendada (Windows):
  - `tools\sca-sync\run_sca_sync.ps1`

## Sincronização SCA (Banco local - recepção)

- Configure `apps/server/.env` (ou `.env.recepcao.example` na recepção):
  - `SCA_SYNC_ENABLED=1`
  - `SCA_SYNC_MODE=db`
  - `SCA_SYNC_TOKEN=seu_token`
  - `SCA_SYNC_API_URL=https://www.academiaoxigenio.com/admin/sca/sync/batch`
  - `SCA_DB_DIR=C:\SistemaSCA`
  - `SCA_DB_ENGINE=auto`
- Execução manual:
  - `npm run sca:db:sync:run`
  - `tools\sca-sync\run_sca_db_sync.bat`
- Agendar a cada 5 min (Windows):
  - `tools\sca-sync\install_task_scheduler.bat`
- Instalacao rapida no PC da recepcao:
  - `tools\sca-sync\instalar_recepcao.bat`
- Gerar pacote ZIP para PC da recepção:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools\sca-sync\build_recepcao_package.ps1`
  - Esse comando também publica automaticamente em `updates/reception` e `runtime/updates/reception`.
- Link público direto:
  - `https://www.academiaoxigenio.com/LINKDEDOWNLOADRECEPCAO`
  - Alias estável: `https://www.academiaoxigenio.com/updates/reception/sca-sync-recepcao-latest.zip`

## Hospedagem 24x7 (free tier)

- Guia completo: `docs/HOST_ORACLE_FREE_24x7.md`
- Scripts de deploy: `tools/deploy/`
  - `install-server.sh` (primeira instalacao no servidor)
  - `update-server.sh` (atualizacao de producao)
  - `deploy_oracle_manual.ps1` (disparo manual via Windows + SSH)
