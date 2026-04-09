

## Painel de Gestão - Academia

Dashboard web para gerenciar atendimento WhatsApp, rádio interna e ponto dos funcionários.

### 1. Layout e Navegação
- Sidebar com menu: **Atendimento**, **Rádio**, **Ponto**, **Configurações**
- Header com info do usuário e status do sistema
- Design responsivo para uso no PC da recepção

### 2. Painel de Atendimento WhatsApp
- Lista de conversas ativas com preview da última mensagem
- Área de chat com histórico de mensagens
- Indicador de quem está atendendo cada conversa
- Respostas da IA Gemini destacadas visualmente (badge "IA")
- Botão para ativar/desativar resposta automática por conversa

### 3. Configuração da IA (Gemini)
- Editor de texto online para o arquivo .txt de contexto da IA
- Preview do contexto atual
- Botão para salvar/atualizar o contexto
- Integração via Lovable AI Gateway (Gemini) para teste de respostas

### 4. Sistema de Rádio
- **Gerenciador de Playlists**: Adicionar links do YouTube (vídeos e playlists inteiras), reordenar, remover
- **Player**: Controles de play/pause/skip, visualização da música atual e próximas
- **Anúncios**: Upload/gravação de áudios de anúncio, agendamento de intervalos, controle de audio ducking (volume da música baixa durante anúncio)
- **Programação**: Definir horários para playlists diferentes

### 5. Sistema de Ponto via WhatsApp
- Tabela de registros de ponto (entrada/saída) com data, hora e localização
- Mapa mostrando localização do check-in
- Validação de proximidade (raio da academia)
- Relatório mensal por funcionário exportável

### 6. Autenticação
- Login com email/senha para os 2-5 operadores
- Perfis com permissões básicas (admin vs operador)

### Tecnologias
- **Frontend**: React + Tailwind + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) para auth, banco de dados e edge functions
- **IA**: Lovable AI Gateway (Gemini) para respostas inteligentes
- **Áudio**: Web Audio API para player e audio ducking
- **YouTube**: Extração de dados via API para montar playlists

> **Nota**: O painel funcionará como interface de gestão. A integração com seu sistema local (Baileys/WhatsApp) precisará de uma API ou webhook que conecte os dois — podemos configurar edge functions no Supabase para receber dados do seu sistema local.

