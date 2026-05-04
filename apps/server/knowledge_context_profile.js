const PROFILE_VERSION = 1;
const MAX_PROFILE_JSON_BYTES = 120000;

function cleanText(value, max = 12000) {
    return String(value || '')
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim()
        .slice(0, max);
}

function cleanOneLine(value, max = 240) {
    return cleanText(value, max).replace(/\s+/g, ' ').trim();
}

function normalizeContextProfile(input = {}) {
    const src = input && typeof input === 'object' ? input : {};
    const academy = src.academy && typeof src.academy === 'object' ? src.academy : {};
    const service = src.service && typeof src.service === 'object' ? src.service : {};
    return {
        version: PROFILE_VERSION,
        academy: {
            name: cleanOneLine(academy.name),
            unit: cleanOneLine(academy.unit),
            address: cleanText(academy.address, 1200),
            phone: cleanOneLine(academy.phone),
            whatsapp: cleanOneLine(academy.whatsapp),
            instagram: cleanOneLine(academy.instagram),
            website: cleanOneLine(academy.website)
        },
        hours: cleanText(src.hours, 8000),
        holidayRules: cleanText(src.holidayRules, 4000),
        modalities: cleanText(src.modalities, 16000),
        plans: cleanText(src.plans, 12000),
        enrollment: cleanText(src.enrollment, 8000),
        policies: cleanText(src.policies, 12000),
        service: {
            tone: cleanText(service.tone, 4000),
            humanHandoff: cleanText(service.humanHandoff, 6000),
            objections: cleanText(service.objections, 8000),
            faqs: cleanText(service.faqs, 16000)
        },
        extraInfo: cleanText(src.extraInfo, 20000),
        importedContext: cleanText(src.importedContext, 50000)
    };
}

function countProfileContentChars(profile) {
    const p = normalizeContextProfile(profile);
    return [
        p.academy.name,
        p.academy.unit,
        p.academy.address,
        p.academy.phone,
        p.academy.whatsapp,
        p.academy.instagram,
        p.academy.website,
        p.hours,
        p.holidayRules,
        p.modalities,
        p.plans,
        p.enrollment,
        p.policies,
        p.service.tone,
        p.service.humanHandoff,
        p.service.objections,
        p.service.faqs,
        p.extraInfo,
        p.importedContext
    ].join('').trim().length;
}

function addSection(lines, title, body) {
    const content = cleanText(body);
    if (!content) return;
    lines.push('', `## ${title}`, content);
}

function generateContextFromProfile(input = {}) {
    const profile = normalizeContextProfile(input);
    const lines = ['# CONTEXTO DA ACADEMIA'];
    const academyTitle = [profile.academy.name, profile.academy.unit].filter(Boolean).join(' - ');
    if (academyTitle) lines.push('', `Academia: ${academyTitle}`);

    const contactLines = [];
    if (profile.academy.address) contactLines.push(`Endereco: ${profile.academy.address}`);
    if (profile.academy.phone) contactLines.push(`Telefone: ${profile.academy.phone}`);
    if (profile.academy.whatsapp) contactLines.push(`WhatsApp: ${profile.academy.whatsapp}`);
    if (profile.academy.instagram) contactLines.push(`Instagram: ${profile.academy.instagram}`);
    if (profile.academy.website) contactLines.push(`Site: ${profile.academy.website}`);
    addSection(lines, 'Dados e contatos', contactLines.join('\n'));

    addSection(lines, 'Funcionamento', profile.hours);
    addSection(lines, 'Feriados e horarios especiais', profile.holidayRules);
    addSection(lines, 'Modalidades, aulas e frequencia', profile.modalities);
    addSection(lines, 'Planos e valores', profile.plans);
    addSection(lines, 'Matricula e formas de pagamento', profile.enrollment);
    addSection(lines, 'Regras e politicas', profile.policies);
    addSection(lines, 'Tom de atendimento da IA', profile.service.tone);
    addSection(lines, 'Quando chamar atendimento humano', profile.service.humanHandoff);
    addSection(lines, 'Objeções comuns e respostas recomendadas', profile.service.objections);
    addSection(lines, 'Perguntas frequentes', profile.service.faqs);
    addSection(lines, 'Informacoes importantes adicionais', profile.extraInfo);
    addSection(lines, 'Informacoes antigas importadas', profile.importedContext);

    lines.push('', '## Instrucoes para a IA');
    lines.push('Use somente informacoes deste contexto quando responder sobre horarios, planos, modalidades, regras e valores. Quando faltar alguma informacao, informe que vai chamar um atendente humano para confirmar.');
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim() + '\n';
}

function isProfileTooLarge(profile) {
    return Buffer.byteLength(JSON.stringify(profile || {}), 'utf8') > MAX_PROFILE_JSON_BYTES;
}

module.exports = {
    MAX_PROFILE_JSON_BYTES,
    normalizeContextProfile,
    countProfileContentChars,
    generateContextFromProfile,
    isProfileTooLarge
};
