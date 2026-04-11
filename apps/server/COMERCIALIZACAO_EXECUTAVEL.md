# Himefit Comercial (Executavel Windows)

## Perfis de execucao

- `owner` (padrao): usa os dados atuais do projeto local.
- `commercial`: usa dados isolados em `%ProgramData%\\Himefit`.

No modo comercial:

- Banco: `%ProgramData%\\Himefit\\data\\himefit.db`
- Storage: `%ProgramData%\\Himefit\\storage\\...`
- Backups: `%ProgramData%\\Himefit\\backups\\...`
- Updates: `%ProgramData%\\Himefit\\updates\\...`

## Build do instalador

1. `npm install`
2. `npm run desktop:build`

Artefatos:

- Instalador: `dist-desktop\\Himefit Setup <versao>.exe`
- App unpacked: `dist-desktop\\win-unpacked\\...`

Observacao:

- O script `desktop:build` ja recompila `better-sqlite3` para Node no final, evitando quebrar o `node index.js` local apos empacotamento Electron.

## Publicacao de update (manifest + pacote)

1. Gere o instalador com `npm run desktop:build`.
2. Execute `npm run desktop:publish-manifest`.

Saidas:

- `updates\\himefit-<versao>.exe`
- `updates\\manifest.json`

Se quiser URL absoluta no manifesto, defina:

- `HIMEFIT_UPDATE_BASE_URL=https://seu-dominio/updates`

## Configuracao pelo frontend

No painel (admin):

- `Configuracoes > Sistema`
- Preencher onboarding/configuracoes comerciais
- Definir `updatesManifestUrl` para o manifesto publicado
- Usar status/check/apply de update
- Criar/listar/restaurar backups

## Endpoints administrativos adicionados

- `GET /admin/system/config`
- `PUT /admin/system/config`
- `POST /admin/system/onboarding/complete`
- `GET /admin/system/update/status`
- `POST /admin/system/update/check`
- `POST /admin/system/update/apply`
- `POST /admin/system/backup/create`
- `GET /admin/system/backup/list`
- `POST /admin/system/backup/restore`

## Observacoes operacionais

- Restore de backup e aplicado no proximo restart.
- O endpoint `update/apply` baixa e valida pacote; aplicacao do instalador permanece etapa controlada.
- Seu ambiente atual (owner) continua isolado do comercial.
