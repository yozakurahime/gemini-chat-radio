# SaaS Multi-Academia

Este projeto suporta a venda do HimeFit em modelo de uma instancia isolada por academia. Todas as academias usam o mesmo codigo do GitHub, mas cada uma roda com seu proprio processo, banco SQLite, WhatsApp, contexto da IA, ponto, storage e configuracoes.

## Modelo recomendado

- Um subdominio por academia, por exemplo `academia-exemplo.seudominio.com`.
- Um processo PM2 por academia, lendo `tenant.env`.
- Um data root por academia em `/opt/himefit/runtime/tenants/<slug>`.
- Um WhatsApp por academia em `/opt/himefit/runtime/tenants/<slug>/auth/session`.

## Criar uma academia

No servidor:

```bash
cd /opt/himefit
node tools/tenants/create-tenant.cjs \
  --slug academia-exemplo \
  --name "Academia Exemplo" \
  --port 3101 \
  --base-url https://academia-exemplo.seudominio.com
pm2 startOrReload tools/deploy/ecosystem.config.cjs --update-env
pm2 save
```

Quando existir pelo menos um `tenant.env`, o deploy automatico remove o processo legado `himefit-server` antes de recarregar o PM2. Para manter o processo legado junto dos tenants, defina `HIMEFIT_KEEP_LEGACY_PM2=1`.

O script cria:

- `runtime/tenants/<slug>/tenant.env`
- `runtime/tenants/<slug>/data/himefit.db` na primeira inicializacao do backend
- `runtime/tenants/<slug>/knowledge/base_context.md`
- `runtime/tenants/<slug>/auth/session`
- diretorios de storage, backups e updates

## Academia Oxigenio

Para transformar a instalacao atual no primeiro tenant sem risco de perder dados, mantenha o `HIMEFIT_DATA_ROOT` atual e adicione apenas:

```env
HIMEFIT_TENANT_SLUG=academia-oxigenio
HIMEFIT_TENANT_NAME="Academia Oxigenio"
```

Depois, em uma janela de manutencao, os dados podem ser movidos para `/opt/himefit/runtime/tenants/academia-oxigenio` usando backup validado.

## Proxy

Cada subdominio deve encaminhar para a porta configurada no `tenant.env`. Exemplo conceitual:

```nginx
server {
  server_name academia-exemplo.seudominio.com;

  location / {
    proxy_pass http://127.0.0.1:3101;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Health check

`/api/health` passa a retornar metadados do tenant:

```json
{
  "ok": true,
  "tenantSlug": "academia-exemplo",
  "tenantName": "Academia Exemplo",
  "tenantMode": true
}
```

No modo legado, esses campos ficam vazios ou `false`, preservando compatibilidade.
