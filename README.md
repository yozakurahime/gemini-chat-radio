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
- `npm run server:timezone:set`
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
  - `deploy-now.sh` (deploy de 1 comando, com backup antes)
  - `set-timezone-brasilia.sh` (fixa timezone da VM em America/Sao_Paulo)
  - `backup-db.sh` (backup do SQLite com retencao)
  - `install-backup-cron.sh` (agenda backup diario no cron)
  - `deploy_oracle_manual.ps1` (disparo manual via Windows + SSH)
  - `.github/workflows/deploy-production-auto.yml` (deploy automatico via GitHub Actions apos CI verde no `main`)

### Fluxo recomendado no servidor Linux (GitHub + deploy)

1. Configurar token GitHub (PAT fine-grained) para `git pull`:
   - `git config --global credential.helper store`
   - `git -C /opt/himefit pull origin main` (na primeira vez, informar usuario + token)
2. Deploy em um comando:
   - `cd /opt/himefit && bash tools/deploy/deploy-now.sh`
3. Garantir horario de Brasilia no host (uma vez):
   - `cd /opt/himefit && bash tools/deploy/set-timezone-brasilia.sh`
4. Agendar backup diario do banco:
   - `cd /opt/himefit && bash tools/deploy/install-backup-cron.sh`

### Deploy automatico 24/7 (GitHub Actions -> VM)

1. Em `GitHub > Settings > Secrets and variables > Actions`, criar:
   - `ORACLE_SSH_HOST` (IP ou dominio da VM)
   - `ORACLE_SSH_PORT` (normalmente `22`)
   - `ORACLE_SSH_USER` (ex: `newbiegamers1`)
   - `ORACLE_SSH_PRIVATE_KEY` (chave privada SSH completa, incluindo `BEGIN/END`)
2. Garantir que no servidor o repositorio esteja em `/opt/himefit` e `tools/deploy/update-server.sh` funcional.
3. Fluxo automatico:
   - Push no `main` -> workflow `CI` roda testes/build
   - Se CI passar, workflow `Deploy Production (Auto)` conecta na VM e executa update sem precisar do PC local ligado
4. Fallback manual:
   - `Actions > Deploy Production (Auto) > Run workflow` (selecionar branch/app_dir)
