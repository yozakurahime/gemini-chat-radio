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
const AI_PLAYBOOKS_FILE_PATH = path.join(APP_PATHS.KNOWLEDGE_DIR, 'ai_playbooks.json');
const AI_TIMEZONE = String(process.env.HIMEFIT_TZ || process.env.TZ || 'America/Sao_Paulo').trim() || 'America/Sao_Paulo';
const HIMEFIT_LOCAL_HOLIDAYS = String(process.env.HIMEFIT_LOCAL_HOLIDAYS || '').trim();
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

function buildDefaultAiPlaybooks() {
    return {
        enabled: true,
        sections: {
            mensalidade: 'Quando perguntarem valor da mensalidade ou preco de plano, responda com os valores que existirem no contexto. Se nao houver valor no contexto, diga que vai confirmar com o atendimento humano antes de fechar.',
            modalidades: 'Quando perguntarem modalidades, responda com lista objetiva (nome, frequencia, publico e observacoes) priorizando clareza comercial.',
            matricula: 'Quando pedirem matricula, explique documentos, forma de pagamento, etapas e ofereca concluir com atendente humano.',
            objecoes: 'Quando houver indecisao (tempo, preco, distancia), responda com empatia, destaque beneficios praticos e convide para teste/aula experimental quando houver no contexto.'
        },
        updated_at: 0,
        updated_by: 'system'
    };
}

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
let aiPlaybooks = buildDefaultAiPlaybooks();
let contextoAcademiaStamp = { mtimeMs: 0, size: -1 };
let avisosDoDiaStamp = { mtimeMs: 0, size: -1 };
let aiPlaybooksStamp = { mtimeMs: 0, size: -1 };

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

function canonicalWeekdayPt(value) {
    const normalized = normalizeForLookup(value || '')
        .replace(/\bfeira\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) return '';
    if (normalized.includes('domingo')) return 'domingo';
    if (normalized.includes('segunda')) return 'segunda-feira';
    if (normalized.includes('terca')) return 'terça-feira';
    if (normalized.includes('quarta')) return 'quarta-feira';
    if (normalized.includes('quinta')) return 'quinta-feira';
    if (normalized.includes('sexta')) return 'sexta-feira';
    if (normalized.includes('sabado')) return 'sábado';
    return '';
}

function pad2(value) {
    return String(Number(value || 0)).padStart(2, '0');
}

function getTzDateParts(baseDate = new Date()) {
    const now = baseDate instanceof Date ? baseDate : new Date(baseDate);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: AI_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(now);
    const year = Number(parts.find((p) => p.type === 'year')?.value || 0);
    const month = Number(parts.find((p) => p.type === 'month')?.value || 0);
    const day = Number(parts.find((p) => p.type === 'day')?.value || 0);
    const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
    const monthDay = `${pad2(month)}-${pad2(day)}`;
    return { year, month, day, isoDate, monthDay };
}

function computeEasterSunday(year) {
    const y = Number(year || 0);
    if (!Number.isFinite(y) || y < 1900) return null;
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return { year: y, month, day };
}

function offsetFromDateParts(parts, daysDelta) {
    const date = new Date(Date.UTC(parts.year, Number(parts.month || 1) - 1, parts.day));
    date.setUTCDate(date.getUTCDate() + Number(daysDelta || 0));
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate()
    };
}

function toIsoDate(parts) {
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function buildNationalHolidayMap(year) {
    const fixed = new Map([
        ['01-01', 'Confraternizacao Universal'],
        ['04-21', 'Tiradentes'],
        ['05-01', 'Dia do Trabalho'],
        ['09-07', 'Independencia do Brasil'],
        ['10-12', 'Nossa Senhora Aparecida'],
        ['11-02', 'Finados'],
        ['11-15', 'Proclamacao da Republica'],
        ['11-20', 'Dia Nacional de Zumbi e da Consciencia Negra'],
        ['12-25', 'Natal']
    ]);
    const map = new Map();
    for (const [monthDay, name] of fixed.entries()) {
        map.set(`${year}-${monthDay}`, name);
    }

    const easter = computeEasterSunday(year);
    if (easter) {
        const goodFriday = toIsoDate(offsetFromDateParts(easter, -2));
        map.set(goodFriday, 'Sexta-feira Santa');
    }
    return map;
}

function parseLocalHolidayEntries(raw) {
    const text = String(raw || '').trim();
    if (!text) return [];
    const entries = [];
    for (const piece of text.split(/[,\n;]+/g)) {
        const item = piece.trim();
        if (!item) continue;
        const idx = item.indexOf(':');
        if (idx <= 0) continue;
        const key = item.slice(0, idx).trim();
        const name = item.slice(idx + 1).trim();
        if (!name) continue;
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) || /^\d{2}-\d{2}$/.test(key)) {
            entries.push({ key, name });
        }
    }
    return entries;
}

function resolveHolidayInfo(baseDate = new Date()) {
    const nowParts = getTzDateParts(baseDate);
    const national = buildNationalHolidayMap(nowParts.year);
    const nationalName = national.get(nowParts.isoDate) || '';
    const localEntries = parseLocalHolidayEntries(HIMEFIT_LOCAL_HOLIDAYS);
    const localHit = localEntries.find((entry) => entry.key === nowParts.isoDate || entry.key === nowParts.monthDay);

    if (nationalName && localHit) {
        return {
            isHoliday: true,
            scope: 'nacional e local',
            name: `${nationalName}; ${localHit.name}`,
            isoDate: nowParts.isoDate
        };
    }
    if (localHit) {
        return {
            isHoliday: true,
            scope: 'local',
            name: localHit.name,
            isoDate: nowParts.isoDate
        };
    }
    if (nationalName) {
        return {
            isHoliday: true,
            scope: 'nacional',
            name: nationalName,
            isoDate: nowParts.isoDate
        };
    }
    return {
        isHoliday: false,
        scope: '',
        name: '',
        isoDate: nowParts.isoDate
    };
}

function resolveBrazilNowInfo(baseDate = new Date()) {
    const now = baseDate instanceof Date ? baseDate : new Date();
    const dateBR = new Intl.DateTimeFormat('pt-BR', {
        timeZone: AI_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(now);
    const weekdayRaw = new Intl.DateTimeFormat('pt-BR', {
        timeZone: AI_TIMEZONE,
        weekday: 'long'
    }).format(now);
    const weekday = canonicalWeekdayPt(weekdayRaw) || weekdayRaw;
    const holiday = resolveHolidayInfo(now);
    return {
        timezone: AI_TIMEZONE,
        dateBR,
        weekday,
        holiday
    };
}

function enforceTodayWeekdayConsistency(text, nowInfo) {
    const source = normalizeInlineText(text || '');
    const expected = canonicalWeekdayPt(nowInfo?.weekday || '');
    if (!source || !expected || !/\bhoje\b/i.test(source)) return source;

    const dayPattern = '(domingo|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|s[aá]bado)';
    const regex = new RegExp(`(\\bhoje\\b[^.\\n]{0,80}?\\b(?:e|é|eh|,|-)\\s*)${dayPattern}`, 'i');
    return source.replace(regex, (full, prefix, foundDay) => {
        const foundCanonical = canonicalWeekdayPt(foundDay || '');
        if (!foundCanonical || foundCanonical === expected) return full;
        return `${prefix}${expected}`;
    });
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

function refreshAiPlaybooksFromDisk(force = false) {
    try {
        const stamp = getFileStamp(AI_PLAYBOOKS_FILE_PATH);
        if (!stamp) {
            aiPlaybooks = buildDefaultAiPlaybooks();
            aiPlaybooksStamp = { mtimeMs: 0, size: -1 };
            return;
        }
        const changed = force
            || stamp.mtimeMs !== aiPlaybooksStamp.mtimeMs
            || stamp.size !== aiPlaybooksStamp.size;
        if (!changed) return;
        const raw = JSON.parse(fs.readFileSync(AI_PLAYBOOKS_FILE_PATH, 'utf-8'));
        const defaults = buildDefaultAiPlaybooks();
        const sections = raw?.sections && typeof raw.sections === 'object' ? raw.sections : {};
        aiPlaybooks = {
            enabled: raw?.enabled !== false,
            sections: {
                mensalidade: normalizeInlineText(sections.mensalidade || defaults.sections.mensalidade).slice(0, 1200),
                modalidades: normalizeInlineText(sections.modalidades || defaults.sections.modalidades).slice(0, 1200),
                matricula: normalizeInlineText(sections.matricula || defaults.sections.matricula).slice(0, 1200),
                objecoes: normalizeInlineText(sections.objecoes || defaults.sections.objecoes).slice(0, 1200)
            },
            updated_at: Number(raw?.updated_at || 0),
            updated_by: normalizeInlineText(raw?.updated_by || 'system').slice(0, 80)
        };
        aiPlaybooksStamp = stamp;
    } catch (_) {
        aiPlaybooks = buildDefaultAiPlaybooks();
    }
}

function refreshDynamicContextSnapshot(force = false) {
    refreshBaseContextFromDisk(force);
    refreshPublishedNoticesFromDisk(force);
    refreshAiPlaybooksFromDisk(force);
}

function getCurrentContextSnapshot() {
    refreshDynamicContextSnapshot();
    return {
        contexto_length: contextoAcademia.length,
        avisos_length: avisosDoDia.length,
        playbooks_enabled: aiPlaybooks?.enabled !== false,
        playbooks_updated_at: Number(aiPlaybooks?.updated_at || 0),
        contexto_mtime_ms: contextoAcademiaStamp.mtimeMs || 0,
        avisos_mtime_ms: avisosDoDiaStamp.mtimeMs || 0,
        playbooks_mtime_ms: aiPlaybooksStamp.mtimeMs || 0
    };
}

function buildPlaybooksContextBlock() {
    if (!aiPlaybooks || aiPlaybooks.enabled === false) return '';
    const s = aiPlaybooks.sections || {};
    const lines = [
        '# PLAYBOOKS DE ATENDIMENTO',
        s.mensalidade ? `- Mensalidade e planos: ${s.mensalidade}` : '',
        s.modalidades ? `- Modalidades e aulas: ${s.modalidades}` : '',
        s.matricula ? `- Matricula e fechamento: ${s.matricula}` : '',
        s.objecoes ? `- Objecoes comerciais: ${s.objecoes}` : ''
    ].filter(Boolean);
    return lines.join('\n');
}

refreshDynamicContextSnapshot(true);
fs.watchFile(CONTEXTO_FILE_PATH, () => refreshBaseContextFromDisk(true));
fs.watchFile(KNOWLEDGE_PUBLISHED_PATH, () => refreshPublishedNoticesFromDisk(true));
fs.watchFile(AI_PLAYBOOKS_FILE_PATH, () => refreshAiPlaybooksFromDisk(true));

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
        const nowInfo = resolveBrazilNowInfo();
        const extraContextBlock = buildExtraContextBlock(extraContext);
        const holidayLine = nowInfo.holiday?.isHoliday
            ? `Hoje (${nowInfo.dateBR}) e feriado ${nowInfo.holiday.scope}: ${nowInfo.holiday.name}.`
            : `Hoje (${nowInfo.dateBR}) nao e feriado nacional conhecido.`;
        const playbooksBlock = buildPlaybooksContextBlock();
        const contextParts = [
            `# RELOGIO OFICIAL\nFuso horario oficial: ${nowInfo.timezone}\nData de hoje: ${nowInfo.dateBR}\nDia da semana oficial: ${nowInfo.weekday}.`,
            `# FERIADO OFICIAL\n${holidayLine}`,
            `# REGRA DE DATA\nQuando mencionar "hoje", use EXATAMENTE o dia da semana oficial acima. Nunca invente outro dia da semana para hoje.`,
            `# REGRA DE FERIADO\nSe hoje for feriado, nao assuma horario regular. Use horario de feriado somente se estiver explicito na base de conhecimento. Se nao houver horario de feriado explicito, informe que o horario pode ser especial e ofereca confirmacao com atendente humano.`,
            `# REGRA DE IDENTIFICACAO (NOME DO USUARIO)\n1. Se o nome do usuario estiver no "CONTEXTO DO ALUNO (SCA)" (ex: "Aluno SCA: NomeDoAluno") ou se o usuario ja tiver se apresentado/identificado no historico de conversa, voce DEVE usar o nome dele para trata-lo de forma personalizada, amigavel e calorosa (ex: "Ola, [Nome]!", "Como posso te ajudar hoje, [Nome]?").\n2. Se voce ainda nao souber o nome do usuario (nao constar no SCA e ele nao tiver dito no historico), voce deve perguntar educadamente o nome dele de forma acolhedora logo na primeira resposta.`,
            playbooksBlock,
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
        const safeReply = sanitizeModelReply(result.response.text());
        return enforceTodayWeekdayConsistency(safeReply, nowInfo);
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
    getCurrentContextSnapshot,
    buildDefaultAiPlaybooks
};
