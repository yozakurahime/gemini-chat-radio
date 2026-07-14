function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

const INTENT_RULES = [
    { intent: 'human_request', confidence: 'high', pattern: /\b(atendente|humano|pessoa real|falar com alguem)\b/ },
    { intent: 'complaint', confidence: 'high', pattern: /\b(reclamacao|reclamar|insatisfeit[oa]|pessimo|absurdo|mal atendid[oa]|denuncia)\b/ },
    { intent: 'cancellation', confidence: 'high', pattern: /\b(cancelar|cancelamento|encerrar (?:meu )?plano|nao quero mais)\b/ },
    { intent: 'payment_issue', confidence: 'high', pattern: /\b(cobran[çc]a (?:errada|indevida|duplicada)|paguei e|pix nao|pagamento nao|estorno|reembolso)\b/ },
    { intent: 'enrollment', confidence: 'high', pattern: /\b(matricula|matricular|quero (?:comecar|entrar|me inscrever)|como faco para entrar)\b/ },
    { intent: 'trial', confidence: 'high', pattern: /\b(aula experimental|aula teste|experimentar|conhecer a academia|agendar.*aula|marcar.*aula)\b/ },
    { intent: 'plans', confidence: 'high', pattern: /\b(plano|planos|mensalidade|preco|valor|quanto custa|promocao)\b/ },
    { intent: 'hours', confidence: 'high', pattern: /\b(horario|horarios|que horas|abre|fecha|funciona)\b/ },
    { intent: 'modalities', confidence: 'high', pattern: /\b(modalidade|modalidades|musculacao|natacao|hidroginastica|pilates|funcional|danca|cross)\b/ },
    { intent: 'greeting', confidence: 'medium', pattern: /^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)[!.? ]*$/ }
];

function classifyIntent(text) {
    const normalized = normalizeText(text);
    if (!normalized) return { intent: 'unknown', confidence: 'low' };
    for (const rule of INTENT_RULES) {
        if (rule.pattern.test(normalized)) return { intent: rule.intent, confidence: rule.confidence };
    }
    return { intent: 'unknown', confidence: normalized.length >= 12 ? 'medium' : 'low' };
}

function isGlobalOptOut(text) {
    const value = normalizeText(text);
    return /^(parar|sair|stop|cancelar mensagens|nao quero receber|nao me mande|nao envie|pare de enviar)(?: mensagens?)?[!. ]*$/.test(value)
        || /\bnao (?:quero|desejo) (?:mais )?receber (?:mensagens|lembretes|promocoes)\b/.test(value);
}

function isGlobalOptIn(text) {
    const value = normalizeText(text);
    return /\b(voltar a receber|quero receber|pode enviar|aceito receber) (?:mensagens|lembretes|promocoes)\b/.test(value);
}

function extractTime(text) {
    const value = normalizeText(text);
    const match = value.match(/\b([01]?\d|2[0-3])(?:(?::|h)([0-5]\d))?\s*(?:h|horas?)?\b/);
    if (!match) return '';
    const hour = String(Number(match[1])).padStart(2, '0');
    const minute = String(Number(match[2] || 0)).padStart(2, '0');
    return `${hour}:${minute}`;
}

function extractDay(text) {
    const value = normalizeText(text);
    const relative = value.match(/\b(hoje|amanha)\b/);
    if (relative) return relative[1] === 'amanha' ? 'amanhã' : 'hoje';
    const weekday = value.match(/\b(segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|domingo)\b/);
    if (weekday) return weekday[1].replace('-feira', '');
    const date = value.match(/\b([0-3]?\d)[\/-]([01]?\d)(?:[\/-](\d{2,4}))?\b/);
    if (!date) return '';
    return `${String(Number(date[1])).padStart(2, '0')}/${String(Number(date[2])).padStart(2, '0')}${date[3] ? `/${date[3]}` : ''}`;
}

function extractMemoryFacts(text) {
    const value = normalizeText(text);
    const facts = {};
    const goals = [
        ['emagrecimento', /\b(emagrecer|perder peso|perder gordura)\b/],
        ['ganho de massa', /\b(ganhar massa|massa muscular|hipertrofia)\b/],
        ['saúde', /\b(saude|qualidade de vida|recomendacao medica)\b/],
        ['condicionamento', /\b(condicionamento|resistencia|preparo fisico)\b/]
    ];
    for (const [label, pattern] of goals) {
        if (pattern.test(value)) { facts.objective = label; break; }
    }
    const modalities = [
        ['Musculação', /\bmusculacao\b/], ['Natação', /\bnatacao\b/],
        ['Hidroginástica', /\bhidroginastica\b/], ['Pilates', /\bpilates\b/],
        ['Funcional', /\bfuncional\b/], ['Dança', /\bdanca\b/]
    ];
    for (const [label, pattern] of modalities) {
        if (pattern.test(value)) { facts.modality = label; break; }
    }
    const plan = value.match(/\b(mensal|trimestral|semestral|anual|familia|familiar)\b/);
    if (plan) facts.planInterest = plan[1];
    const time = extractTime(text);
    const day = extractDay(text);
    if (time) facts.preferredTime = time;
    if (day) facts.preferredDay = day;
    return facts;
}

function stageForIntent(intent, currentStage = 'new') {
    if (intent === 'payment_issue') return 'support';
    if (intent === 'complaint' || intent === 'cancellation' || intent === 'human_request') return 'human_support';
    if (intent === 'enrollment') return 'enrollment';
    if (intent === 'trial') return 'trial_interest';
    if (['plans', 'modalities', 'hours'].includes(intent) && currentStage === 'new') return 'interested';
    return currentStage || 'new';
}

function updateCustomerAutomationState(conversation, text, now = Date.now()) {
    const previous = conversation.customerMemory && typeof conversation.customerMemory === 'object'
        ? conversation.customerMemory
        : {};
    const classified = classifyIntent(text);
    const facts = extractMemoryFacts(text);
    const memory = { ...previous, ...facts, updatedAt: now };
    if (classified.intent === 'trial') memory.trialStatus = memory.trialStatus || 'collecting';
    const salesStage = stageForIntent(classified.intent, conversation.salesStage || 'new');
    const hasUsefulFacts = Object.keys(facts).length > 0;
    const unknownCount = classified.intent === 'unknown' && !hasUsefulFacts
        ? Math.max(0, Number(conversation.automationUnknownCount || 0)) + 1
        : 0;
    conversation.customerMemory = memory;
    conversation.lastIntent = classified.intent;
    conversation.intentConfidence = classified.confidence;
    conversation.salesStage = salesStage;
    conversation.automationUnknownCount = unknownCount;
    return { ...classified, facts, memory, salesStage, unknownCount };
}

function shouldEscalateAutomation(analysis) {
    if (!analysis) return null;
    if (['complaint', 'cancellation', 'payment_issue'].includes(analysis.intent)) {
        return { reason: analysis.intent, priority: 'urgent' };
    }
    if (analysis.intent === 'unknown' && Number(analysis.unknownCount || 0) >= 2) {
        return { reason: 'repeated_unknown', priority: 'urgent' };
    }
    return null;
}

function buildAutomationContext(conversation) {
    const memory = conversation?.customerMemory || {};
    const known = [
        conversation?.name ? `Nome: ${conversation.name}` : '',
        memory.objective ? `Objetivo: ${memory.objective}` : '',
        memory.modality ? `Modalidade de interesse: ${memory.modality}` : '',
        memory.planInterest ? `Plano de interesse: ${memory.planInterest}` : '',
        memory.preferredDay ? `Dia preferido: ${memory.preferredDay}` : '',
        memory.preferredTime ? `Horário preferido: ${memory.preferredTime}` : '',
        memory.trialStatus ? `Aula experimental: ${memory.trialStatus}` : '',
        conversation?.salesStage ? `Etapa comercial: ${conversation.salesStage}` : '',
        conversation?.lastIntent ? `Intenção atual: ${conversation.lastIntent}` : '',
        conversation?.intentConfidence ? `Confiança da intenção: ${conversation.intentConfidence}` : ''
    ].filter(Boolean);
    return [
        '# MEMÓRIA E CONDUÇÃO DO ATENDIMENTO',
        ...known.map((item) => `- ${item}`),
        '- Não repita perguntas cuja resposta já aparece na memória.',
        '- Responda primeiro ao que foi perguntado e faça no máximo uma pergunta por mensagem.',
        '- Use respostas curtas, naturais e sem repetir saudação.',
        '- Quando houver interesse comercial, proponha um próximo passo concreto sem pressionar.',
        '- Nunca invente disponibilidade, preço, regra ou confirmação de agendamento.'
    ].join('\n');
}

function buildTrialRequest(conversation, now = Date.now()) {
    const memory = conversation?.customerMemory || {};
    if (!memory.preferredDay || !memory.preferredTime) return null;
    if (!['trial_interest', 'trial_requested'].includes(conversation.salesStage)) return null;
    return {
        contactId: conversation.id || '',
        contactName: conversation.name || '',
        modality: memory.modality || '',
        requestedDay: memory.preferredDay,
        requestedTime: memory.preferredTime,
        status: 'pending_confirmation',
        createdAt: now
    };
}

module.exports = {
    buildAutomationContext,
    buildTrialRequest,
    classifyIntent,
    extractMemoryFacts,
    isGlobalOptIn,
    isGlobalOptOut,
    shouldEscalateAutomation,
    updateCustomerAutomationState
};
