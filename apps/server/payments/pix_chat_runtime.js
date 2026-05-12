function normalizePlainText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectPixMonthlyIntent(text) {
    const normalized = normalizePlainText(text);
    if (!normalized) return false;
    const hasPlanTopic = /\b(mensalidade|mensal|plano|matricula)\b/.test(normalized);
    if (!hasPlanTopic) return false;

    const asksOnlyPrice = /\b(quanto|valor|preco|custa|mensalidade quanto)\b/.test(normalized);
    const hasPayAction = /\b(pagar|pagamento|quitar|acertar|liquidar|fechar|gerar|emitir|fazer)\b/.test(normalized);
    const hasPix = /\bpix\b/.test(normalized);
    const hasPixIntent = hasPix && /\b(pagar|gerar|emitir|manda|enviar|copia|cola|codigo)\b/.test(normalized);

    if (asksOnlyPrice && !hasPayAction && !hasPixIntent) return false;
    return hasPayAction || hasPixIntent;
}

function parseYesNo(text) {
    const normalized = normalizePlainText(text);
    if (!normalized) return null;
    if (['sim', 's', 'quero', 'confirmo', 'ok', 'pode', 'pagar'].includes(normalized)) return 'yes';
    if (['nao', 'n', 'cancelar', 'cancela', 'depois'].includes(normalized)) return 'no';
    if (/\b(sim|quero|confirmo|pode)\b/.test(normalized)) return 'yes';
    if (/\b(nao|cancelar|depois)\b/.test(normalized)) return 'no';
    return null;
}

function isCancelMessage(text) {
    const normalized = normalizePlainText(text);
    if (!normalized) return false;
    return /\b(cancelar|cancela|desist|parar|encerrar)\b/.test(normalized);
}

function normalizePlanLookupKey(value) {
    return normalizePlainText(value).replace(/\s+/g, ' ').trim();
}

function formatCurrencyBRLFromCents(cents) {
    const value = Number(cents || 0) / 100;
    if (!Number.isFinite(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function buildPlanListText(plans) {
    const safePlans = Array.isArray(plans) ? plans : [];
    if (!safePlans.length) return '-';
    return safePlans.map((plan, index) => {
        const value = formatCurrencyBRLFromCents(plan.amount_cents);
        return `${index + 1}. ${plan.name} (${value})`;
    }).join('\n');
}

module.exports = {
    buildPlanListText,
    detectPixMonthlyIntent,
    formatCurrencyBRLFromCents,
    isCancelMessage,
    normalizePlanLookupKey,
    normalizePlainText,
    parseYesNo
};
