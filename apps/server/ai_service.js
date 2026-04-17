require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveAppPaths } = require('./app_paths');

const API_KEY = process.env.HIMEFIT_PROVIDER_AI_KEY || process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_TTS_MODEL = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim();
const OPENAI_TTS_VOICE = String(process.env.OPENAI_TTS_VOICE || 'coral').trim();
const OPENAI_TTS_INSTRUCTIONS = String(
    process.env.OPENAI_TTS_INSTRUCTIONS
    || 'Locucao feminina brasileira, natural, realista, ritmo comercial leve, sorriso na voz, diccao clara e sem teatralidade exagerada.'
).trim();
const ADS_AI_FLAG = process.env.ADS_AI_ENABLED !== '0';
const APP_PATHS = resolveAppPaths(__dirname, process.env, process.platform);
const CONTEXTO_FILE_PATH = APP_PATHS.BASE_CONTEXT_FILE;
const KNOWLEDGE_PUBLISHED_PATH = APP_PATHS.KNOWLEDGE_PUBLISHED_FILE;
const MAX_HISTORY_TOKENS = 12;
const ADS_SCRIPT_TEXT_LIMIT = 1200;
const ADS_BRIEFING_LIMIT = 500;

const ADS_SEED_LIBRARY = [
    { slot: 'institucional_01', category: 'institucional', titleHint: 'Boas-vindas na academia', objective: 'Dar boas-vindas e reforcar acolhimento logo na chegada.', cta: 'Procure a recepcao para qualquer ajuda.' },
    { slot: 'institucional_02', category: 'institucional', titleHint: 'Treino com apoio da equipe', objective: 'Lembrar que a equipe esta pronta para orientar alunos.', cta: 'Fale com a equipe quando precisar de ajuste no treino.' },
    { slot: 'institucional_03', category: 'institucional', titleHint: 'Ambiente de foco e energia', objective: 'Destacar o clima positivo e de foco da academia.', cta: 'Aproveite o treino de hoje com constancia.' },
    { slot: 'institucional_04', category: 'institucional', titleHint: 'Cuidado com a saude e movimento', objective: 'Incentivar consistencia e bem-estar sem promessas medicas.', cta: 'Mantenha sua rotina ativa com a HimeFit.' },
    { slot: 'institucional_05', category: 'institucional', titleHint: 'Academia para toda a familia', objective: 'Transmitir proximidade e acolhimento para diferentes perfis.', cta: 'Conheca nossas modalidades e horarios.' },
    { slot: 'institucional_06', category: 'institucional', titleHint: 'Experiencia completa na academia', objective: 'Posicionar a academia como experiencia completa e organizada.', cta: 'Conte com nossa equipe durante toda a sua jornada.' },

    { slot: 'promocao_01', category: 'promocao', titleHint: 'Convite para conhecer os planos', objective: 'Apresentar planos de forma comercial e leve.', cta: 'Consulte a recepcao e encontre o plano ideal.' },
    { slot: 'promocao_02', category: 'promocao', titleHint: 'Chamada para matricula', objective: 'Convidar novos alunos a se matricularem.', cta: 'Matricule-se hoje na recepcao.' },
    { slot: 'promocao_03', category: 'promocao', titleHint: 'Upsell de modalidades', objective: 'Incentivar alunos a conhecer novas modalidades.', cta: 'Pergunte na recepcao sobre modalidades extras.' },
    { slot: 'promocao_04', category: 'promocao', titleHint: 'Treine com amigo', objective: 'Criar chamada para indicar amigos com tom amistoso.', cta: 'Traga um amigo para conhecer a academia.' },
    { slot: 'promocao_05', category: 'promocao', titleHint: 'Planos para recomeçar', objective: 'Estimular retomada de rotina com tom motivador.', cta: 'Veja com a recepcao as opcoes para voltar hoje mesmo.' },
    { slot: 'promocao_06', category: 'promocao', titleHint: 'Aproveite horario e modalidade', objective: 'Mostrar variedade de horarios e modalidades disponiveis.', cta: 'Consulte a grade na recepcao.' },

    { slot: 'retencao_01', category: 'retencao', titleHint: 'Continue firme na rotina', objective: 'Motivar constancia e frequencia semanal.', cta: 'Organize sua semana e mantenha o ritmo.' },
    { slot: 'retencao_02', category: 'retencao', titleHint: 'Sua meta comeca no retorno', objective: 'Convidar alunos afastados a retornarem.', cta: 'Volte a treinar e conte com nosso apoio.' },
    { slot: 'retencao_03', category: 'retencao', titleHint: 'Evolucao vem da constancia', objective: 'Reforcar disciplina e progresso gradual.', cta: 'Nao perca o embalo do seu treino.' },
    { slot: 'retencao_04', category: 'retencao', titleHint: 'Retome hoje seu compromisso', objective: 'Criar mensagem curta para reativacao com tom gentil.', cta: 'Passe na recepcao e atualize seu plano.' },

    { slot: 'aviso_01', category: 'aviso', titleHint: 'Organizacao do espaco de treino', objective: 'Pedir colaboracao com equipamentos e pesos.', cta: 'Guarde os equipamentos apos o uso.' },
    { slot: 'aviso_02', category: 'aviso', titleHint: 'Hidratacao durante o treino', objective: 'Lembrar sobre agua e autocuidado durante a rotina.', cta: 'Mantenha sua garrafa por perto.' },
    { slot: 'aviso_03', category: 'aviso', titleHint: 'Pontualidade nas aulas', objective: 'Orientar alunos sobre chegada no horario.', cta: 'Chegue alguns minutos antes da aula.' },
    { slot: 'aviso_04', category: 'aviso', titleHint: 'Cuide dos seus pertences', objective: 'Reforcar cuidado com itens pessoais de forma elegante.', cta: 'Fique atenta aos seus pertences durante o treino.' },

    { slot: 'comunidade_01', category: 'comunidade', titleHint: 'Energia da comunidade HimeFit', objective: 'Valorizar a comunidade e a motivacao coletiva.', cta: 'Compartilhe sua energia com a gente.' },
    { slot: 'comunidade_02', category: 'comunidade', titleHint: 'Participe dos nossos eventos', objective: 'Convidar para eventos internos e acoes especiais.', cta: 'Acompanhe os avisos da academia.' },
    { slot: 'comunidade_03', category: 'comunidade', titleHint: 'Aulas e experiencias em grupo', objective: 'Promover experiencias coletivas e modalidades guiadas.', cta: 'Experimente uma aula diferente nesta semana.' },
    { slot: 'comunidade_04', category: 'comunidade', titleHint: 'Viva o clima da academia', objective: 'Transmitir pertencimento e entusiasmo com sobriedade.', cta: 'Aproveite cada treino com disposicao e constancia.' }
];

const PROMPT_LEAK_PATTERNS = [
    /hime and the ai have begun to exchange messages/i,
    /this is the first turn of the conversation/i,
    /\b(?:gmt|utc)\s*[+-]\s*\d+/i,
    /^\s*#\s*instru/i,
    /^\s*hoje:\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i
];

function stripInvisibleGarbage(text) {
    return String(text || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060]/g, '');
}

function hasMojibake(text) {
    return /[\u00C3\u00C2\u00E2\u00EF\uFFFD]/.test(text);
}

function repairReplacementArtifacts(text) {
    return String(text || '')
        .replace(/([\p{L}]+)\uFFFD\uFFFDo/gu, (match, prefix) => `${prefix}${prefix === prefix.toUpperCase() ? 'ÇÃO' : 'ção'}`)
        .replace(/([\p{L}]+)\uFFFD\uFFFDes/gu, (match, prefix) => `${prefix}${prefix === prefix.toUpperCase() ? 'ÇÕES' : 'ções'}`)
        .replace(/\bn\uFFFDo\b/g, 'não')
        .replace(/\bN\uFFFDo\b/g, 'Não')
        .replace(/\bN\uFFFDO\b/g, 'NÃO')
        .replace(/\bt\uFFFDm\b/g, 'têm')
        .replace(/\bT\uFFFDm\b/g, 'Têm')
        .replace(/Ter\uFFFDa/g, 'Terça')
        .replace(/ter\uFFFDa/g, 'terça')
        .replace(/Qu\uFFFD/g, 'Quê')
        .replace(/qu\uFFFD/g, 'quê')
        .replace(/voc\uFFFD/g, 'você')
        .replace(/Voc\uFFFD/g, 'Você')
        .replace(/tamb\uFFFDm/g, 'também')
        .replace(/Tamb\uFFFDm/g, 'Também')
        .replace(/at\uFFFD/g, 'até')
        .replace(/At\uFFFD/g, 'Até')
        .replace(/est\uFFFD/g, 'está')
        .replace(/Est\uFFFD/g, 'Está')
        .replace(/hor\uFFFDrio/g, 'horário')
        .replace(/Hor\uFFFDrio/g, 'Horário')
        .replace(/hor\uFFFDrios/g, 'horários')
        .replace(/Hor\uFFFDrios/g, 'Horários')
        .replace(/frequ\uFFFDncia/g, 'frequência')
        .replace(/Frequ\uFFFDncia/g, 'Frequência')
        .replace(/matr\uFFFDcula/g, 'matrícula')
        .replace(/Matr\uFFFDcula/g, 'Matrícula')
        .replace(/pre\uFFFDo/g, 'preço')
        .replace(/Pre\uFFFDo/g, 'Preço')
        .replace(/beb\uFFFD/g, 'bebê')
        .replace(/Beb\uFFFD/g, 'Bebê')
        .replace(/crian\uFFFDas/g, 'crianças')
        .replace(/Crian\uFFFDas/g, 'Crianças')
        .replace(/crian\uFFFDa/g, 'criança')
        .replace(/Crian\uFFFDa/g, 'Criança')
        .replace(/n\uFFFDmero/g, 'número')
        .replace(/N\uFFFDmero/g, 'Número')
        .replace(/endere\uFFFDo/g, 'endereço')
        .replace(/Endere\uFFFDo/g, 'Endereço')
        .replace(/Goi\uFFFDnia/g, 'Goiânia')
        .replace(/\uFFFD/g, '');
}

function fixMojibakeText(text) {
    const raw = repairReplacementArtifacts(stripInvisibleGarbage(text));
    if (!hasMojibake(raw)) return raw;
    const candidates = [raw];
    try { candidates.push(Buffer.from(raw, 'latin1').toString('utf8')); } catch (e) {}
    try { candidates.push(decodeURIComponent(escape(raw))); } catch (e) {}
    const score = (s) => {
        if (typeof s !== 'string') return Number.MAX_SAFE_INTEGER;
        const bad = (s.match(/[\u00C3\u00C2\u00E2\u00EF\uFFFD]/g) || []).length;
        return bad * 10 + s.length;
    };
    let best = raw;
    let bestScore = score(raw);
    for (const c of candidates) {
        const sc = score(c);
        if (sc < bestScore) {
            best = c;
            bestScore = sc;
        }
    }
    return stripInvisibleGarbage(best);
}

function normalizeLoadedText(text) {
    return fixMojibakeText(text);
}

function normalizeInlineText(text) {
    return normalizeLoadedText(text).trim();
}

function stripUnsafeReplyGlyphs(text) {
    return String(text || '')
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\uFE0F\u2640\u2642]/g, '')
        .replace(/<@\s*/g, ' ');
}

function slugifyText(text) {
    return normalizeInlineText(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

function clampText(text, maxLen) {
    return normalizeInlineText(text).slice(0, maxLen);
}

function estimateSpeechSeconds(text) {
    const words = clampText(text, ADS_SCRIPT_TEXT_LIMIT).split(/\s+/).filter(Boolean).length;
    if (!words) return 12;
    return Math.max(12, Math.min(24, Math.ceil(words / 2.5)));
}

function extractJsonPayload(raw) {
    const source = normalizeInlineText(raw || '');
    if (!source) return null;
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidateList = [];
    if (fenced?.[1]) candidateList.push(fenced[1].trim());
    const objectMatch = source.match(/\{[\s\S]*\}$/);
    const arrayMatch = source.match(/\[[\s\S]*\]$/);
    if (arrayMatch?.[0]) candidateList.push(arrayMatch[0].trim());
    if (objectMatch?.[0]) candidateList.push(objectMatch[0].trim());
    candidateList.push(source);
    for (const candidate of candidateList) {
        try {
            return JSON.parse(candidate);
        } catch (_) {}
    }
    return null;
}

function normalizeDraftCategory(value) {
    const normalized = slugifyText(value || '');
    if (normalized.startsWith('institucional')) return 'institucional';
    if (normalized.startsWith('promocao')) return 'promocao';
    if (normalized.startsWith('retencao')) return 'retencao';
    if (normalized.startsWith('aviso')) return 'aviso';
    if (normalized.startsWith('comunidade')) return 'comunidade';
    return normalized || 'institucional';
}

function normalizeAdText(value) {
    return clampText(String(value || '').replace(/\s+/g, ' '), ADS_SCRIPT_TEXT_LIMIT);
}

function normalizeAdTitle(value, fallbackTitle = 'Anuncio IA') {
    const title = clampText(value || fallbackTitle, 80).replace(/["'`]/g, '').trim();
    return title || fallbackTitle;
}

function buildAdDraft(raw, fallback = {}) {
    const title = normalizeAdTitle(raw?.title || raw?.titulo || fallback.titleHint || fallback.title || 'Anuncio IA');
    const text = normalizeAdText(raw?.text || raw?.texto || fallback.text || '');
    const category = normalizeDraftCategory(raw?.category || raw?.categoria || fallback.category || 'institucional');
    return {
        id: String(raw?.id || raw?.slot || fallback.slot || crypto.randomUUID()),
        category,
        title,
        text,
        duration_estimate: estimateSpeechSeconds(text)
    };
}

function buildAdsContextBlock() {
    refreshDynamicContextSnapshot();
    const contextParts = [];
    if (contextoAcademia) contextParts.push(`# CONTEXTO DA ACADEMIA\n${contextoAcademia}`);
    if (avisosDoDia) contextParts.push(`# AVISOS DO DIA\n${avisosDoDia}`);
    return contextParts.join('\n\n').trim();
}

async function runTextGeneration(prompt) {
    if (!model) throw new Error('text_model_unavailable');
    const contextBlock = buildAdsContextBlock();
    const systemPrompt = [
        'Voce escreve roteiros curtos para anuncios de academia em portugues do Brasil.',
        'Responda apenas em JSON valido, sem markdown, sem comentarios e sem texto fora do JSON.',
        'Use tom acolhedor, comercial, claro e confiante.',
        'Evite promessas medicas, urgencia agressiva, claims absolutos e linguagem apelativa.',
        'Crie textos curtos, fluidos e adequados para locucao feminina realista.'
    ].join(' ');
    const parts = [
        { text: systemPrompt },
        contextBlock ? { text: contextBlock } : null,
        { text: prompt }
    ].filter(Boolean);
    const result = await model.generateContent(parts);
    return normalizeInlineText(result?.response?.text() || '');
}

async function generateSingleAdDraft({ category, titleHint, objective, cta = '', briefing = '' }) {
    const prompt = [
        'Crie um unico objeto JSON com as chaves "title", "category" e "text".',
        `category: "${normalizeDraftCategory(category)}"`,
        `title_hint: "${normalizeAdTitle(titleHint || 'Anuncio IA')}"`,
        `objective: "${clampText(objective || briefing || 'Promover a academia', 220)}"`,
        cta ? `cta: "${clampText(cta, 120)}"` : '',
        briefing ? `briefing: "${clampText(briefing, ADS_BRIEFING_LIMIT)}"` : '',
        'Regras: 1 frase ou 2 frases curtas; no maximo 65 palavras; sem hashtags; sem aspas; sem emojis; PT-BR.'
    ].filter(Boolean).join('\n');
    const payload = extractJsonPayload(await runTextGeneration(prompt));
    return buildAdDraft(payload || {}, { category, titleHint });
}

async function generateSeedAdDrafts({ count = 24 } = {}) {
    const safeCount = Math.max(1, Math.min(24, Number(count) || 24));
    const slots = ADS_SEED_LIBRARY.slice(0, safeCount);
    const prompt = [
        'Crie um array JSON com exatamente um item por slot abaixo.',
        'Cada item deve ter: "slot", "category", "title", "text".',
        'Mantenha o mesmo slot recebido.',
        'Textos entre 12 e 24 segundos de locucao aproximada.',
        'Slots:',
        JSON.stringify(slots.map((slot) => ({
            slot: slot.slot,
            category: slot.category,
            title_hint: slot.titleHint,
            objective: slot.objective,
            cta: slot.cta
        })))
    ].join('\n');

    const parsed = extractJsonPayload(await runTextGeneration(prompt));
    const list = Array.isArray(parsed) ? parsed : [];
    const bySlot = new Map();
    for (const item of list) {
        const draft = buildAdDraft(item, item);
        const slot = String(item?.slot || draft.id || '').trim();
        if (slot) bySlot.set(slot, { ...draft, id: slot });
    }

    const drafts = [];
    for (const slot of slots) {
        if (bySlot.has(slot.slot)) {
            drafts.push(bySlot.get(slot.slot));
            continue;
        }
        drafts.push(await generateSingleAdDraft(slot));
    }
    return drafts.map((draft) => ({ ...draft, id: crypto.randomUUID() }));
}

async function generateCustomAdDraft({ briefing, objective = '', cta = '', category = 'promocao' }) {
    const safeBriefing = clampText(briefing || '', ADS_BRIEFING_LIMIT);
    if (!safeBriefing) throw new Error('briefing_required');
    return generateSingleAdDraft({
        category,
        titleHint: objective || briefing,
        objective: objective || briefing,
        cta,
        briefing: safeBriefing
    }).then((draft) => ({ ...draft, id: crypto.randomUUID() }));
}

function getAdsAICapabilities() {
    const textModelConfigured = !!model;
    const openAiConfigured = !!OPENAI_API_KEY;
    const enabled = ADS_AI_FLAG && openAiConfigured;
    return {
        enabled,
        can_generate_scripts: enabled && textModelConfigured,
        can_synthesize: enabled && openAiConfigured,
        text_model_configured: textModelConfigured,
        openai_configured: openAiConfigured,
        voice_model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE,
        warning: 'Locucao sintetica por IA: revise o texto antes de salvar e valide a politica de uso antes de ativar em producao.'
    };
}

async function synthesizeAdSpeech(text, { instructions = OPENAI_TTS_INSTRUCTIONS } = {}) {
    const safeText = normalizeAdText(text);
    if (!safeText) throw new Error('invalid_text');
    if (!OPENAI_API_KEY) throw new Error('openai_key_missing');
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: OPENAI_TTS_MODEL,
            voice: OPENAI_TTS_VOICE,
            input: safeText,
            format: 'mp3',
            instructions: normalizeInlineText(instructions || OPENAI_TTS_INSTRUCTIONS)
        }),
        signal: AbortSignal.timeout(45000)
    });
    if (!res.ok) {
        let message = `openai_tts_http_${res.status}`;
        try {
            const payload = await res.json();
            message = normalizeInlineText(payload?.error?.message || payload?.error || message);
        } catch (_) {
            try { message = normalizeInlineText(await res.text()) || message; } catch (_) {}
        }
        throw new Error(message);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('empty_tts_audio');
    return {
        buffer,
        mimeType: 'audio/mpeg',
        model: OPENAI_TTS_MODEL,
        voice: OPENAI_TTS_VOICE
    };
}

let model = null;
if (API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        console.log('[ok] IA: Servico de Inteligencia iniciado.');
    } catch (e) {
        console.error('[erro] IA: falha ao inicializar chave/API.', e.message);
    }
}

let contextoAcademia = '';
let avisosDoDia = '';
let contextoAcademiaStamp = { mtimeMs: 0, size: -1 };
let avisosDoDiaStamp = { mtimeMs: 0, size: -1 };

function isPromptLeakText(text) {
    const s = normalizeInlineText(text);
    if (!s) return false;
    return PROMPT_LEAK_PATTERNS.some((rx) => rx.test(s));
}

function sanitizeHistoryForModel(history = []) {
    const list = Array.isArray(history) ? history : [];
    const out = [];
    for (const raw of list) {
        const msg = normalizeInlineText(raw);
        if (!msg) continue;
        if (/^sistema:/i.test(msg)) continue;
        const msgNormalized = msg
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        const role = msgNormalized.startsWith('usuario:') ? 'user' : 'model';
        const text = msg.includes(':') ? msg.substring(msg.indexOf(':') + 1).trim() : msg;
        if (!text || isPromptLeakText(text)) continue;
        out.push({ role, parts: [{ text }] });
    }
    return out.slice(-MAX_HISTORY_TOKENS);
}

function sanitizeModelReply(raw) {
    let text = normalizeInlineText(raw);
    if (!text) return '';
    text = stripUnsafeReplyGlyphs(text).trim();

    text = text.replace(/^\*{0,2}\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\(gmt[+-]\d+\)\*{0,2}\s*/i, '').trim();

    if (isPromptLeakText(text)) {
        const firstHuman = text.search(/\b(ol(?:a|\u00E1)|oi|bom dia|boa tarde|boa noite|bem-vindo)/i);
        if (firstHuman > 0) text = text.slice(firstHuman).trim();
    }

    if (isPromptLeakText(text)) return '';
    if (text.length > 900) text = text.slice(0, 900).trim();
    return normalizeInlineText(text);
}

function normalizeExtraContextText(value, maxLen = 1600) {
    const text = normalizeInlineText(value || "");
    if (!text) return "";
    return text.slice(0, maxLen);
}

function normalizeForLookup(text) {
    return normalizeInlineText(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function extractNatacaoAdultoFacts(contextText) {
    const normalized = normalizeForLookup(contextText || '');
    if (!normalized.includes('natacao adulto')) return null;

    let price = '';
    const adultPlanBlock = normalized.match(/plano\s+natacao\s+adulto[\s\S]{0,320}/);
    if (adultPlanBlock?.[0]) {
        const priceMatch = adultPlanBlock[0].match(/mensal[^r$\n]{0,40}(r\$\s*\d[\d.,]*)/i);
        if (priceMatch?.[1]) price = priceMatch[1].toUpperCase().replace(/\s+/g, ' ').trim();
    }

    let schedule = '';
    const scheduleMatch = normalized.match(/natacao adulto[^\n:]*:\s*([^\n]+)/i);
    if (scheduleMatch?.[1]) {
        schedule = scheduleMatch[1]
            .replace(/\*/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^[-:;,\s]+/, '')
            .replace(/\.\s*$/, '')
            .trim();
    } else if (adultPlanBlock?.[0]) {
        const freqMatch = adultPlanBlock[0].match(/frequencia[^:\n]*:\s*([^\n]+)/i);
        if (freqMatch?.[1]) {
            schedule = freqMatch[1]
                .replace(/\*/g, '')
                .replace(/\s+/g, ' ')
                .replace(/^[-:;,\s]+/, '')
                .trim();
        }
    }

    return { price, schedule };
}

function shouldForceNatacaoAdultoReply(questionText) {
    const question = normalizeForLookup(questionText || '');
    if (!question.includes('natac') || !question.includes('adult')) return false;
    if (question.includes('plano completo') || question.includes('inclui')) return false;
    return true;
}

function buildNatacaoAdultoReply(facts) {
    const details = [];
    if (facts?.price) details.push(`valor mensal: **${facts.price}**`);
    if (facts?.schedule) details.push(`horario/frequencia: **${facts.schedule}**`);
    const detailsText = details.length ? `\n\nDetalhes:\n- ${details.join('\n- ')}` : '';
    return `Sim! Temos turma de natação adulto na academia.${detailsText}\n\nSe quiser, te passo agora como funciona a matrícula.`;
}

function buildExtraContextBlock(extraContext) {
    if (!extraContext) return "";
    if (typeof extraContext === "string") {
        const text = normalizeExtraContextText(extraContext);
        return text ? `# CONTEXTO DINAMICO\n${text}` : "";
    }
    if (typeof extraContext !== "object") return "";
    const sections = [];
    const scaText = normalizeExtraContextText(extraContext.sca || "");
    if (scaText) sections.push(`# CONTEXTO DO ALUNO (SCA)\n${scaText}`);
    const attendanceText = normalizeExtraContextText(extraContext.attendance || "");
    if (attendanceText) sections.push(`# CONTEXTO DE PONTO\n${attendanceText}`);
    const genericText = normalizeExtraContextText(extraContext.text || "");
    if (genericText) sections.push(`# CONTEXTO ADICIONAL\n${genericText}`);
    return sections.join("\n\n");
}

function getFileStamp(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        return {
            mtimeMs: Number(stat.mtimeMs || 0),
            size: Number(stat.size || 0)
        };
    } catch (_) {
        return null;
    }
}

function refreshBaseContextFromDisk(force = false) {
    try {
        const stamp = getFileStamp(CONTEXTO_FILE_PATH);
        if (!stamp) {
            contextoAcademia = '';
            contextoAcademiaStamp = { mtimeMs: 0, size: -1 };
            return;
        }
        const changed = force
            || stamp.mtimeMs !== contextoAcademiaStamp.mtimeMs
            || stamp.size !== contextoAcademiaStamp.size;
        if (!changed) return;
        contextoAcademia = normalizeLoadedText(fs.readFileSync(CONTEXTO_FILE_PATH, 'utf-8'));
        contextoAcademiaStamp = stamp;
    } catch (error) {
        console.error('Erro ao carregar contexto:', error.message);
    }
}

function refreshPublishedNoticesFromDisk(force = false) {
    try {
        const stamp = getFileStamp(KNOWLEDGE_PUBLISHED_PATH);
        if (!stamp) {
            avisosDoDia = '';
            avisosDoDiaStamp = { mtimeMs: 0, size: -1 };
            return;
        }
        const changed = force
            || stamp.mtimeMs !== avisosDoDiaStamp.mtimeMs
            || stamp.size !== avisosDoDiaStamp.size;
        if (!changed) return;
        const data = JSON.parse(fs.readFileSync(KNOWLEDGE_PUBLISHED_PATH, 'utf-8'));
        avisosDoDia = normalizeLoadedText((data.avisos || '').toString());
        avisosDoDiaStamp = stamp;
    } catch (_) {
        avisosDoDia = '';
    }
}

function refreshDynamicContextSnapshot(force = false) {
    refreshBaseContextFromDisk(force);
    refreshPublishedNoticesFromDisk(force);
}

function getCurrentContextSnapshot() {
    refreshDynamicContextSnapshot();
    return {
        contexto_length: contextoAcademia.length,
        avisos_length: avisosDoDia.length,
        contexto_mtime_ms: contextoAcademiaStamp.mtimeMs || 0,
        avisos_mtime_ms: avisosDoDiaStamp.mtimeMs || 0
    };
}

refreshDynamicContextSnapshot(true);
fs.watchFile(CONTEXTO_FILE_PATH, () => refreshBaseContextFromDisk(true));
fs.watchFile(KNOWLEDGE_PUBLISHED_PATH, () => refreshPublishedNoticesFromDisk(true));

async function transcreverAudioIA(audioPath) {
    if (!model) return '[Erro: IA nao configurada]';
    try {
        const audioData = fs.readFileSync(audioPath);
        const result = await model.generateContent([
            { text: 'Transcreva este audio fielmente:' },
            { inlineData: { mimeType: 'audio/mpeg', data: audioData.toString('base64') } }
        ]);
        return normalizeLoadedText(result.response.text());
    } catch (e) {
        return '[Erro na transcricao]';
    }
}

async function gerarRespostaIA(pergunta, historico = [], extraContext = null) {
    if (!model) return '[Erro: IA nao configurada]';
    const input = normalizeInlineText(pergunta);
    if (!input) return null;

    try {
        refreshDynamicContextSnapshot();
        const natacaoFacts = extractNatacaoAdultoFacts(contextoAcademia);
        if (natacaoFacts && shouldForceNatacaoAdultoReply(input)) {
            return buildNatacaoAdultoReply(natacaoFacts);
        }
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        const extraContextBlock = buildExtraContextBlock(extraContext);
        const contextParts = [
            `# INSTRUCAO\nHoje: ${dataAtual}.`,
            contextoAcademia,
            `# AVISOS DO DIA\n${avisosDoDia || ""}`,
        ];
        if (extraContextBlock) {
            contextParts.push(extraContextBlock);
        }
        contextParts.push("Se houver qualquer conflito entre historico e base de conhecimento, priorize SEMPRE a base de conhecimento mais atual.");
        contextParts.push("Responda de forma curta e vendedora.");
        const systemInstruction = {
            role: 'user',
            parts: [{
                text: contextParts.filter(Boolean).join('\n\n')
            }]
        };
        const historyParts = sanitizeHistoryForModel(historico);
        const result = await model.generateContent({
            contents: [systemInstruction, ...historyParts, { role: 'user', parts: [{ text: input }] }]
        });
        return sanitizeModelReply(result.response.text());
    } catch (error) {
        console.error('[erro] IA:', error.message);
        return null;
    }
}

module.exports = {
    gerarRespostaIA,
    transcreverAudioIA,
    generateSeedAdDrafts,
    generateCustomAdDraft,
    synthesizeAdSpeech,
    getAdsAICapabilities,
    refreshDynamicContextSnapshot,
    getCurrentContextSnapshot
};
