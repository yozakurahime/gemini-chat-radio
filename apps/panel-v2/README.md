# Painel v2 (Valorant)

## Rodar local
1. `cd apps/panel-v2`
2. `npm install`
3. `npm run dev`
4. Abrir `http://localhost:5174`

## Build
1. `cd apps/panel-v2`
2. `npm run build`
3. Para servir em produção, o v2 é o padrão:
   - Reinicie o backend
   - Acesse `/painel` (v2) ou `/painel` diretamente
   - Para voltar ao legado: `set PANEL_V2=0`
   - Painel legado fica em `/painel-legado`

## Debug de overflow
- Abra com `?debugOverflow=1` para logar elementos maiores que o viewport.

