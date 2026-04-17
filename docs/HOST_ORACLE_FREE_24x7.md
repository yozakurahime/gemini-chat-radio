# Hospedagem 24x7 gratuita (Oracle Cloud Free Tier)

Este projeto pode ficar online 24x7 em uma VM "Always Free" da Oracle.

## 1) Visao geral (modelo recomendado)

- Desenvolvimento continua local (seu PC).
- Repositorio no GitHub.
- Servidor Linux na Oracle apenas para producao.
- Deploy manual quando necessario, sem mexer no fluxo local.

## 2) Custo e disponibilidade

- Oracle Free Tier: sem custo, com limites.
- Nao existe garantia absoluta de uptime em plano gratuito.
- Na pratica, e uma das opcoes mais estaveis para 24x7 sem pagar.

## 3) Primeiro setup no servidor

No servidor Oracle (Ubuntu):

```bash
git clone https://github.com/yozakurahime/academiaoxigenio.git /opt/himefit
cd /opt/himefit
bash tools/deploy/install-server.sh
```

Depois configure:

- `apps/server/.env` (porta, dominio, chaves, token SCA, etc).
- Proxy reverso (Nginx/Caddy) para HTTPS.
- Opcional: Cloudflare proxy.

## 4) Atualizar producao quando quiser

### Opcao A (local, manual)

No seu Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/deploy/deploy_oracle_manual.ps1 `
  -Host "SEU_IP_OU_DOMINIO" `
  -User "ubuntu" `
  -Port 22 `
  -Branch "main"
```

Esse comando:

1. roda testes/build local,
2. faz push da branch,
3. conecta por SSH,
4. executa `tools/deploy/update-server.sh` no servidor.

### Opcao B (GitHub Actions manual)

Use workflow `Deploy Oracle (Manual)` e configure os secrets:

- `ORACLE_SSH_HOST`
- `ORACLE_SSH_PORT`
- `ORACLE_SSH_USER`
- `ORACLE_SSH_PRIVATE_KEY`

## 5) Fluxo recomendado de trabalho

1. Desenvolver localmente.
2. Rodar `npm run test` e builds.
3. Commit + push para GitHub.
4. Deploy manual somente quando desejar publicar.

## 6) Observacoes importantes

- Se usar WhatsApp via Baileys, mantenha sessao/autenticacao persistente no servidor.
- Faca backup periodico de `runtime/` (DB e estados).
- Configure monitoramento basico (`pm2 status`, `pm2 logs himefit-server`).
