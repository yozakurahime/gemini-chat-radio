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
- `npm run check:all`

## Validação full em 1 comando

- `validar_sistema.bat`

Esse comando executa bootstrap de ferramentas, instalações, testes e builds de ponta a ponta.

## Inicialização do sistema

- `iniciar_sistema.bat`
- `reiniciar_sistema.bat`
- `parar_sistema.bat`
