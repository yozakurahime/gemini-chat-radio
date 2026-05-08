# SCA MDB Reader (isolado)

Worker separado para ler `.mdb/.accdb` do SCA na recepcao e sincronizar eventos para:

- `POST /admin/sca/sync/batch`

## Estrutura

- `sca_mdb_sync_worker.js`: runtime principal
- `run_now.bat`: execucao manual
- `install_task_scheduler.bat`: agenda execucao a cada 5 minutos
- `instalar_recepcao.bat`: bootstrap local
- `build_recepcao_package.ps1`: gera zip para distribuir
- `.env.recepcao.example`: template de configuracao
- `config/sca_db_profile.json`: profile de mapeamento auto+ajuste

## Setup rapido (na maquina da academia)

1. Extraia a pasta `SCA-MDB-Reader`.
2. Rode `instalar_recepcao.bat`.
3. Edite `.env` e configure:
   - `SCA_SYNC_TOKEN`
   - `SCA_SYNC_API_URL`
   - `SCA_DB_DIR` (ou `SCA_DB_FILE`)
4. Rode `run_now.bat` para validar a primeira sincronizacao.

## Publicacao no site

- `build_recepcao_package.ps1` publica automaticamente em:
  - `updates/reception/sca-mdb-reader-latest.zip`
  - `updates/reception/latest-mdb-reader.json`
- Com o backend atualizado, o download publico fica em:
  - `https://www.academiaoxigenio.com/programarecepcao`

## Observacoes

- O mapeamento da tabela/colunas e detectado automaticamente na primeira execucao.
- Ajustes finos podem ser feitos em `config/sca_db_profile.json`.
- Cursor incremental fica em `runtime/sca_db_sync_cursor.json`.
