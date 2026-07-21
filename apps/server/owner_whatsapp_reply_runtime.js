function sanitizeOwnerReplyText(value, maxLen = 2048) {
    return String(value || '')
        .replace(/\u0000/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
        .slice(0, maxLen);
}

function isIgnoredOwnerWhatsappReplyJid(jid) {
    const raw = String(jid || '').toLowerCase();
    if (!raw) return true;
    return raw === 'status@broadcast'
        || raw.includes('@broadcast')
        || raw.includes('@newsletter')
        || raw.includes('@g.us');
}

function extractOwnerWhatsappReplyText(wrappedMessage) {
    const wrapped = wrappedMessage && typeof wrappedMessage === 'object' ? wrappedMessage : {};
    const text = sanitizeOwnerReplyText(
        wrapped.conversation
        || wrapped.extendedTextMessage?.text
        || wrapped.imageMessage?.caption
        || wrapped.videoMessage?.caption
        || wrapped.documentMessage?.caption
        || wrapped.documentWithCaptionMessage?.message?.documentMessage?.caption
        || ''
    );
    if (text) return { text, kind: 'text' };

    if (wrapped.imageMessage) return { text: '[Imagem enviada pelo atendimento via WhatsApp]', kind: 'image' };
    if (wrapped.videoMessage) return { text: '[Video enviado pelo atendimento via WhatsApp]', kind: 'video' };
    if (wrapped.audioMessage) return { text: '[Audio enviado pelo atendimento via WhatsApp]', kind: 'audio' };
    if (wrapped.stickerMessage) return { text: '[Figurinha enviada pelo atendimento via WhatsApp]', kind: 'sticker' };
    if (wrapped.documentMessage || wrapped.documentWithCaptionMessage?.message?.documentMessage) {
        return { text: '[Documento enviado pelo atendimento via WhatsApp]', kind: 'document' };
    }
    if (wrapped.locationMessage || wrapped.liveLocationMessage) {
        return { text: '[Localizacao enviada pelo atendimento via WhatsApp]', kind: 'location' };
    }
    if (wrapped.contactMessage || wrapped.contactsArrayMessage) {
        return { text: '[Contato enviado pelo atendimento via WhatsApp]', kind: 'contact' };
    }
    return null;
}

function applyOwnerWhatsappReplyToConversation({
    conversationState,
    contactId,
    routeJid,
    pushName = '',
    text,
    timestamp = Date.now(),
    senderName = 'Atendente WhatsApp',
    clearPendingHumanHandoff,
    broadcastHumanHandoffStatus,
    appendHistoryEntry,
    saveChat,
    broadcast,
    acknowledgeConversationAttention
}) {
    if (!conversationState || !contactId || !text) return null;
    if (!conversationState[contactId]) {
        conversationState[contactId] = {
            history: [],
            messageBuffer: [],
            typingTimer: null,
            pausedByHuman: false,
            pendingHumanHandoff: null,
            name: pushName || String(contactId).split('@')[0],
            lastActivityTimestamp: Date.now(),
            tags: [],
            notes: '',
            status: 'active',
            routeJid: routeJid || contactId,
            slaPendingSince: 0,
            slaStatus: 'ok',
            slaUpdatedAt: Date.now()
        };
    }

    const convo = conversationState[contactId];
    if (convo.pendingHumanHandoff && typeof clearPendingHumanHandoff === 'function') {
        clearPendingHumanHandoff(convo);
        if (typeof broadcastHumanHandoffStatus === 'function') {
            broadcastHumanHandoffStatus({ sender: contactId, user: convo, pending: false, reason: 'owner_reply' });
        }
    }

    convo.pausedByHuman = true;
    convo.humanRequested = false;
    convo.status = 'active';
    convo.routeJid = routeJid || convo.routeJid || contactId;
    convo.lastActivityTimestamp = Number(timestamp || Date.now());

    if (typeof appendHistoryEntry === 'function') {
        appendHistoryEntry(convo.history, senderName, text, convo.lastActivityTimestamp);
    }
    if (typeof saveChat === 'function') saveChat(contactId);
    if (typeof acknowledgeConversationAttention === 'function') {
        acknowledgeConversationAttention(contactId, { actor: 'whatsapp_owner', reason: 'owner_whatsapp_reply' });
    }
    if (typeof broadcast === 'function') {
        broadcast({
            type: 'admin_reply_success',
            from: contactId,
            text,
            senderName,
            isPaused: true,
            timestamp: convo.lastActivityTimestamp,
            source: 'whatsapp_owner'
        });
        broadcast({
            type: 'chat_ia_state_updated',
            from: contactId,
            isPaused: true,
            source: 'whatsapp_owner'
        });
    }
    return convo;
}

module.exports = {
    applyOwnerWhatsappReplyToConversation,
    extractOwnerWhatsappReplyText,
    isIgnoredOwnerWhatsappReplyJid,
    sanitizeOwnerReplyText
};
