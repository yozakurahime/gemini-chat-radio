function normalizeForMatch(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function parseHistoryLine(rawEntry) {
    const withoutTimestamp = String(rawEntry || '').replace(/^\[ts=\d{10,16}\]\s*/i, '');
    const separator = withoutTimestamp.indexOf(':');
    if (separator < 0) return { sender: '', body: withoutTimestamp.trim() };
    return {
        sender: normalizeForMatch(withoutTimestamp.slice(0, separator)),
        body: withoutTimestamp.slice(separator + 1).trim()
    };
}

function lastAssistantAskedForName(history) {
    const entries = Array.isArray(history) ? history : [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const parsed = parseHistoryLine(entries[index]);
        if (parsed.sender !== 'hime' && parsed.sender !== 'assistente' && parsed.sender !== 'bot') continue;
        const text = normalizeForMatch(parsed.body);
        const directQuestion = /\bseu nome\b/.test(text)
            && /\b(?:qual|diga|diz|informe|informar|saber|chamar|conta|conte)\b/.test(text);
        return directQuestion || [
            /\bqual (?:e|eh) (?:o )?seu nome\b/,
            /\bcomo (?:(?:voce|vc) )?se chama\b/,
            /\bcomo posso (?:te|lhe) chamar\b/,
            /\bme (?:diga|informe|fala|fale) (?:o )?seu nome\b/,
            /\bpoderia (?:me )?informar (?:o )?seu nome\b/,
            /\bpode (?:me )?informar (?:o )?seu nome\b/,
            /\bposso saber (?:o )?seu nome\b/
        ].some((pattern) => pattern.test(text));
    }
    return false;
}

function extractExplicitName(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const match = raw.match(/^(?:meu nome (?:é|e|eh)|me chamo|pode me chamar de|pode chamar de)\s+(.+)$/iu);
    return match ? match[1].trim() : '';
}

function cleanNameCandidate(value) {
    return String(value || '')
        .replace(/^[\s,.;:!?]+|[\s,.;:!?]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isPlausiblePersonName(value) {
    const candidate = cleanNameCandidate(value);
    if (candidate.length < 2 || candidate.length > 80) return false;
    if (!/^[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,5}$/u.test(candidate)) return false;

    const normalized = normalizeForMatch(candidate);
    const words = normalized.split(' ');
    const invalidWords = new Set([
        'oi', 'ola', 'sim', 'nao', 'talvez', 'ok', 'quero', 'queria', 'gostaria', 'preciso',
        'saber', 'ver', 'falar', 'marcar', 'agendar', 'plano', 'planos', 'valor', 'valores',
        'preco', 'precos', 'horario', 'horarios', 'academia', 'atendimento', 'atendente',
        'humano', 'matricula', 'obrigado', 'obrigada', 'bom', 'boa', 'tudo', 'bem', 'aula'
    ]);
    if (words.some((word) => invalidWords.has(word))) return false;
    return true;
}

function formatPersonName(value) {
    const particles = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
    return cleanNameCandidate(value)
        .split(' ')
        .map((word, index) => {
            const lower = word.toLocaleLowerCase('pt-BR');
            if (index > 0 && particles.has(lower)) return lower;
            return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
        })
        .join(' ');
}

function applyIncomingContactName({ conversation, text, whatsappName = '' }) {
    if (!conversation) return { changed: false, displayNameChanged: false, source: 'none' };
    const previousName = String(conversation.name || '');
    const safeWhatsappName = cleanNameCandidate(whatsappName).slice(0, 120);
    let changed = false;

    if (safeWhatsappName && safeWhatsappName !== conversation.whatsappName) {
        conversation.whatsappName = safeWhatsappName;
        changed = true;
    }

    const explicitName = extractExplicitName(text);
    const askedForName = lastAssistantAskedForName(conversation.history);
    if (!explicitName && !askedForName) {
        return { changed, displayNameChanged: false, source: 'none' };
    }

    const candidate = cleanNameCandidate(explicitName || text);
    if (isPlausiblePersonName(candidate)) {
        conversation.name = formatPersonName(candidate);
        conversation.nameSource = 'chat';
    } else if (conversation.whatsappName) {
        conversation.name = conversation.whatsappName;
        conversation.nameSource = 'whatsapp';
    }

    const displayNameChanged = String(conversation.name || '') !== previousName;
    return {
        changed: changed || displayNameChanged,
        displayNameChanged,
        source: displayNameChanged ? String(conversation.nameSource || 'chat') : 'none',
        validCandidate: isPlausiblePersonName(candidate)
    };
}

module.exports = {
    applyIncomingContactName,
    extractExplicitName,
    isPlausiblePersonName,
    lastAssistantAskedForName
};
