const path = require('path');

function registerChatAdminRoutes({
    app,
    fs,
    chatMediaDir,
    requirePanelAuth,
    sendSafeStaticFile,
    isPathInside,
    sanitizePublicText,
    conversationState,
    getSock,
    getSendTarget,
    clearPendingHumanHandoff,
    broadcastHumanHandoffStatus,
    saveChat,
    broadcast,
    scheduleBotResume,
    chatImageUpload,
    chatStickerUpload,
    saveChatImageBuffer,
    saveChatStickerBuffer,
    buildChatImagePublicUrl,
    buildChatImageHistoryMarker,
    buildChatStickerHistoryMarker
}) {
    app.get('/admin/chat/media/:filename', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rawName = String(req.params.filename || '').trim();
        const safeName = path.basename(rawName);
        if (!safeName || safeName !== rawName) return res.status(400).json({ error: 'invalid_filename' });
        const fullPath = path.join(chatMediaDir, safeName);
        if (!isPathInside(chatMediaDir, fullPath) || !fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'not_found' });
        }
        return sendSafeStaticFile(res, fullPath, 'private, max-age=86400');
    });

    app.post('/admin/conversations/:id/send-text', async (req, res) => {
        const authUser = requirePanelAuth(req, res); if (!authUser) return;
        const contactId = String(req.params.id || '').trim();
        if (!contactId) return res.status(400).json({ error: 'conversation_not_found' });
        const sock = getSock();
        if (!sock?.user) return res.status(503).json({ error: 'whatsapp_unavailable' });

        const text = sanitizePublicText(req.body?.text, 2048);
        if (!text) return res.status(400).json({ error: 'missing_text' });

        if (!conversationState[contactId]) {
            conversationState[contactId] = {
                history: [],
                messageBuffer: [],
                typingTimer: null,
                pausedByHuman: false,
                pendingHumanHandoff: null,
                name: contactId.split('@')[0],
                lastActivityTimestamp: Date.now(),
                tags: [],
                notes: "",
                status: 'active',
                routeJid: contactId
            };
        }

        const convo = conversationState[contactId];
        const senderName = sanitizePublicText(
            req.body?.senderName || authUser.fullname || authUser.username || 'Atendente',
            80
        ) || 'Atendente';

        try {
            const outbound = `*${senderName}:* ${text}`;
            await sock.sendMessage(getSendTarget(contactId), { text: outbound });
            if (convo.pendingHumanHandoff) {
                clearPendingHumanHandoff(convo);
                broadcastHumanHandoffStatus({ sender: contactId, user: convo, pending: false, reason: 'cancelled' });
            }
            convo.pausedByHuman = true;
            convo.status = 'active';
            convo.lastActivityTimestamp = Date.now();
            convo.history.push(`${senderName}: ${text}`);
            saveChat(contactId);
            broadcast({
                type: 'admin_reply_success',
                from: contactId,
                text,
                senderName,
                isPaused: true
            });
            scheduleBotResume(contactId);
            return res.json({ ok: true, previewText: text });
        } catch (error) {
            console.error('[chat-text] send error:', error?.message || error);
            return res.status(500).json({ error: 'send_failed' });
        }
    });

    app.post('/admin/conversations/:id/send-image', (req, res) => {
        const authUser = requirePanelAuth(req, res); if (!authUser) return;
        chatImageUpload.single('image')(req, res, async (err) => {
            if (err) {
                if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
                if (err?.code === 'INVALID_FILE_TYPE' || String(err?.message || '') === 'invalid_file_type') {
                    return res.status(400).json({ error: 'invalid_file_type' });
                }
                return res.status(400).json({ error: 'invalid_upload' });
            }

            const contactId = String(req.params.id || '').trim();
            const convo = conversationState[contactId];
            const sock = getSock();
            if (!contactId || !convo) return res.status(404).json({ error: 'conversation_not_found' });
            if (!sock?.user) return res.status(503).json({ error: 'whatsapp_unavailable' });

            const file = req.file;
            if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
                return res.status(400).json({ error: 'missing_file' });
            }
            const caption = sanitizePublicText(req.body?.caption || '', 1024);
            const senderName = sanitizePublicText(authUser.fullname || authUser.username || 'Atendente', 80) || 'Atendente';

            let saved = null;
            try {
                saved = await saveChatImageBuffer(file.buffer, file.mimetype, 'out');
                const now = Date.now();
                const media = {
                    url: buildChatImagePublicUrl(saved.filename, now),
                    caption,
                    mime: saved.mime,
                    size: saved.size,
                    ts: now
                };
                const marker = buildChatImageHistoryMarker(media);
                const outboundCaption = caption ? `*${senderName}:* ${caption}` : undefined;

                await sock.sendMessage(getSendTarget(contactId), {
                    image: file.buffer,
                    caption: outboundCaption,
                    mimetype: saved.mime
                });

                if (convo.pendingHumanHandoff) {
                    clearPendingHumanHandoff(convo);
                    broadcastHumanHandoffStatus({ sender: contactId, user: convo, pending: false, reason: 'cancelled' });
                }
                convo.pausedByHuman = true;
                convo.status = 'active';
                convo.lastActivityTimestamp = now;
                convo.history.push(`${senderName}: ${marker}`);
                saveChat(contactId);
                broadcast({
                    type: 'admin_reply_success',
                    from: contactId,
                    text: marker,
                    senderName,
                    isPaused: true,
                    kind: 'image',
                    media
                });
                scheduleBotResume(contactId);
                return res.json({ ok: true, media, previewText: marker });
            } catch (error) {
                if (saved?.fullPath) {
                    try { fs.unlinkSync(saved.fullPath); } catch (_) {}
                }
                const msg = String(error?.message || '');
                if (msg === 'invalid_file_type' || msg === 'file_too_large') {
                    return res.status(400).json({ error: msg });
                }
                console.error('[chat-image] send error:', error?.message || error);
                return res.status(500).json({ error: 'send_failed' });
            }
        });
    });

    app.post('/admin/conversations/:id/send-sticker', (req, res) => {
        const authUser = requirePanelAuth(req, res); if (!authUser) return;
        chatStickerUpload.single('sticker')(req, res, async (err) => {
            if (err) {
                if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large' });
                if (err?.code === 'INVALID_STICKER_TYPE' || String(err?.message || '') === 'invalid_sticker_type') {
                    return res.status(400).json({ error: 'invalid_sticker_type' });
                }
                return res.status(400).json({ error: 'invalid_upload' });
            }

            const contactId = String(req.params.id || '').trim();
            const convo = conversationState[contactId];
            const sock = getSock();
            if (!contactId || !convo) return res.status(404).json({ error: 'conversation_not_found' });
            if (!sock?.user) return res.status(503).json({ error: 'whatsapp_unavailable' });

            const file = req.file;
            if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
                return res.status(400).json({ error: 'missing_file' });
            }
            const senderName = sanitizePublicText(authUser.fullname || authUser.username || 'Atendente', 80) || 'Atendente';

            let saved = null;
            try {
                saved = await saveChatStickerBuffer(file.buffer, file.mimetype || 'image/webp', 'out_stk');
                const now = Date.now();
                const media = {
                    url: buildChatImagePublicUrl(saved.filename, now),
                    mime: saved.mime,
                    size: saved.size,
                    ts: now
                };
                const marker = buildChatStickerHistoryMarker(media);

                await sock.sendMessage(getSendTarget(contactId), {
                    sticker: file.buffer
                });

                if (convo.pendingHumanHandoff) {
                    clearPendingHumanHandoff(convo);
                    broadcastHumanHandoffStatus({ sender: contactId, user: convo, pending: false, reason: 'cancelled' });
                }
                convo.pausedByHuman = true;
                convo.status = 'active';
                convo.lastActivityTimestamp = now;
                convo.history.push(`${senderName}: ${marker}`);
                saveChat(contactId);
                broadcast({
                    type: 'admin_reply_success',
                    from: contactId,
                    text: marker,
                    senderName,
                    isPaused: true,
                    kind: 'sticker',
                    media
                });
                scheduleBotResume(contactId);
                return res.json({ ok: true, media, previewText: marker });
            } catch (error) {
                if (saved?.fullPath) {
                    try { fs.unlinkSync(saved.fullPath); } catch (_) {}
                }
                const msg = String(error?.message || '');
                if (msg === 'invalid_sticker_type' || msg === 'file_too_large') {
                    return res.status(400).json({ error: msg });
                }
                console.error('[chat-sticker] send error:', error?.message || error);
                return res.status(500).json({ error: 'send_failed' });
            }
        });
    });
}

module.exports = { registerChatAdminRoutes };
