# SCA Web Exporter (isolado)

Worker separado para automatizar:

1. login em `app.sistemasca.com`
2. abrir `Administrativo > Alunos`
3. clicar em `Download` e depois `Export`
4. baixar o arquivo e converter para CSV

O `run_now.bat` executa auto-update antes da exportacao (quando habilitado no `.env`).

## Estrutura

- `sca_web_export_worker.js`: runtime principal
- `run_now.bat`: execucao manual
- `install_task_scheduler.bat`: agenda a cada 5 minutos
- `instalar_recepcao.bat`: bootstrap local
- `build_recepcao_package.ps1`: gera zip para distribuicao
- `.env.recepcao.example`: template de configuracao

## Setup rapido

1. Extraia a pasta `SCA-Web-Exporter`.
2. Rode `instalar_recepcao.bat`.
3. Edite `.env` com:
   - `SCA_WEB_USERNAME`
   - `SCA_WEB_PASSWORD`
4. Rode `run_now.bat`.
5. O worker ja envia os alunos para o backend (`/admin/sca/students/sync/batch`) quando o token estiver configurado.

## Saida

- Arquivo bruto baixado: `runtime/downloads/`
- CSV convertido: `runtime/exports/`
- Log: `logs/sca-web-export.log`
- Sincronizacao server: status em `/admin/sca/students/sync/status`

## Observacoes

- Se a tela mudar e o clique automatico falhar, configure os seletores no `.env`.
- Sessao de navegador e salva em `runtime/browser-profile`, reduzindo necessidade de relogar.
- Controle de auto-update: `SCA_WEB_AUTO_UPDATE`, `SCA_WEB_UPDATE_CHECK_MINUTES` e `SCA_WEB_UPDATE_META_URL`.
