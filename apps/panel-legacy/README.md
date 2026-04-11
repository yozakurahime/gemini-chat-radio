# Painel do Atendente (React + Vite)

## Rodar local
1. Instalar dependências:
   - `cd panel`
   - `npm install`
2. Dev server:
   - `npm run dev`
   - Abrir `http://localhost:5173`

## Build e deploy
1. `cd panel`
2. `npm run build`
3. O build sai em `panel/dist` e o backend passa a servir automaticamente esse diretório.

## Endpoints usados
### HTTP
- `GET /api/ads` -> `string[]` (lista de arquivos MP3)
- `POST /api/upload-ad` (form-data `file`)
- `POST /api/delete-ad` `{ filename }`
- `GET /api/playlist` -> `{ playlist, current }`
- `GET /api/cache-files`
- Assets:
  - `GET /cache/<videoId>.mp3`
  - `GET /ads/<file>`

### WebSocket (ws://host)
Client -> Server:
- `login` `{ user, pass }`
- `request_initial_lists`
- `request_chat_history` `{ contactId }`
- `admin_reply` `{ to, text }`
- `resume_bot` `{ to }`
- `end_chat` `{ to }`
- `update_contact_data` `{ contactId, tags, notes }`
- `radio_action` `{ action: 'play'|'pause'|'shuffle_toggle', track? }`
- `radio_settings_update` `{ musicVolume, adVolume, adFrequency }`
- `add_track` `{ url }`
- `remove_track` `{ id }`
- `skip_track`
- `get_suggestions`
- `resolve_suggestion` `{ id, action, song? }`

Server -> Client:
- `login_success` `{ username, isAdmin, fullname, avatar }`
- `login_error`
- `active_chat_list` `{ chats: [] }`
- `chat_history_response` `{ from, history, tags, notes, isPaused }`
- `user_reply` `{ from, text, name, status, pausedByHuman }`
- `bot_reply` `{ from, text }`
- `admin_reply_success` `{ from, text, senderName, isPaused }`
- `help_alert` `{ from, name, text, tags }`
- `contact_data_updated` `{ contactId, tags, notes }`
- `bot_resumed` `{ from }`
- `chat_archived_update` `{ id }`
- `radio_sync_update` `{ state }`
- `playlist_updated`
- `suggestions_list` `{ list }`

## Checklist de teste
- Login funciona
- Lista de conversas aparece
- Selecionar conversa carrega histórico
- Enviar mensagem e ver no histórico
- Rádio play/pause/skip/volume
- Abrir painel completo da rádio
- Tocar anúncio no painel
- Alternar dark/light
- Notificações: toast + som + título piscando

## Preferências de notificação
- Sons ativados / Mute
- Volume
- Notificar só em background
- Quiet Hours (horário silencioso)
- Notificação do sistema (Web)
