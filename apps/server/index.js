// ============================================================
// BOT HIME - MANAGER 6.5 (HUMAN ALERT PROTOCOL)
// - Fix: Detecta pedidos de humano/atendente
// - Fix: Pausa o bot automaticamente e notifica o painel com som
// - Mantem: Sincronizacao e funcionalidades anteriores
// ============================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
require('dotenv').config();
process.env.TZ = process.env.TZ || process.env.HIMEFIT_TZ || 'America/Sao_Paulo';

// IMPORTACAO IA
let gerarRespostaIA = async () => "IA Indisponivel";
let transcreverAudioIA = async () => "[Erro Audio]";
let generateSeedAdDrafts = async () => { throw new Error('ads_ai_unavailable'); };
let generateCustomAdDraft = async () => { throw new Error('ads_ai_unavailable'); };
let synthesizeAdSpeech = async () => { throw new Error('ads_ai_unavailable'); };
let getAIContextSnapshot = () => ({
    contexto_length: 0,
    avisos_length: 0,
    contexto_mtime_ms: 0,
    avisos_mtime_ms: 0
});
let getAdsAICapabilities = () => ({
    enabled: false,
    can_generate_scripts: false,
    can_synthesize: false,
    text_model_configured: false,
    openai_configured: false,
    voice_model: String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'),
    voice: String(process.env.OPENAI_TTS_VOICE || 'coral'),
    warning: 'Locucao sintetica por IA desativada.'
});
try {
    const ai = require('./ai_service');
    gerarRespostaIA = ai.gerarRespostaIA;
    transcreverAudioIA = ai.transcreverAudioIA;
    generateSeedAdDrafts = ai.generateSeedAdDrafts || generateSeedAdDrafts;
    generateCustomAdDraft = ai.generateCustomAdDraft || generateCustomAdDraft;
    synthesizeAdSpeech = ai.synthesizeAdSpeech || synthesizeAdSpeech;
    getAIContextSnapshot = ai.getCurrentContextSnapshot || getAIContextSnapshot;
    getAdsAICapabilities = ai.getAdsAICapabilities || getAdsAICapabilities;
    console.log("[ok] IA Conectada.");
} catch (e) { console.error("[warn] Crie 'ai_service.js'!"); }

const {
    createAttendanceActionPromptSender,
    extractAttendanceInteractiveCommand
} = require('./attendance_interactive_runtime');

// IMPORTACOES BAILEYS (CJS + ESM compat)
let makeWASocket = null;
let useMultiFileAuthState = null;
let downloadMediaMessage = null;
let DisconnectReason = null;
let fetchLatestBaileysVersion = null;
let generateWAMessageFromContent = null;

async function ensureBaileysLoaded() {
    if (makeWASocket && useMultiFileAuthState && downloadMediaMessage && DisconnectReason && fetchLatestBaileysVersion) {
        return;
    }

    let mod = null;
    try {
        mod = require('@whiskeysockets/baileys');
    } catch (e) {
        if (e?.code !== 'ERR_REQUIRE_ESM') throw e;
        mod = await import('@whiskeysockets/baileys');
    }

    const loaded = mod?.default && mod?.default?.default ? mod.default : mod;
    makeWASocket = loaded?.default || loaded?.makeWASocket || loaded;
    useMultiFileAuthState = loaded?.useMultiFileAuthState;
    downloadMediaMessage = loaded?.downloadMediaMessage;
    DisconnectReason = loaded?.DisconnectReason;
    fetchLatestBaileysVersion = loaded?.fetchLatestBaileysVersion;
    generateWAMessageFromContent = loaded?.generateWAMessageFromContent || null;

    if (!makeWASocket || !useMultiFileAuthState || !downloadMediaMessage || !DisconnectReason || !fetchLatestBaileysVersion) {
        throw new Error('baileys_load_failed');
    }
}
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const fs = require('fs');
const crypto = require('crypto');
const { writeFile, unlink, readdir, stat } = require('fs/promises');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const https = require('https');
const dns = require('dns');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
const multer = require('multer');
const Database = require('better-sqlite3');
const { execFile, spawn, spawnSync } = require('child_process');
const { resolveAppPaths } = require('./app_paths');
const { createPanelAuth } = require('./panel_auth');
const { registerCoreSecurityRoutes } = require('./routes/core_security_routes');
const { registerKnowledgeAdminRoutes } = require('./routes/knowledge_admin_routes');
const { registerSystemAdminRoutes } = require('./routes/system_admin_routes');
const { registerChatAdminRoutes } = require('./routes/chat_admin_routes');
const { registerAttendanceAdminRoutes } = require('./routes/attendance_admin_routes');
const { registerPanelHostSetup } = require('./bootstrap/panel_host_setup');
const { startRuntimeServices } = require('./bootstrap/runtime_startup');
const {
    ensureDir,
    isPathInside,
    archiveLegacyPath,
    bootstrapDataRootLayout: bootstrapRuntimeDataRootLayout,
    getSafeFilename,
    resolvePublicMediaPath,
    sendSafeStaticFile
} = require('./runtime_storage');

// --- AUDITORIA RUNTIME (opcional) ---
const AUDIT_RUNTIME = process.env.AUDIT_RUNTIME === '1';
function auditLog(msg) { if (AUDIT_RUNTIME) console.log(`[audit] ${msg}`); }

// --- CONFIGURACOES ---
const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const FFMPEG_LOCAL_PATH = ffmpegPath; 
const APP_PACKAGE = require('./package.json');
const APP_VERSION = String(APP_PACKAGE?.version || '0.0.0');
const PORT = process.env.PORT || 3001;
const NOME_DO_USUARIO_PAINEL = process.env.PAINEL_USER || 'admin';
const RAW_PAINEL_PASS = process.env.PAINEL_PASS;
if (!RAW_PAINEL_PASS || RAW_PAINEL_PASS.trim() === '' || RAW_PAINEL_PASS.toLowerCase() === 'admin' || RAW_PAINEL_PASS === 'trocar-esta-senha') {
    console.error('\n[FATAL] PAINEL_PASS nao foi configurado de forma segura.');
    console.error('[FATAL] Defina uma senha forte na variavel de ambiente PAINEL_PASS no arquivo .env antes de iniciar o servidor.');
    console.error('[FATAL] Valores proibidos: vazio, "admin", "trocar-esta-senha".\n');
    process.exit(1);
}
const SENHA_DO_PAINEL = RAW_PAINEL_PASS;
const DISABLE_WHATSAPP = process.env.HIMEFIT_DISABLE_WHATSAPP === '1';
const SKIP_RUNTIME_MIGRATION = process.env.HIMEFIT_SKIP_RUNTIME_MIGRATION === '1';
const SKIP_LEGACY_USER_IMPORT = process.env.HIMEFIT_SKIP_LEGACY_USER_IMPORT === '1';
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024 * 1024; 

https.globalAgent.options.lookup = (hostname, options, callback) => { return dns.lookup(hostname, options, callback); };
function timeoutPromise(promise, time, message) { return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), time))]); }

function stripInvisibleGarbage(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060]/g, '');
}

function hasMojibake(text) {
    return typeof text === 'string' && /[\u00C3\u00C2\u00E2\u00EF\uFFFD]/.test(text);
}

function repairReplacementArtifacts(text) {
    if (typeof text !== 'string') return text;
    return text
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
    if (typeof text !== 'string') return text;
    const cleanedInput = repairReplacementArtifacts(stripInvisibleGarbage(text));
    if (!hasMojibake(cleanedInput)) return cleanedInput;
    const candidates = [cleanedInput];
    try { candidates.push(Buffer.from(cleanedInput, 'latin1').toString('utf8')); } catch (e) {}
    try { candidates.push(decodeURIComponent(escape(cleanedInput))); } catch (e) {}

    const score = (s) => {
        if (typeof s !== 'string') return Number.MAX_SAFE_INTEGER;
        const bad = (s.match(/[\u00C3\u00C2\u00E2\u00EF\uFFFD]/g) || []).length;
        return bad * 10 + s.length;
    };

    let best = cleanedInput;
    let bestScore = score(cleanedInput);
    for (const c of candidates) {
        const sc = score(c);
        if (sc < bestScore) {
            best = c;
            bestScore = sc;
        }
    }
    return stripInvisibleGarbage(best);
}

function findFfprobe() {
    if (ffmpegPath) {
        const dir = path.dirname(ffmpegPath);
        const cand = path.join(dir, 'ffprobe.exe');
        if (fs.existsSync(cand)) return cand;
    }
    return 'ffprobe';
}
const FFPROBE_PATH = findFfprobe();

// GATILHOS ESPECIAIS
const GATILHOS_AULA_EXPERIMENTAL = ['aula experimental', 'teste', 'conhecer', 'visitante'];
const HUMAN_HANDOFF_CONFIRM_TTL_MS = 5 * 60 * 1000;

// --- DIRETORIOS ---
const APP_PATHS = resolveAppPaths(__dirname, process.env, process.platform);
const {
    ROOT_DIR,
    IS_WINDOWS,
    APP_PROFILE,
    IS_COMMERCIAL_PROFILE,
    DATA_ROOT_DIR,
    DATA_DIR,
    STORAGE_DIR,
    BACKUP_DIR,
    UPDATES_DIR,
    LOGS_DIR,
    ADS_DIR,
    CHAT_MEDIA_DIR,
    AUTH_SESSION_DIR,
    CACHE_DIR,
    RADIO_CACHE_FILE,
    KNOWLEDGE_DIR,
    KNOWLEDGE_PUBLISHED_FILE,
    BASE_CONTEXT_FILE,
    BASE_CONTEXT_TEMPLATE_FILE,
    RADIO_TRASH_DIR,
    DB_FILE,
    PENDING_RESTORE_DB_FILE,
    LEGACY_OWNER_ROOT,
    LEGACY_OWNER_CHAT_MEDIA_DIR
} = APP_PATHS;
const LEGACY_CHAT_ENABLED = process.env.LEGACY_DISABLE_CHAT !== '1';
const ATTENDANCE_ENABLED = process.env.ATTENDANCE_ENABLED !== '0';
const ATTENDANCE_REMINDER_ENABLED = ATTENDANCE_ENABLED && process.env.ATTENDANCE_REMINDER_ENABLED !== '0';
const ATTENDANCE_REMINDER_BEFORE_MIN = Math.max(1, Math.min(120, Number(process.env.ATTENDANCE_REMINDER_BEFORE_MIN || 10)));
const ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED = ATTENDANCE_ENABLED && process.env.ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED !== '0';
const ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN = Math.max(5, Math.min(240, Number(process.env.ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN || 35)));
const ATTENDANCE_EXIT_PRE_REMINDER_ENABLED = ATTENDANCE_ENABLED && process.env.ATTENDANCE_EXIT_PRE_REMINDER_ENABLED !== '0';
const ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN = Math.max(1, Math.min(180, Number(process.env.ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN || 5)));
const ATTENDANCE_EXIT_REMINDER_ENABLED = ATTENDANCE_ENABLED && process.env.ATTENDANCE_EXIT_REMINDER_ENABLED !== '0';
const ATTENDANCE_EXIT_REMINDER_AFTER_MIN = Math.max(1, Math.min(180, Number(process.env.ATTENDANCE_EXIT_REMINDER_AFTER_MIN || 15)));
const ATTENDANCE_CONSECUTIVE_GAP_MIN = Math.max(0, Math.min(60, Number(process.env.ATTENDANCE_CONSECUTIVE_GAP_MIN || 15)));
const ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN = 30;
const ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN = 30;
const ATTENDANCE_EXIT_MANUAL_GRACE_AFTER_END_MIN = 0;
const ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED = true;
const ATTENDANCE_ENTRY_WINDOW_AFTER_MIN = -ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN;
const SCA_SYNC_ENABLED = process.env.SCA_SYNC_ENABLED === '1';
const SCA_SYNC_TOKEN = String(process.env.SCA_SYNC_TOKEN || '').trim();
const ATTENDANCE_GEO_DEFAULTS = {
    enabled: true,
    require_entry_location: true,
    require_exit_location: false,
    academy_lat: null,
    academy_lng: null,
    radius_m: 150,
    fallback_mode: 'justify_and_alert',
    request_ttl_sec: 300
};
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_IMAGE_RETENTION_DAYS = Math.max(1, Math.min(3650, Number(process.env.CHAT_IMAGE_RETENTION_DAYS || 90)));
const CHAT_IMAGE_ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const CHAT_STICKER_MAX_BYTES = Math.max(64 * 1024, Math.min(5 * 1024 * 1024, Number(process.env.CHAT_STICKER_MAX_BYTES || (5 * 1024 * 1024))));
const CHAT_STICKER_ALLOWED_MIME = new Set(['image/webp', 'application/octet-stream']);
const MAX_TRACK_ERROR_RETRIES = Number(process.env.RADIO_MAX_ERRORS || 3);
const envNum = (raw, fallback) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
};
const RADIO_SILENCE_SAMPLE_SEC = Math.max(5, envNum(process.env.RADIO_SILENCE_SAMPLE_SEC, 22));
const RADIO_SILENCE_MEAN_DB = envNum(process.env.RADIO_SILENCE_MEAN_DB, -55);
const RADIO_SILENCE_MAX_DB = envNum(process.env.RADIO_SILENCE_MAX_DB, -45);
const RADIO_SILENCE_CACHE_TTL_MS = Math.max(60 * 1000, envNum(process.env.RADIO_SILENCE_CACHE_TTL_MS, 6 * 60 * 60 * 1000));
const RADIO_SILENCE_PROBE_TIMEOUT_MS = Math.max(2000, envNum(process.env.RADIO_SILENCE_PROBE_TIMEOUT_MS, 15000));
const RADIO_NORMALIZE_ENABLED = process.env.RADIO_NORMALIZE_ENABLED !== '0';
const RADIO_NORMALIZE_TARGET_MEAN_DB = envNum(process.env.RADIO_NORMALIZE_TARGET_MEAN_DB, -18);
const RADIO_NORMALIZE_HEADROOM_DB = envNum(process.env.RADIO_NORMALIZE_HEADROOM_DB, -1.5);
const RADIO_NORMALIZE_MAX_BOOST_DB = Math.max(0, envNum(process.env.RADIO_NORMALIZE_MAX_BOOST_DB, 8));
const RADIO_NORMALIZE_MAX_CUT_DB = Math.max(0, envNum(process.env.RADIO_NORMALIZE_MAX_CUT_DB, 10));
const RADIO_TRANSIENT_ERROR_WINDOW_MS = Math.max(30 * 1000, envNum(process.env.RADIO_TRANSIENT_ERROR_WINDOW_MS, 90 * 1000));
const RADIO_TRANSIENT_ERROR_LIMIT = Math.max(1, Math.floor(envNum(process.env.RADIO_TRANSIENT_ERROR_LIMIT, 3)));
const LEGACY_RUNTIME_ARCHIVE_DIR = path.join(DATA_ROOT_DIR, 'migration_archive');
const PUBLIC_ASSETS_DIR = path.join(ROOT_DIR, 'assets');
const PUBLIC_MEDIA_FILE_MAP = new Map([
    ['notify.wav', path.join(ROOT_DIR, 'notify.wav')],
    ['notify.mp3', path.join(ROOT_DIR, 'notify.mp3')]
]);

function initializeRuntimeStorage() {
    bootstrapRuntimeDataRootLayout({
        dirsToEnsure: [DATA_ROOT_DIR, DATA_DIR, STORAGE_DIR, BACKUP_DIR, UPDATES_DIR, LOGS_DIR, ADS_DIR, CACHE_DIR, KNOWLEDGE_DIR, CHAT_MEDIA_DIR, AUTH_SESSION_DIR, LEGACY_RUNTIME_ARCHIVE_DIR],
        skipRuntimeMigration: SKIP_RUNTIME_MIGRATION,
        dataRootDir: DATA_ROOT_DIR,
        rootDir: ROOT_DIR,
        legacyRuntimeArchiveDir: LEGACY_RUNTIME_ARCHIVE_DIR,
        legacyMappings: [
            { src: path.join(ROOT_DIR, 'himefit.db'), dest: DB_FILE },
            { src: path.join(ROOT_DIR, 'himefit.db-wal'), dest: `${DB_FILE}-wal` },
            { src: path.join(ROOT_DIR, 'himefit.db-shm'), dest: `${DB_FILE}-shm` },
            { src: path.join(ROOT_DIR, 'knowledge'), dest: KNOWLEDGE_DIR },
            { src: path.join(ROOT_DIR, 'contexto_academia.txt'), dest: BASE_CONTEXT_FILE },
            { src: path.join(ROOT_DIR, '_backup'), dest: BACKUP_DIR },
            { src: path.join(ROOT_DIR, 'updates'), dest: UPDATES_DIR },
            { src: path.join(ROOT_DIR, 'atendimentos_logs'), dest: LOGS_DIR },
            { src: path.join(ROOT_DIR, 'ads_mp3'), dest: ADS_DIR },
            { src: path.join(ROOT_DIR, 'radio_cache'), dest: CACHE_DIR },
            { src: path.join(ROOT_DIR, 'radio_cache.json'), dest: RADIO_CACHE_FILE },
            { src: path.join(ROOT_DIR, 'himefit_auth_session'), dest: AUTH_SESSION_DIR },
            { src: LEGACY_OWNER_CHAT_MEDIA_DIR, dest: CHAT_MEDIA_DIR }
        ]
    });
}

initializeRuntimeStorage();

[DATA_ROOT_DIR, DATA_DIR, STORAGE_DIR, BACKUP_DIR, UPDATES_DIR, LOGS_DIR, ADS_DIR, CACHE_DIR, KNOWLEDGE_DIR, CHAT_MEDIA_DIR, AUTH_SESSION_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });
if (!fs.existsSync(BASE_CONTEXT_FILE) && fs.existsSync(BASE_CONTEXT_TEMPLATE_FILE)) {
    try { fs.copyFileSync(BASE_CONTEXT_TEMPLATE_FILE, BASE_CONTEXT_FILE); } catch (e) {}
}
if (fs.existsSync(PENDING_RESTORE_DB_FILE)) {
    try {
        if (fs.existsSync(DB_FILE)) {
            const recoveryFile = path.join(BACKUP_DIR, `pre_restore_${Date.now()}.db`);
            fs.copyFileSync(DB_FILE, recoveryFile);
        }
        fs.copyFileSync(PENDING_RESTORE_DB_FILE, DB_FILE);
        fs.unlinkSync(PENDING_RESTORE_DB_FILE);
    } catch (e) {
        console.error('[system] falha ao aplicar restore pendente:', e?.message || e);
    }
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

let baseContextCache = '';
function loadBaseContext() {
    try {
        if (fs.existsSync(BASE_CONTEXT_FILE)) {
            baseContextCache = fs.readFileSync(BASE_CONTEXT_FILE, 'utf-8');
        } else {
            baseContextCache = '';
        }
    } catch (e) { /* keep last */ }
}
loadBaseContext();

function toRel(p) { return path.relative(ROOT_DIR, p).replace(/\\/g, '/'); }
function resolveSafeMediaPath(relPath) {
    if (!relPath || typeof relPath !== 'string') return null;
    const abs = path.resolve(ROOT_DIR, relPath);
    const norm = abs.toLowerCase();
    const cacheRoot = path.resolve(CACHE_DIR).toLowerCase();
    const adsRoot = path.resolve(ADS_DIR).toLowerCase();
    if (norm.startsWith(cacheRoot + path.sep) || norm.startsWith(adsRoot + path.sep)) return abs;
    return null;
}

function fingerprintFile(file) {
    const stat = fs.statSync(file);
    const size = stat.size;
    const fd = fs.openSync(file, 'r');
    const bufSize = Math.min(2 * 1024 * 1024, size);
    const buf = Buffer.alloc(bufSize);
    fs.readSync(fd, buf, 0, bufSize, 0);
    fs.closeSync(fd);
    const hash = crypto.createHash('sha256').update(buf).update(String(size)).digest('hex');
    return { size, hash };
}

function runFfprobe(file) {
    return new Promise((resolve) => {
        execFile(FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,channels,sample_rate,bit_rate', '-of', 'json', file], (err, stdout) => {
            if (err) return resolve({ ok: false, error: err.message });
            try { return resolve({ ok: true, data: JSON.parse(stdout) }); }
            catch (e) { return resolve({ ok: false, error: 'parse_error' }); }
        });
    });
}

async function scanDir(dir, kind) {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3')).map(f => path.join(dir, f));
    const results = [];
    for (const file of files) {
        const fp = fingerprintFile(file);
        const meta = await runFfprobe(file);
        const entry = { kind, file: toRel(file), size: fp.size, fp: fp.hash, ok: meta.ok, issues: [], duration: 0, codec: null };
        if (!meta.ok) {
            entry.issues.push('ffprobe_failed');
        } else {
            const format = meta.data.format || {};
            const streams = meta.data.streams || [];
            const audioStream = streams.find(s => s.codec_type === 'audio');
            entry.duration = Number(format.duration || 0);
            entry.codec = audioStream?.codec_name || null;
            if (!audioStream) entry.issues.push('no_audio_stream');
            if (!entry.duration || entry.duration <= 0) entry.issues.push('duration_zero');
            if (!entry.codec) entry.issues.push('codec_missing');
            if (entry.duration > 0 && entry.duration < 5) entry.issues.push('too_short');
        }
        results.push(entry);
    }
    return results;
}

function findDuplicates(items) {
    const byFp = {};
    items.forEach(it => { if (!byFp[it.fp]) byFp[it.fp] = []; byFp[it.fp].push(it); });
    return Object.values(byFp).filter(group => group.length > 1);
}

async function runRadioCheck() {
    const music = await scanDir(CACHE_DIR, 'music');
    const ads = await scanDir(ADS_DIR, 'ads');
    const all = [...music, ...ads];
    const dupes = findDuplicates(all);
    const issues = all.filter(i => i.issues.length);
    return {
        scannedAt: new Date().toISOString(),
        totals: {
            music: music.length,
            ads: ads.length,
            issues: issues.length,
            duplicates: dupes.length
        },
        issues,
        duplicates: dupes
    };
}

function moveToRadioTrash(file, reason) {
    ensureDir(RADIO_TRASH_DIR);
    const sub = reason || 'misc';
    const destDir = path.join(RADIO_TRASH_DIR, sub);
    ensureDir(destDir);
    const base = path.basename(file);
    let dest = path.join(destDir, base);
    if (fs.existsSync(dest)) dest = path.join(destDir, `${Date.now()}_${base}`);
    fs.renameSync(file, dest);
    return dest;
}

function runRadioCheckScript(mode = 'report') {
    return new Promise((resolve, reject) => {
        const script = path.join(ROOT_DIR, 'scripts', 'radio_check.js');
        if (!fs.existsSync(script)) return reject(new Error('script_not_found'));
        const nodeBin = process.execPath;
        execFile(nodeBin, [script, `--mode=${mode}`], { cwd: ROOT_DIR }, (err, stdout) => {
            if (err) return reject(err);
            const reportsDir = path.join(ROOT_DIR, 'reports');
            if (!fs.existsSync(reportsDir)) return resolve({ ok: true, report: null });
            const files = fs.readdirSync(reportsDir)
                .filter(f => f.startsWith('radio_check_') && f.endsWith('.json'))
                .sort();
            if (!files.length) return resolve({ ok: true, report: null });
            const latest = path.join(reportsDir, files[files.length - 1]);
            try {
                const data = JSON.parse(fs.readFileSync(latest, 'utf-8'));
                return resolve({ ok: true, report: data, reportFile: toRel(latest) });
            } catch (e) {
                return resolve({ ok: true, report: null, reportFile: toRel(latest) });
            }
        });
    });
}

// --- AUTH HELPERS ---
const {
    SESSION_COOKIE,
    SESSION_TTL_MS,
    hashPassword,
    verifyPassword,
    isStrongPassword,
    parseCookieHeader,
    hashToken,
    createSession,
    getSessionFromReq,
    setSessionCookie,
    clearSessionCookie,
    rateLimitLogin
} = createPanelAuth({
    db
});

function getRadioSetting(key, fallback) {
    try {
        const row = db.prepare('SELECT value FROM radio_settings WHERE key=?').get(key);
        if (!row) return fallback;
        return JSON.parse(row.value);
    } catch (e) { return fallback; }
}

function setRadioSetting(key, value) {
    try {
        const now = Date.now();
        db.prepare('INSERT INTO radio_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
            .run(key, JSON.stringify(value), now);
    } catch (e) { console.error('[radio] setting error', e.message); }
}

const SYSTEM_CONFIG_KEY = 'system.config.v1';
const SYSTEM_UPDATE_STATE_KEY = 'system.update.state.v1';
const OPS_ALERTS_CONFIG_KEY = 'ops.alerts.v1';
const SYSTEM_CONFIG_SECRET_FIELDS = new Set(['aiApiKey', 'updatesToken']);
const SYSTEM_DEFAULT_CONFIG = {
    onboardingCompleted: false,
    academyName: '',
    adminDisplayName: '',
    whatsappRequired: true,
    aiEnabled: true,
    aiApiKey: '',
    radioEnabled: true,
    attendanceEnabled: true,
    updatesEnabled: true,
    updatesManifestUrl: '',
    updatesChannel: 'stable',
    updatedAt: 0
};
const OPS_ALERTS_DEFAULT_CONFIG = {
    enabled: true,
    whatsappDestinations: [],
    thresholds: {
        scaLagWarnSec: 1800,
        scaLagCriticalSec: 5400,
        backupWarnAgeMin: 720,
        backupCriticalAgeMin: 1440,
        downtimeWarnMin: 2,
        downtimeCriticalMin: 5,
        cooldownMin: 15,
        chatSlaDelayMin: 5,
        chatSlaCriticalMin: 15
    },
    updatedAt: 0
};

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
}

function safeJsonParse(raw, fallback = null) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function semverToTuple(v) {
    const m = String(v || '0.0.0').trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return [0, 0, 0];
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
    const ta = semverToTuple(a);
    const tb = semverToTuple(b);
    for (let i = 0; i < 3; i += 1) {
        if (ta[i] > tb[i]) return 1;
        if (ta[i] < tb[i]) return -1;
    }
    return 0;
}

function encryptWithDpapi(value) {
    if (!IS_WINDOWS) return '';
    try {
        const script = `[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($args[0]), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))`;
        const result = spawnSync('powershell', ['-NoProfile', '-Command', script, String(value || '')], {
            encoding: 'utf8',
            windowsHide: true
        });
        if (result.status !== 0) return '';
        const out = String(result.stdout || '').trim();
        return out ? `dpapi:v1:${out}` : '';
    } catch (e) {
        return '';
    }
}

function decryptWithDpapi(cipherText) {
    const raw = String(cipherText || '');
    if (!raw.startsWith('dpapi:v1:')) return '';
    const payload = raw.slice('dpapi:v1:'.length);
    if (!payload) return '';
    try {
        const script = `[Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($args[0]), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser))`;
        const result = spawnSync('powershell', ['-NoProfile', '-Command', script, payload], {
            encoding: 'utf8',
            windowsHide: true
        });
        if (result.status !== 0) return '';
        return String(result.stdout || '').trim();
    } catch (e) {
        return '';
    }
}

function getOrCreateConfigKey() {
    const keyFile = path.join(STORAGE_DIR, 'system.secrets.key');
    try {
        if (fs.existsSync(keyFile)) {
            const buf = fs.readFileSync(keyFile);
            if (buf.length >= 32) return crypto.createHash('sha256').update(buf).digest();
        }
        const fresh = crypto.randomBytes(32);
        fs.writeFileSync(keyFile, fresh);
        return crypto.createHash('sha256').update(fresh).digest();
    } catch (e) {
        return crypto.createHash('sha256').update(`${ROOT_DIR}:${PORT}:fallback`).digest();
    }
}

function encryptConfigSecret(plain) {
    const value = String(plain || '');
    if (!value) return '';
    if (IS_COMMERCIAL_PROFILE && IS_WINDOWS) {
        const dpapi = encryptWithDpapi(value);
        if (dpapi) return dpapi;
    }
    try {
        const key = getOrCreateConfigKey();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `enc:v1:${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
    } catch (e) {
        return '';
    }
}

function decryptConfigSecret(cipherText) {
    const raw = String(cipherText || '');
    if (raw.startsWith('dpapi:v1:')) {
        const plain = decryptWithDpapi(raw);
        return plain || '';
    }
    if (!raw.startsWith('enc:v1:')) return raw;
    const parts = raw.split(':');
    if (parts.length !== 5) return '';
    try {
        const [, , ivB64, dataB64, tagB64] = parts;
        const key = getOrCreateConfigKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        const plain = Buffer.concat([
            decipher.update(Buffer.from(dataB64, 'base64')),
            decipher.final()
        ]);
        return plain.toString('utf8');
    } catch (e) {
        return '';
    }
}

function getAppConfigRaw(key, fallback = null) {
    try {
        const row = db.prepare('SELECT value_json FROM app_config WHERE key=?').get(String(key || ''));
        if (!row) return fallback;
        return safeJsonParse(row.value_json, fallback);
    } catch (e) {
        return fallback;
    }
}

function setAppConfigRaw(key, value, options = {}) {
    const now = Date.now();
    const updatedBy = String(options.updatedBy || '');
    const isSecret = options.isSecret ? 1 : 0;
    db.prepare(`
        INSERT INTO app_config (key, value_json, is_secret, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value_json=excluded.value_json,
            is_secret=excluded.is_secret,
            updated_by=excluded.updated_by,
            updated_at=excluded.updated_at
    `).run(String(key || ''), JSON.stringify(value), isSecret, updatedBy, now);
}

function mergeSystemConfig(partial) {
    const current = getSystemConfig();
    return {
        ...current,
        ...(partial || {})
    };
}

function getSystemConfig() {
    const stored = getAppConfigRaw(SYSTEM_CONFIG_KEY, {});
    const merged = {
        ...SYSTEM_DEFAULT_CONFIG,
        ...(stored || {})
    };
    for (const field of SYSTEM_CONFIG_SECRET_FIELDS) {
        if (typeof merged[field] === 'string' && merged[field].startsWith('enc:v1:')) {
            merged[field] = decryptConfigSecret(merged[field]);
        }
    }
    return merged;
}

function setSystemConfig(nextConfig, options = {}) {
    const current = getSystemConfig();
    const merged = {
        ...current,
        ...(nextConfig || {})
    };
    for (const field of SYSTEM_CONFIG_SECRET_FIELDS) {
        if (typeof merged[field] === 'string' && merged[field]) {
            merged[field] = encryptConfigSecret(merged[field]);
        } else if (!merged[field]) {
            merged[field] = '';
        }
    }
    merged.updatedAt = Date.now();
    setAppConfigRaw(SYSTEM_CONFIG_KEY, merged, { updatedBy: options.updatedBy || '', isSecret: 1 });
    return getSystemConfig();
}

function normalizeOpsDestinationsInput(rawList = []) {
    const out = [];
    const values = Array.isArray(rawList)
        ? rawList
        : String(rawList || '').split(/[\n,;]/g);
    const seen = new Set();
    for (const raw of values) {
        const digits = normalizePhoneDigits(raw || '');
        if (!digits || digits.length < 10) continue;
        const jid = `${digits}@s.whatsapp.net`;
        if (seen.has(jid)) continue;
        seen.add(jid);
        out.push(jid);
    }
    return out;
}

function normalizeOpsThresholdNumber(raw, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    const rounded = Math.floor(n);
    if (rounded < min) return min;
    if (rounded > max) return max;
    return rounded;
}

function normalizeOpsAlertsConfigInput(payload, currentConfig = OPS_ALERTS_DEFAULT_CONFIG) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const current = currentConfig && typeof currentConfig === 'object' ? currentConfig : OPS_ALERTS_DEFAULT_CONFIG;
    const sourceThresholds = source.thresholds && typeof source.thresholds === 'object' ? source.thresholds : {};
    const currentThresholds = current.thresholds && typeof current.thresholds === 'object' ? current.thresholds : OPS_ALERTS_DEFAULT_CONFIG.thresholds;
    const delayMin = normalizeOpsThresholdNumber(
        sourceThresholds.chatSlaDelayMin,
        Number(currentThresholds.chatSlaDelayMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.chatSlaDelayMin),
        { min: 1, max: 720 }
    );
    const criticalMinRaw = normalizeOpsThresholdNumber(
        sourceThresholds.chatSlaCriticalMin,
        Number(currentThresholds.chatSlaCriticalMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.chatSlaCriticalMin),
        { min: 2, max: 1440 }
    );
    const criticalMin = Math.max(delayMin + 1, criticalMinRaw);
    return {
        enabled: source.enabled !== false,
        whatsappDestinations: normalizeOpsDestinationsInput(source.whatsappDestinations ?? current.whatsappDestinations ?? []),
        thresholds: {
            scaLagWarnSec: normalizeOpsThresholdNumber(sourceThresholds.scaLagWarnSec, Number(currentThresholds.scaLagWarnSec || OPS_ALERTS_DEFAULT_CONFIG.thresholds.scaLagWarnSec), { min: 60, max: 604800 }),
            scaLagCriticalSec: normalizeOpsThresholdNumber(sourceThresholds.scaLagCriticalSec, Number(currentThresholds.scaLagCriticalSec || OPS_ALERTS_DEFAULT_CONFIG.thresholds.scaLagCriticalSec), { min: 120, max: 1209600 }),
            backupWarnAgeMin: normalizeOpsThresholdNumber(sourceThresholds.backupWarnAgeMin, Number(currentThresholds.backupWarnAgeMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.backupWarnAgeMin), { min: 5, max: 10080 }),
            backupCriticalAgeMin: normalizeOpsThresholdNumber(sourceThresholds.backupCriticalAgeMin, Number(currentThresholds.backupCriticalAgeMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.backupCriticalAgeMin), { min: 10, max: 20160 }),
            downtimeWarnMin: normalizeOpsThresholdNumber(sourceThresholds.downtimeWarnMin, Number(currentThresholds.downtimeWarnMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.downtimeWarnMin), { min: 1, max: 720 }),
            downtimeCriticalMin: normalizeOpsThresholdNumber(sourceThresholds.downtimeCriticalMin, Number(currentThresholds.downtimeCriticalMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.downtimeCriticalMin), { min: 2, max: 1440 }),
            cooldownMin: normalizeOpsThresholdNumber(sourceThresholds.cooldownMin, Number(currentThresholds.cooldownMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.cooldownMin), { min: 1, max: 1440 }),
            chatSlaDelayMin: delayMin,
            chatSlaCriticalMin: criticalMin
        },
        updatedAt: Number(current.updatedAt || 0)
    };
}

function getOpsAlertsConfig() {
    const stored = getAppConfigRaw(OPS_ALERTS_CONFIG_KEY, {});
    return normalizeOpsAlertsConfigInput({
        ...OPS_ALERTS_DEFAULT_CONFIG,
        ...(stored || {}),
        thresholds: {
            ...OPS_ALERTS_DEFAULT_CONFIG.thresholds,
            ...((stored && stored.thresholds) || {})
        }
    }, OPS_ALERTS_DEFAULT_CONFIG);
}

function setOpsAlertsConfig(nextConfig, updatedBy = 'system') {
    const normalized = normalizeOpsAlertsConfigInput(nextConfig, getOpsAlertsConfig());
    normalized.updatedAt = Date.now();
    setAppConfigRaw(OPS_ALERTS_CONFIG_KEY, normalized, { updatedBy, isSecret: 0 });
    return getOpsAlertsConfig();
}

function maskSystemConfig(config) {
    const output = deepClone(config || {});
    for (const field of SYSTEM_CONFIG_SECRET_FIELDS) {
        const value = String(output[field] || '');
        output[field] = value ? '********' : '';
    }
    return output;
}

function getSystemUpdateState() {
    return {
        lastCheckAt: 0,
        lastCheckError: '',
        lastManifest: null,
        pendingPackagePath: '',
        pendingVersion: '',
        lastApplyAt: 0,
        lastApplyError: '',
        ...getAppConfigRaw(SYSTEM_UPDATE_STATE_KEY, {})
    };
}

function setSystemUpdateState(partial, updatedBy = 'system') {
    const next = {
        ...getSystemUpdateState(),
        ...(partial || {})
    };
    setAppConfigRaw(SYSTEM_UPDATE_STATE_KEY, next, { updatedBy, isSecret: 0 });
    return next;
}

function buildBackupFilename(prefix = 'backup') {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    return `${prefix}_${stamp}.db`;
}

function createDatabaseBackup(prefix = 'backup') {
    ensureDir(BACKUP_DIR);
    const target = path.join(BACKUP_DIR, buildBackupFilename(prefix));
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(DB_FILE, target);
    return target;
}

function restoreDatabaseBackup(absolutePath) {
    const src = path.resolve(String(absolutePath || ''));
    const backupsRoot = path.resolve(BACKUP_DIR);
    const normalizedSrc = src.toLowerCase();
    const normalizedRoot = backupsRoot.toLowerCase();
    if (!normalizedSrc.startsWith(`${normalizedRoot}${path.sep}`)) {
        throw new Error('invalid_backup_path');
    }
    if (!fs.existsSync(src)) throw new Error('backup_not_found');
    fs.copyFileSync(src, PENDING_RESTORE_DB_FILE);
    return {
        pendingRestoreFile: PENDING_RESTORE_DB_FILE,
        requiresRestart: true
    };
}

function normalizeSystemConfigInput(payload, currentConfig = SYSTEM_DEFAULT_CONFIG) {
    const src = payload && typeof payload === 'object' ? payload : {};
    return {
        ...currentConfig,
        academyName: sanitizePublicText(src.academyName ?? currentConfig.academyName ?? '', 120),
        adminDisplayName: sanitizePublicText(src.adminDisplayName ?? currentConfig.adminDisplayName ?? '', 120),
        whatsappRequired: src.whatsappRequired !== false,
        aiEnabled: src.aiEnabled !== false,
        aiApiKey: String(src.aiApiKey ?? currentConfig.aiApiKey ?? '').trim(),
        radioEnabled: src.radioEnabled !== false,
        attendanceEnabled: src.attendanceEnabled !== false,
        updatesEnabled: src.updatesEnabled !== false,
        // Mantido apenas para compatibilidade com payload legado; a URL efetiva agora é resolvida no backend.
        updatesManifestUrl: sanitizePublicText(currentConfig.updatesManifestUrl ?? '', 500),
        updatesChannel: sanitizePublicText(src.updatesChannel ?? currentConfig.updatesChannel ?? 'stable', 40) || 'stable',
        onboardingCompleted: src.onboardingCompleted === true || currentConfig.onboardingCompleted === true
    };
}

function getRequestOrigin(req) {
    if (!req) return '';
    const forwardedProtoRaw = String(req.headers?.['x-forwarded-proto'] || '').trim();
    const forwardedProto = forwardedProtoRaw.split(',')[0].trim();
    const secure = req.secure || forwardedProto === 'https';
    const proto = secure ? 'https' : 'http';

    const forwardedHostRaw = String(req.headers?.['x-forwarded-host'] || '').trim();
    const host = (forwardedHostRaw.split(',')[0].trim() || String(req.headers?.host || '').trim()).toLowerCase();
    if (!host) return '';
    return `${proto}://${host}`;
}

function resolveUpdatesManifestUrl(req = null, config = null) {
    const envOverride = String(process.env.HIMEFIT_UPDATES_MANIFEST_URL || '').trim();
    if (envOverride) return envOverride;

    const cfg = config || getSystemConfig();
    const legacyValue = String(cfg?.updatesManifestUrl || '').trim();
    if (legacyValue) return legacyValue;

    const origin = getRequestOrigin(req);
    if (origin) return `${origin.replace(/\/+$/, '')}/updates/manifest.json`;

    return `http://127.0.0.1:${PORT}/updates/manifest.json`;
}

function fetchJsonOverHttp(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const rawUrl = String(url || '').trim();
        if (!rawUrl) return reject(new Error('missing_url'));
        let parsed = null;
        try { parsed = new URL(rawUrl); } catch (e) { return reject(new Error('invalid_url')); }
        const client = parsed.protocol === 'https:' ? https : http;
        const req = client.get(parsed, { timeout: timeoutMs }, (resp) => {
            const status = Number(resp.statusCode || 0);
            if (status < 200 || status >= 300) {
                resp.resume();
                return reject(new Error(`http_${status}`));
            }
            const chunks = [];
            resp.on('data', (chunk) => chunks.push(chunk));
            resp.on('end', () => {
                try {
                    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    resolve(payload);
                } catch (e) {
                    reject(new Error('invalid_json'));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('timeout'));
        });
        req.on('error', (err) => reject(err));
    });
}

function downloadFileOverHttp(url, destinationFile, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
        const rawUrl = String(url || '').trim();
        if (!rawUrl) return reject(new Error('missing_url'));
        let parsed = null;
        try { parsed = new URL(rawUrl); } catch (e) { return reject(new Error('invalid_url')); }
        const client = parsed.protocol === 'https:' ? https : http;
        ensureDir(path.dirname(destinationFile));
        const tempFile = `${destinationFile}.part`;
        const write = fs.createWriteStream(tempFile);
        const req = client.get(parsed, { timeout: timeoutMs }, (resp) => {
            const status = Number(resp.statusCode || 0);
            if (status < 200 || status >= 300) {
                resp.resume();
                write.close(() => {
                    try { fs.unlinkSync(tempFile); } catch (e) {}
                    reject(new Error(`http_${status}`));
                });
                return;
            }
            resp.pipe(write);
            write.on('finish', () => {
                write.close(() => {
                    fs.renameSync(tempFile, destinationFile);
                    resolve(destinationFile);
                });
            });
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', (err) => {
            try { write.close(); } catch (e) {}
            try { fs.unlinkSync(tempFile); } catch (e) {}
            reject(err);
        });
    });
}

async function checkForSystemUpdate(manifestUrlOverride = '') {
    const config = getSystemConfig();
    if (!config.updatesEnabled) throw new Error('updates_disabled');
    const manifestUrl = String(manifestUrlOverride || resolveUpdatesManifestUrl(null, config) || '').trim();
    if (!manifestUrl) throw new Error('missing_manifest_url');
    const manifest = await fetchJsonOverHttp(manifestUrl, 12000);
    const remoteVersion = String(manifest?.version || '').trim();
    if (!remoteVersion) throw new Error('invalid_manifest_version');
    const rawPackageUrl = String(manifest?.url || manifest?.packageUrl || '').trim();
    if (!rawPackageUrl) throw new Error('invalid_manifest_package_url');
    let packageUrl = '';
    try {
        packageUrl = new URL(rawPackageUrl, manifestUrl).toString();
    } catch (e) {
        throw new Error('invalid_manifest_package_url');
    }
    const hasUpdate = compareSemver(remoteVersion, APP_VERSION) > 0;
    return {
        hasUpdate,
        currentVersion: APP_VERSION,
        remoteVersion,
        manifest: {
            version: remoteVersion,
            url: packageUrl,
            notes: String(manifest?.notes || ''),
            sha256: String(manifest?.sha256 || ''),
            manifestUrl
        }
    };
}

function logAdminAction(action, actor, target, meta, ip) {
    try {
        db.prepare('INSERT INTO admin_audit (action, actor, target, meta_json, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(action, actor || '', target || '', JSON.stringify(meta || {}), ip || '', Date.now());
    } catch (e) { console.error('[admin] audit error', e.message); }
}

const RADIO_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
function isValidRadioVideoId(value) {
    return RADIO_VIDEO_ID_RE.test(String(value || '').trim());
}
function extractRadioVideoIdFromCandidate(candidate) {
    const raw = String(candidate || '').trim();
    if (!raw) return '';
    if (isValidRadioVideoId(raw)) return raw;
    try {
        const url = new URL(raw);
        const byV = String(url.searchParams.get('v') || '').trim();
        if (isValidRadioVideoId(byV)) return byV;
        const parts = String(url.pathname || '').split('/').filter(Boolean);
        const shortId = parts[0] || '';
        if (url.hostname.includes('youtu.be') && isValidRadioVideoId(shortId)) return shortId;
        for (let i = 1; i < parts.length; i += 1) {
            const prev = parts[i - 1];
            const current = parts[i];
            if (['embed', 'shorts', 'live'].includes(prev) && isValidRadioVideoId(current)) return current;
        }
    } catch (_) {}
    const match = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
    return match?.[1] || '';
}
function resolveRadioTrackVideoId(track) {
    if (!track || typeof track !== 'object') return '';
    const direct = extractRadioVideoIdFromCandidate(track.videoId || track.youtubeId || '');
    if (direct) return direct;
    return extractRadioVideoIdFromCandidate(track.url || track.webpage_url || track.originalUrl || track.sourceUrl || '');
}
function normalizeIncomingRadioTrack(track) {
    if (!track || typeof track !== 'object') return null;
    const videoId = resolveRadioTrackVideoId(track);
    if (!videoId) return null;
    return { ...track, videoId };
}
function isRecoveredDurationPlaceholder(track) {
    const title = String(track?.title || '').trim();
    const durationSec = Number(track?.duration_sec || 0);
    return /m[uú]sica recuperada \(/i.test(title) && durationSec === 180;
}

function sanitizePlaylistTable() {
    try {
        const invalidRows = db.prepare("SELECT id, videoId, status FROM playlist").all().filter((row) => {
            const videoId = String(row?.videoId || '').trim();
            const status = String(row?.status || '').trim();
            return !isValidRadioVideoId(videoId) || !['pending', 'ready', 'error'].includes(status);
        });
        if (!invalidRows.length) return 0;
        const removeRow = db.prepare('DELETE FROM playlist WHERE id=?');
        const transaction = db.transaction((rows) => {
            rows.forEach((row) => removeRow.run(row.id));
        });
        transaction(invalidRows);
        console.warn(`[radio] removidas ${invalidRows.length} entradas invalidas da playlist`);
        return invalidRows.length;
    } catch (e) {
        console.error('[radio] falha ao sanitizar playlist', e.message);
        return 0;
    }
}

// --- DATABASE SETUP ---
db.prepare(`CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, name TEXT, history TEXT, tags TEXT, notes TEXT, last_activity INTEGER, paused_by_human INTEGER DEFAULT 0, status TEXT DEFAULT 'active', route_jid TEXT DEFAULT '', sla_pending_since INTEGER DEFAULT 0, sla_status TEXT DEFAULT 'ok', sla_updated_at INTEGER DEFAULT 0)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS panel_users (username TEXT PRIMARY KEY, password TEXT, role TEXT DEFAULT 'user', fullname TEXT DEFAULT 'Atendente', avatar TEXT DEFAULT '')`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS panel_sessions (token_hash TEXT PRIMARY KEY, username TEXT, role TEXT, created_at INTEGER, expires_at INTEGER)`).run();
db.prepare(`CREATE INDEX IF NOT EXISTS idx_panel_sessions_username ON panel_sessions (username)`).run();
try { db.prepare(`ALTER TABLE panel_users ADD COLUMN active INTEGER DEFAULT 1`).run(); } catch (e) {}
try { db.prepare(`ALTER TABLE panel_users ADD COLUMN created_at INTEGER`).run(); } catch (e) {}
try { db.prepare(`ALTER TABLE panel_users ADD COLUMN updated_at INTEGER`).run(); } catch (e) {}
db.prepare(`CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, song TEXT, created_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS radio_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, comment TEXT, created_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS playlist (id INTEGER PRIMARY KEY AUTOINCREMENT, videoId TEXT, title TEXT, duration TEXT, duration_sec INTEGER DEFAULT 0, added_at INTEGER, status TEXT DEFAULT 'pending')`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, content_json TEXT, published INTEGER DEFAULT 0, author TEXT, created_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ads_history (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, data_json TEXT, file TEXT, reason TEXT, username TEXT, created_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ad_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    advertiser TEXT DEFAULT '',
    file TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'per_day',
    runs_per_day INTEGER DEFAULT 3,
    interval_hours REAL DEFAULT 1,
    start_at INTEGER NOT NULL,
    end_at INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ad_campaign_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    file TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT DEFAULT '',
    played_at INTEGER NOT NULL,
    meta_json TEXT DEFAULT '{}'
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS business_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS advertisers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    segment_id INTEGER,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ad_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    plan_name TEXT DEFAULT 'Padrao',
    value_cents INTEGER DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    daily_executions INTEGER DEFAULT 3,
    ad_duration_seconds INTEGER DEFAULT 30,
    contract_status TEXT DEFAULT 'active',
    payment_status TEXT DEFAULT 'paid',
    segment_exclusive INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS radio_ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser_id INTEGER NOT NULL,
    contract_id INTEGER,
    campaign_id INTEGER,
    name TEXT NOT NULL,
    file TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 30,
    volume REAL DEFAULT 1,
    status TEXT DEFAULT 'pending',
    approved_at INTEGER,
    priority INTEGER DEFAULT 0,
    allowed_hours_start TEXT DEFAULT '06:00',
    allowed_hours_end TEXT DEFAULT '23:00',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ad_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    ad_id INTEGER NOT NULL,
    contract_id INTEGER,
    campaign_id INTEGER,
    execution_status TEXT DEFAULT 'pending',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ad_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_id INTEGER,
    contract_id INTEGER,
    advertiser_id INTEGER,
    campaign_id INTEGER,
    scheduled_time TEXT DEFAULT '',
    played_at INTEGER NOT NULL,
    actual_duration_seconds REAL,
    status TEXT NOT NULL,
    error_message TEXT DEFAULT '',
    created_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS radio_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    is_secret INTEGER DEFAULT 0,
    updated_by TEXT DEFAULT '',
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS ai_feedback_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    actor TEXT DEFAULT '',
    feedback_type TEXT DEFAULT 'inadequada',
    reason TEXT DEFAULT '',
    last_user_message TEXT DEFAULT '',
    last_ai_message TEXT DEFAULT '',
    context_json TEXT DEFAULT '{}',
    created_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, actor TEXT, target TEXT, meta_json TEXT, ip TEXT, created_at INTEGER)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS contact_alias (jid TEXT PRIMARY KEY, canonical_jid TEXT NOT NULL, updated_at INTEGER, source TEXT DEFAULT 'runtime')`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    whatsapp_phone TEXT NOT NULL,
    whatsapp_jid TEXT NOT NULL UNIQUE,
    whatsapp_confirmed INTEGER DEFAULT 0,
    notes TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    class_name TEXT DEFAULT '',
    schedule_type TEXT DEFAULT 'function',
    activity_id INTEGER,
    activity_label TEXT DEFAULT '',
    value_per_class REAL DEFAULT 0,
    tolerance_min INTEGER DEFAULT 5,
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_class_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_id INTEGER NOT NULL,
    activity_label TEXT NOT NULL,
    weekday INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'context',
    source_key TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    last_seen_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_activity_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    default_value REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    source TEXT DEFAULT 'whatsapp',
    event_at INTEGER NOT NULL,
    message_text TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_geo_policy (
    id INTEGER PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    require_entry_location INTEGER DEFAULT 1,
    require_exit_location INTEGER DEFAULT 0,
    academy_lat REAL,
    academy_lng REAL,
    radius_m INTEGER DEFAULT 150,
    fallback_mode TEXT DEFAULT 'justify_and_alert',
    request_ttl_sec INTEGER DEFAULT 300,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_geo_pending (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    sender_jid TEXT NOT NULL,
    event_type TEXT NOT NULL,
    requested_at INTEGER,
    expires_at INTEGER,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_absence_justifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date_key TEXT NOT NULL,
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'whatsapp',
    status TEXT NOT NULL DEFAULT 'approved_auto',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS attendance_vacations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    note TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_by TEXT DEFAULT '',
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS sca_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT DEFAULT '',
    name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    status TEXT DEFAULT '',
    plan TEXT DEFAULT '',
    last_access_at INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS sca_access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_event_id TEXT NOT NULL,
    source TEXT DEFAULT 'sca_csv',
    external_id TEXT DEFAULT '',
    name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    event_type TEXT NOT NULL,
    event_at INTEGER NOT NULL,
    status TEXT DEFAULT '',
    plan TEXT DEFAULT '',
    gate TEXT DEFAULT '',
    raw_json TEXT DEFAULT '{}',
    created_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS sca_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT DEFAULT 'sca_csv',
    actor TEXT DEFAULT '',
    started_at INTEGER,
    finished_at INTEGER,
    received_count INTEGER DEFAULT 0,
    inserted_count INTEGER DEFAULT 0,
    duplicated_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    created_at INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS sca_sync_connector_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT DEFAULT 'sca_db',
    engine_detected TEXT DEFAULT '',
    db_file TEXT DEFAULT '',
    last_scan_at INTEGER DEFAULT 0,
    last_error TEXT DEFAULT '',
    lag_sec INTEGER DEFAULT 0,
    meta_json TEXT DEFAULT '{}',
    updated_at INTEGER
)`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_events_employee_at ON attendance_events(employee_id, event_at)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_schedules_employee_weekday ON attendance_schedules(employee_id, weekday)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_catalog_type_active ON attendance_activity_catalog(type, active, sort_order)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_tpl_active ON attendance_class_templates(active, weekday, start_time)').run();
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_tpl_source_key ON attendance_class_templates(source_key)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_geo_pending_employee_status ON attendance_geo_pending(employee_id, status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_geo_pending_sender_status ON attendance_geo_pending(sender_jid, status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_just_emp_date ON attendance_absence_justifications(employee_id, date_key)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_just_status ON attendance_absence_justifications(status)').run();
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uniq_attendance_just_emp_date ON attendance_absence_justifications(employee_id, date_key)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_vac_emp_range ON attendance_vacations(employee_id, start_date, end_date, active)').run();
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uniq_sca_access_source_event ON sca_access_events(source_event_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_access_phone_at ON sca_access_events(phone, event_at)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_access_external_at ON sca_access_events(external_id, event_at)').run();
db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS uniq_sca_people_external ON sca_people(external_id) WHERE external_id <> ''").run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_people_phone ON sca_people(phone)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_runs_finished ON sca_sync_runs(finished_at)').run();
db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uniq_sca_connector_source ON sca_sync_connector_status(source)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_connector_updated ON sca_sync_connector_status(updated_at)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_feedback_conversation_created ON ai_feedback_events(conversation_id, created_at DESC)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback_events(created_at DESC)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_advertisers_segment_status ON advertisers(segment_id, status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ad_contracts_advertiser_status ON ad_contracts(advertiser_id, contract_status, payment_status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_radio_ads_contract_status ON radio_ads(contract_id, status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_radio_ads_campaign_id ON radio_ads(campaign_id)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ad_schedule_date_time ON ad_schedule(schedule_date, scheduled_time)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ad_schedule_campaign_status ON ad_schedule(campaign_id, execution_status)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ad_exec_logs_played_at ON ad_execution_logs(played_at)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_ad_exec_logs_campaign ON ad_execution_logs(campaign_id, played_at)').run();
db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_ad_campaign_runs_to_execution_logs
AFTER INSERT ON ad_campaign_runs
BEGIN
    INSERT INTO ad_execution_logs (
        ad_id,
        contract_id,
        advertiser_id,
        campaign_id,
        scheduled_time,
        played_at,
        actual_duration_seconds,
        status,
        error_message,
        created_at
    )
    SELECT
        ra.id,
        ra.contract_id,
        ra.advertiser_id,
        NEW.campaign_id,
        '',
        NEW.played_at,
        NULL,
        CASE
            WHEN NEW.status = 'played' THEN 'success'
            WHEN NEW.status = 'error' THEN 'failed'
            ELSE 'skipped'
        END,
        COALESCE(NEW.reason, ''),
        NEW.played_at
    FROM radio_ads ra
    WHERE ra.campaign_id = NEW.campaign_id
    LIMIT 1;

    UPDATE ad_schedule
       SET execution_status = CASE
            WHEN NEW.status = 'played' THEN 'played'
            WHEN NEW.status = 'error' THEN 'failed'
            ELSE 'skipped'
        END,
           updated_at = NEW.played_at
     WHERE id = (
        SELECT id
          FROM ad_schedule
         WHERE campaign_id = NEW.campaign_id
           AND schedule_date = date(NEW.played_at / 1000, 'unixepoch', 'localtime')
           AND execution_status = 'pending'
         ORDER BY scheduled_time ASC, id ASC
         LIMIT 1
     );
END;
`);

try { db.prepare("ALTER TABLE playlist ADD COLUMN duration_sec INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE playlist ADD COLUMN error_reason TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE playlist ADD COLUMN last_error_at INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE playlist ADD COLUMN error_count INTEGER DEFAULT 0").run(); } catch(e) {}
sanitizePlaylistTable();
try { db.prepare("ALTER TABLE conversations ADD COLUMN status TEXT DEFAULT 'active'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE conversations ADD COLUMN route_jid TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE conversations ADD COLUMN sla_pending_since INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE conversations ADD COLUMN sla_status TEXT DEFAULT 'ok'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE conversations ADD COLUMN sla_updated_at INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE knowledge_versions ADD COLUMN published INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE ad_campaigns ADD COLUMN advertiser TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE ad_campaigns ADD COLUMN notes TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE ad_campaigns ADD COLUMN priority INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE ad_campaigns ADD COLUMN is_active INTEGER DEFAULT 1").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN schedule_type TEXT DEFAULT 'function'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN activity_id INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN activity_label TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN value_per_class REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN source_type TEXT DEFAULT 'manual'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_schedules ADD COLUMN template_id INTEGER").run(); } catch(e) {}
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_attendance_sched_template ON attendance_schedules(employee_id, template_id, active)').run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_status TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_lat REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_lng REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_accuracy_m REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_distance_m REAL").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_events ADD COLUMN geo_note TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_geo_pending ADD COLUMN schedule_date_key TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_geo_pending ADD COLUMN block_start_min INTEGER").run(); } catch(e) {}
try { db.prepare("ALTER TABLE attendance_geo_pending ADD COLUMN block_end_min INTEGER").run(); } catch(e) {}

try {
    const segCount = Number(db.prepare('SELECT COUNT(1) AS c FROM business_segments').get()?.c || 0);
    if (segCount === 0) {
        const now = Date.now();
        const defaults = [
            ['Suplementacao', 'Lojas e marcas de suplementos'],
            ['Fisioterapia', 'Clinicas e profissionais de fisioterapia'],
            ['Estetica', 'Estetica, bem-estar e cosmeticos'],
            ['Alimentacao Saudavel', 'Restaurantes e delivery fit'],
            ['Saude', 'Clinicas, exames e servicos de saude']
        ];
        const insertSeg = db.prepare('INSERT INTO business_segments (name, description, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)');
        const tx = db.transaction((rows) => {
            rows.forEach(([name, description]) => insertSeg.run(name, description, now, now));
        });
        tx(defaults);
    }
} catch (e) {
    console.error('[radio-commercial] falha ao inicializar segmentos:', e?.message || e);
}

try {
    const existingSystemConfig = getAppConfigRaw(SYSTEM_CONFIG_KEY, null);
    if (!existingSystemConfig) {
        const bootstrapConfig = {
            ...SYSTEM_DEFAULT_CONFIG,
            academyName: process.env.HIMEFIT_ACADEMY_NAME || '',
            adminDisplayName: process.env.HIMEFIT_ADMIN_NAME || '',
            updatesManifestUrl: process.env.HIMEFIT_UPDATES_MANIFEST_URL || ''
        };
        setSystemConfig(bootstrapConfig, { updatedBy: 'bootstrap' });
    }
    const existingUpdateState = getAppConfigRaw(SYSTEM_UPDATE_STATE_KEY, null);
    if (!existingUpdateState) {
        setSystemUpdateState({
            lastCheckAt: 0,
            lastCheckError: '',
            lastManifest: null,
            pendingPackagePath: '',
            pendingVersion: '',
            lastApplyAt: 0,
            lastApplyError: ''
        }, 'bootstrap');
    }
    const existingOpsAlerts = getAppConfigRaw(OPS_ALERTS_CONFIG_KEY, null);
    if (!existingOpsAlerts) {
        setOpsAlertsConfig(OPS_ALERTS_DEFAULT_CONFIG, 'bootstrap');
    }
} catch (e) {
    console.error('[system] falha ao inicializar app_config:', e?.message || e);
}

function repairDatabaseEncoding() {
    try {
        const convRows = db.prepare('SELECT id, name, history, tags, notes FROM conversations').all();
        const updateConv = db.prepare('UPDATE conversations SET name=?, history=?, tags=?, notes=? WHERE id=?');
        let convFixed = 0;
        for (const row of convRows) {
            let changed = false;
            const fixedName = fixMojibakeText(row.name || '');
            const fixedNotes = fixMojibakeText(row.notes || '');
            let history = [];
            let tags = [];
            try { history = JSON.parse(row.history || '[]'); } catch (e) { history = []; }
            try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
            const fixedHistory = history.map((h) => typeof h === 'string' ? fixMojibakeText(h) : h);
            const fixedTags = tags.map((t) => typeof t === 'string' ? fixMojibakeText(t) : t);
            if (fixedName !== (row.name || '')) changed = true;
            if (fixedNotes !== (row.notes || '')) changed = true;
            if (JSON.stringify(fixedHistory) !== JSON.stringify(history)) changed = true;
            if (JSON.stringify(fixedTags) !== JSON.stringify(tags)) changed = true;
            if (changed) {
                updateConv.run(fixedName, JSON.stringify(fixedHistory), JSON.stringify(fixedTags), fixedNotes, row.id);
                convFixed += 1;
            }
        }

        const playRows = db.prepare('SELECT id, title FROM playlist').all();
        const updatePlaylist = db.prepare('UPDATE playlist SET title=? WHERE id=?');
        let playlistFixed = 0;
        for (const row of playRows) {
            const fixedTitle = fixMojibakeText(row.title || '');
            if (fixedTitle !== (row.title || '')) {
                updatePlaylist.run(fixedTitle, row.id);
                playlistFixed += 1;
            }
        }

        if (convFixed || playlistFixed) {
            console.log(`[encoding] corrigido: conversations=${convFixed}, playlist=${playlistFixed}`);
        }
    } catch (e) {
        console.error('[encoding] falha ao corrigir banco:', e.message);
    }
}
repairDatabaseEncoding();

function importLegacyPanelUsers() {
    if (SKIP_LEGACY_USER_IMPORT) return;
    const legacyUsersFile = path.join(ROOT_DIR, 'usuarios.json');
    if (!fs.existsSync(legacyUsersFile)) return;
    try {
        const parsed = JSON.parse(fs.readFileSync(legacyUsersFile, 'utf-8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const insertUser = db.prepare('INSERT INTO panel_users (username, password, role, fullname) VALUES (?, ?, ?, ?)');
        const updateRole = db.prepare('UPDATE panel_users SET role=? WHERE username=?');
        for (const [rawUsername, rawPassword] of Object.entries(parsed)) {
            const username = sanitizePublicText(rawUsername, 60).toLowerCase();
            const password = String(rawPassword || '').trim();
            if (!username || !password) continue;
            const existing = db.prepare('SELECT username, role FROM panel_users WHERE username=?').get(username);
            const role = username === NOME_DO_USUARIO_PAINEL ? 'admin' : (existing?.role || 'user');
            if (!existing) {
                insertUser.run(username, hashPassword(password), role, username === NOME_DO_USUARIO_PAINEL ? 'Administrador' : username);
            } else if (username === NOME_DO_USUARIO_PAINEL && existing.role !== 'admin') {
                updateRole.run('admin', username);
            }
        }
        archiveLegacyPath(legacyUsersFile, LEGACY_RUNTIME_ARCHIVE_DIR);
    } catch (e) {
        console.error('[auth] falha ao importar usuarios legados:', e?.message || e);
    }
}

function ensureDefaultPanelAdmin() {
    try {
        const adminUsername = NOME_DO_USUARIO_PAINEL;
        const existing = db.prepare('SELECT username, fullname FROM panel_users WHERE username = ?').get(adminUsername);
        if (existing) {
            db.prepare('UPDATE panel_users SET role = ?, fullname = COALESCE(NULLIF(fullname, \'\'), ?) WHERE username = ?')
                .run('admin', 'Administrador', adminUsername);
            return;
        }
        db.prepare('INSERT INTO panel_users (username, password, role, fullname) VALUES (?, ?, ?, ?)')
            .run(adminUsername, hashPassword(SENHA_DO_PAINEL), 'admin', 'Administrador');
    } catch (e) {
        console.error('[auth] falha ao garantir admin padrao:', e?.message || e);
    }
}

function normalizePanelUsersTable() {
    const now = Date.now();
    try { db.prepare('UPDATE panel_users SET active=1 WHERE active IS NULL').run(); } catch (e) {}
    try { db.prepare('UPDATE panel_users SET created_at=? WHERE created_at IS NULL').run(now); } catch (e) {}
    try { db.prepare('UPDATE panel_users SET updated_at=COALESCE(updated_at, created_at, ?)').run(now); } catch (e) {}
}

importLegacyPanelUsers();
ensureDefaultPanelAdmin();
normalizePanelUsersTable();

function sanitizePublicText(input, maxLen) {
    if (input === null || input === undefined) return '';
    return String(input).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function normalizePhoneDigits(phoneRaw) {
    const digits = String(phoneRaw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
}

function toWhatsappJid(phoneRaw) {
    const digits = normalizePhoneDigits(phoneRaw);
    if (!digits) return '';
    return `${digits}@s.whatsapp.net`;
}

function brPhoneVariants(phoneRaw) {
    const base = normalizePhoneDigits(phoneRaw);
    const set = new Set();
    if (!base) return set;
    set.add(base);

    const addLocalVariants = (with55) => {
        if (!with55.startsWith('55')) return;
        const local = with55.slice(2);
        // BR old/new mobile normalization: optional 9 after DDD.
        if (local.length === 11 && local[2] === '9') {
            set.add(`55${local.slice(0, 2)}${local.slice(3)}`); // remove optional 9
        }
        if (local.length === 10) {
            set.add(`55${local.slice(0, 2)}9${local.slice(2)}`); // add optional 9
        }
    };

    addLocalVariants(base);
    return set;
}

function extractPhoneDigitsFromJid(jid) {
    if (!jid) return '';
    const raw = String(jid).split('@')[0] || '';
    const local = raw.split(':')[0] || raw;
    return local.replace(/\D/g, '');
}

function phoneFromJid(jid) {
    return extractPhoneDigitsFromJid(jid);
}

function formatDateTimeBR(ts) {
    const value = Number(ts || 0);
    if (!Number.isFinite(value) || value <= 0) return '';
    try {
        return new Date(value).toLocaleString('pt-BR');
    } catch (_) {
        return String(value);
    }
}

function formatDaysWithoutAccess(ts) {
    const value = Number(ts || 0);
    if (!Number.isFinite(value) || value <= 0) return null;
    const diff = Date.now() - value;
    if (diff < 0) return 0;
    return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function upsertScaPersonSnapshot(event) {
    const externalId = sanitizePublicText(event.external_id || '', 120);
    const name = sanitizePublicText(event.name || '', 120);
    const phone = normalizePhoneDigits(event.phone || '');
    const status = sanitizePublicText(event.status || '', 40);
    const plan = sanitizePublicText(event.plan || '', 80);
    const eventAt = Number(event.event_at || 0);
    let row = null;
    if (externalId) {
        row = db.prepare('SELECT * FROM sca_people WHERE external_id=? LIMIT 1').get(externalId);
    }
    if (!row && phone) {
        row = db.prepare('SELECT * FROM sca_people WHERE phone=? ORDER BY updated_at DESC LIMIT 1').get(phone);
    }
    const now = Date.now();
    if (!row) {
        db.prepare(`
            INSERT INTO sca_people (external_id, name, phone, status, plan, last_access_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(externalId, name, phone, status, plan, eventAt || 0, now, now);
        return;
    }
    const nextExternalId = externalId || String(row.external_id || '');
    const nextName = name || String(row.name || '');
    const nextPhone = phone || String(row.phone || '');
    const nextStatus = status || String(row.status || '');
    const nextPlan = plan || String(row.plan || '');
    const nextLastAccessAt = Math.max(Number(row.last_access_at || 0), Number(eventAt || 0));
    db.prepare(`
        UPDATE sca_people
        SET external_id=?, name=?, phone=?, status=?, plan=?, last_access_at=?, updated_at=?
        WHERE id=?
    `).run(nextExternalId, nextName, nextPhone, nextStatus, nextPlan, nextLastAccessAt, now, row.id);
}

function safeJsonStringify(value, fallback = '{}') {
    try {
        return JSON.stringify(value);
    } catch (_) {
        return fallback;
    }
}

function normalizeScaConnectorPayload(connector = null, fallbackSource = 'sca_db') {
    if (!connector || typeof connector !== 'object') return null;
    const source = sanitizePublicText(connector.source || fallbackSource || 'sca_db', 60) || 'sca_db';
    const engineDetected = sanitizePublicText(connector.engine_detected || connector.engine || '', 40);
    const dbFile = sanitizePublicText(connector.db_file || connector.dbFile || '', 320);
    const lastScanRaw = Number(connector.last_scan_at ?? connector.lastScanAt ?? 0);
    const lagRaw = Number(connector.lag_sec ?? connector.lagSec ?? 0);
    const meta =
        connector.meta && typeof connector.meta === 'object'
            ? connector.meta
            : {};
    const metaJsonFromPayload = typeof connector.meta_json === 'string' ? connector.meta_json : '';
    return {
        source,
        engine_detected: engineDetected,
        db_file: dbFile,
        last_scan_at: Number.isFinite(lastScanRaw) && lastScanRaw > 0 ? Math.floor(lastScanRaw) : 0,
        last_error: sanitizePublicText(connector.last_error || connector.lastError || '', 240),
        lag_sec: Number.isFinite(lagRaw) && lagRaw >= 0 ? Math.floor(lagRaw) : 0,
        meta_json: metaJsonFromPayload || safeJsonStringify(meta, '{}')
    };
}

function upsertScaConnectorStatus(connector = null) {
    const payload = normalizeScaConnectorPayload(connector);
    if (!payload) return null;
    const now = Date.now();
    db.prepare(`
        INSERT INTO sca_sync_connector_status (
            source, engine_detected, db_file, last_scan_at, last_error, lag_sec, meta_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
            engine_detected=excluded.engine_detected,
            db_file=excluded.db_file,
            last_scan_at=excluded.last_scan_at,
            last_error=excluded.last_error,
            lag_sec=excluded.lag_sec,
            meta_json=excluded.meta_json,
            updated_at=excluded.updated_at
    `).run(
        payload.source,
        payload.engine_detected,
        payload.db_file,
        payload.last_scan_at,
        payload.last_error,
        payload.lag_sec,
        payload.meta_json,
        now
    );
    return {
        source: payload.source,
        engine_detected: payload.engine_detected,
        db_file: payload.db_file,
        last_scan_at: payload.last_scan_at,
        last_error: payload.last_error,
        lag_sec: payload.lag_sec
    };
}

function upsertScaAccessBatch({ source = 'sca_csv', actor = 'system', events = [], connector = null } = {}) {
    const rows = Array.isArray(events) ? events : [];
    const startedAt = Date.now();
    const cleanSource = sanitizePublicText(source || 'sca_csv', 60) || 'sca_csv';
    const cleanActor = sanitizePublicText(actor || 'system', 80) || 'system';
    const connectorPayload = normalizeScaConnectorPayload(connector, cleanSource);
    let insertedCount = 0;
    let duplicatedCount = 0;
    let failedCount = 0;
    let lastError = '';
    const tx = db.transaction((list) => {
        for (const event of list) {
            const sourceEventId = sanitizePublicText(event?.source_event_id || '', 180);
            const externalId = sanitizePublicText(event?.external_id || '', 120);
            const name = sanitizePublicText(event?.name || '', 120);
            const phone = normalizePhoneDigits(event?.phone || '');
            const eventType = sanitizePublicText(event?.event_type || '', 20).toLowerCase();
            const eventAt = Number(event?.event_at || 0);
            const status = sanitizePublicText(event?.status || '', 40);
            const plan = sanitizePublicText(event?.plan || '', 80);
            const gate = sanitizePublicText(event?.gate || '', 80);
            const rawJson = JSON.stringify(event?.raw || event || {});
            if (!sourceEventId || !eventType || !Number.isFinite(eventAt) || eventAt <= 0 || (!externalId && !phone)) {
                failedCount += 1;
                lastError = 'invalid_event_payload';
                continue;
            }
            try {
                db.prepare(`
                    INSERT INTO sca_access_events (
                        source_event_id, source, external_id, name, phone, event_type, event_at, status, plan, gate, raw_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    sourceEventId,
                    cleanSource,
                    externalId,
                    name,
                    phone,
                    eventType,
                    eventAt,
                    status,
                    plan,
                    gate,
                    rawJson,
                    Date.now()
                );
                insertedCount += 1;
                upsertScaPersonSnapshot({
                    external_id: externalId,
                    name,
                    phone,
                    status,
                    plan,
                    event_at: eventAt
                });
            } catch (error) {
                const msg = String(error?.message || '');
                if (msg.includes('UNIQUE') || msg.includes('uniq_sca_access_source_event')) {
                    duplicatedCount += 1;
                } else {
                    failedCount += 1;
                    lastError = msg || 'insert_failed';
                }
            }
        }
    });
    tx(rows);
    const finishedAt = Date.now();
    const message = lastError || 'ok';
    db.prepare(`
        INSERT INTO sca_sync_runs (
            source, actor, started_at, finished_at, received_count, inserted_count, duplicated_count, failed_count, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        cleanSource,
        cleanActor,
        startedAt,
        finishedAt,
        rows.length,
        insertedCount,
        duplicatedCount,
        failedCount,
        sanitizePublicText(message, 240),
        Date.now()
    );
    if (connectorPayload) upsertScaConnectorStatus(connectorPayload);
    return {
        source: cleanSource,
        received_count: rows.length,
        inserted_count: insertedCount,
        duplicated_count: duplicatedCount,
        failed_count: failedCount,
        started_at: startedAt,
        finished_at: finishedAt,
        message
    };
}

function getScaSyncStatus() {
    const lastRun = db.prepare(`
        SELECT id, source, actor, started_at, finished_at, received_count, inserted_count, duplicated_count, failed_count, message
        FROM sca_sync_runs
        ORDER BY id DESC
        LIMIT 1
    `).get() || null;
    const lastSuccess = db.prepare(`
        SELECT finished_at
        FROM sca_sync_runs
        WHERE failed_count=0
        ORDER BY id DESC
        LIMIT 1
    `).get() || null;
    const lastError = db.prepare(`
        SELECT finished_at, message
        FROM sca_sync_runs
        WHERE failed_count>0
        ORDER BY id DESC
        LIMIT 1
    `).get() || null;
    const eventsTotal = Number(db.prepare('SELECT COUNT(1) AS total FROM sca_access_events').get()?.total || 0);
    const peopleTotal = Number(db.prepare('SELECT COUNT(1) AS total FROM sca_people').get()?.total || 0);
    const latestEvent = db.prepare('SELECT event_at FROM sca_access_events ORDER BY event_at DESC, id DESC LIMIT 1').get() || null;
    const latestEventAt = Number(latestEvent?.event_at || 0);
    const lagSec = latestEventAt > 0 ? Math.max(0, Math.floor((Date.now() - latestEventAt) / 1000)) : null;
    const connectorRaw = db.prepare(`
        SELECT source, engine_detected, db_file, last_scan_at, last_error, lag_sec, meta_json, updated_at
        FROM sca_sync_connector_status
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
    `).get() || null;
    let connectorMeta = {};
    try {
        connectorMeta = connectorRaw?.meta_json ? JSON.parse(connectorRaw.meta_json) : {};
    } catch (_) {
        connectorMeta = {};
    }
    const connectorLagSec = Number(connectorRaw?.lag_sec || 0);
    return {
        runs: {
            total: Number(db.prepare('SELECT COUNT(1) AS total FROM sca_sync_runs').get()?.total || 0),
            last: lastRun,
            last_success_at: Number(lastSuccess?.finished_at || 0),
            last_error_at: Number(lastError?.finished_at || 0),
            last_error_message: String(lastError?.message || '')
        },
        events: {
            total: eventsTotal,
            latest_event_at: latestEventAt,
            lag_sec: lagSec
        },
        people: {
            total: peopleTotal
        },
        connector: {
            source: String(connectorRaw?.source || 'sca_db'),
            engine_detected: sanitizePublicText(connectorRaw?.engine_detected || '', 40),
            db_file: sanitizePublicText(connectorRaw?.db_file || '', 320),
            last_scan_at: Number(connectorRaw?.last_scan_at || 0),
            last_error: sanitizePublicText(connectorRaw?.last_error || '', 240),
            lag_sec: Number.isFinite(connectorLagSec) && connectorLagSec >= 0 ? connectorLagSec : lagSec,
            updated_at: Number(connectorRaw?.updated_at || 0),
            meta: connectorMeta
        }
    };
}

const HEALTH_STATUS_RANK = { ok: 0, degraded: 1, critical: 2 };
let operationalHealthSnapshot = {
    generatedAt: 0,
    status: 'ok',
    components: {},
    incidents: [],
    summary: { ok: 0, degraded: 0, critical: 0 }
};
const operationalDowntimeSince = new Map();
const operationalIncidents = new Map();
let operationalHealthHash = '';
let operationalHealthTimer = null;

function normalizeHealthStatus(rawStatus) {
    const status = String(rawStatus || '').toLowerCase().trim();
    if (status === 'critical') return 'critical';
    if (status === 'degraded') return 'degraded';
    return 'ok';
}

function healthStatusRank(status) {
    return HEALTH_STATUS_RANK[normalizeHealthStatus(status)] || 0;
}

function normalizeIncidentMessage(message) {
    return sanitizePublicText(message || '', 240) || 'estado operacional alterado';
}

function collectBackupMetrics(thresholds) {
    const warnMin = Math.max(5, Number(thresholds?.backupWarnAgeMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.backupWarnAgeMin));
    const criticalMin = Math.max(warnMin + 1, Number(thresholds?.backupCriticalAgeMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.backupCriticalAgeMin));
    try {
        ensureDir(BACKUP_DIR);
        const files = fs.readdirSync(BACKUP_DIR)
            .filter((name) => name.toLowerCase().endsWith('.db'))
            .map((name) => {
                const full = path.join(BACKUP_DIR, name);
                const stat = fs.statSync(full);
                return {
                    name,
                    mtimeMs: Number(stat.mtimeMs || 0),
                    size: Number(stat.size || 0)
                };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs);
        const latest = files[0] || null;
        if (!latest) {
            return {
                status: 'critical',
                message: 'nenhum backup encontrado',
                metrics: {
                    latestFile: '',
                    latestAt: 0,
                    ageMin: null,
                    totalFiles: 0,
                    warnMin,
                    criticalMin
                }
            };
        }
        const ageMin = Math.max(0, Math.floor((Date.now() - latest.mtimeMs) / 60000));
        let status = 'ok';
        let message = 'backup atualizado';
        if (ageMin >= criticalMin) {
            status = 'critical';
            message = `backup atrasado (${ageMin} min)`;
        } else if (ageMin >= warnMin) {
            status = 'degraded';
            message = `backup envelhecido (${ageMin} min)`;
        }
        return {
            status,
            message,
            metrics: {
                latestFile: latest.name,
                latestAt: latest.mtimeMs,
                ageMin,
                totalFiles: files.length,
                warnMin,
                criticalMin
            }
        };
    } catch (error) {
        return {
            status: 'critical',
            message: normalizeIncidentMessage(error?.message || 'falha ao ler backups'),
            metrics: {
                latestFile: '',
                latestAt: 0,
                ageMin: null,
                totalFiles: 0,
                warnMin,
                criticalMin
            }
        };
    }
}

function collectOperationalComponents() {
    const config = getOpsAlertsConfig();
    const thresholds = config?.thresholds || OPS_ALERTS_DEFAULT_CONFIG.thresholds;
    const now = Date.now();
    const components = {};

    components.api = {
        status: 'ok',
        message: 'api online',
        metrics: {
            uptimeSec: Math.floor(process.uptime()),
            now
        }
    };

    try {
        db.prepare('SELECT 1 AS ok').get();
        components.db = {
            status: 'ok',
            message: 'db online',
            metrics: {}
        };
    } catch (error) {
        components.db = {
            status: 'critical',
            message: normalizeIncidentMessage(error?.message || 'db indisponivel'),
            metrics: {}
        };
    }

    if (DISABLE_WHATSAPP) {
        components.whatsapp = {
            status: 'ok',
            message: 'whatsapp desativado por configuracao',
            metrics: {
                connected: false,
                disabled: true,
                reconnectAttempts
            }
        };
    } else {
        let waStatus = 'ok';
        let waMessage = 'whatsapp conectado';
        if (!whatsappConnected && (startingSock || reconnectTimer)) {
            waStatus = 'degraded';
            waMessage = 'whatsapp reconectando';
        } else if (!whatsappConnected) {
            waStatus = 'critical';
            waMessage = whatsappLastError ? `whatsapp offline (${sanitizePublicText(whatsappLastError, 120)})` : 'whatsapp offline';
        }
        components.whatsapp = {
            status: waStatus,
            message: waMessage,
            metrics: {
                connected: !!whatsappConnected,
                reconnectAttempts: Number(reconnectAttempts || 0),
                lastErrorCode: Number(whatsappLastErrorCode || 0),
                lastError: sanitizePublicText(whatsappLastError || '', 120)
            }
        };
    }

    try {
        const totals = { clients: 0, admins: 0 };
        if (wss?.clients) {
            wss.clients.forEach((client) => {
                if (client.readyState !== client.OPEN) return;
                totals.clients += 1;
                if (client.isLogged && client.isAdmin) totals.admins += 1;
            });
        }
        components.ws = {
            status: 'ok',
            message: 'ws online',
            metrics: totals
        };
    } catch (error) {
        components.ws = {
            status: 'critical',
            message: normalizeIncidentMessage(error?.message || 'falha no websocket'),
            metrics: {}
        };
    }

    components.backup = collectBackupMetrics(thresholds);

    if (!SCA_SYNC_ENABLED) {
        components.sca_sync = {
            status: 'ok',
            message: 'sca sync desativado',
            metrics: {
                enabled: false
            }
        };
    } else {
        const scaStatus = getScaSyncStatus();
        const lagSec = Number(scaStatus?.connector?.lag_sec ?? scaStatus?.events?.lag_sec ?? 0);
        const warnLag = Math.max(60, Number(thresholds?.scaLagWarnSec || OPS_ALERTS_DEFAULT_CONFIG.thresholds.scaLagWarnSec));
        const criticalLag = Math.max(warnLag + 60, Number(thresholds?.scaLagCriticalSec || OPS_ALERTS_DEFAULT_CONFIG.thresholds.scaLagCriticalSec));
        let scaState = 'ok';
        let scaMessage = 'sync em dia';
        if (Number(scaStatus?.runs?.total || 0) <= 0) {
            scaState = 'degraded';
            scaMessage = 'sync ainda sem execucoes';
        } else if (lagSec >= criticalLag) {
            scaState = 'critical';
            scaMessage = `lag SCA alto (${lagSec}s)`;
        } else if (lagSec >= warnLag) {
            scaState = 'degraded';
            scaMessage = `lag SCA elevado (${lagSec}s)`;
        }
        if (scaState !== 'critical' && scaStatus?.connector?.last_error) {
            scaState = 'degraded';
            scaMessage = sanitizePublicText(`conector com erro: ${scaStatus.connector.last_error}`, 180);
        }
        components.sca_sync = {
            status: scaState,
            message: scaMessage,
            metrics: {
                enabled: true,
                lagSec,
                warnLag,
                criticalLag,
                runsTotal: Number(scaStatus?.runs?.total || 0),
                lastSuccessAt: Number(scaStatus?.runs?.last_success_at || 0),
                lastErrorAt: Number(scaStatus?.runs?.last_error_at || 0)
            }
        };
    }

    const downtimeWarnMin = Math.max(1, Number(thresholds?.downtimeWarnMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.downtimeWarnMin));
    const downtimeCriticalMin = Math.max(downtimeWarnMin + 1, Number(thresholds?.downtimeCriticalMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.downtimeCriticalMin));
    for (const [componentName, component] of Object.entries(components)) {
        const currentStatus = normalizeHealthStatus(component.status);
        if (currentStatus === 'ok') {
            operationalDowntimeSince.delete(componentName);
            component.status = 'ok';
            component.metrics = { ...(component.metrics || {}), downtimeSec: 0 };
            continue;
        }
        const existingSince = Number(operationalDowntimeSince.get(componentName) || 0);
        const since = existingSince > 0 ? existingSince : now;
        operationalDowntimeSince.set(componentName, since);
        const downtimeSec = Math.max(0, Math.floor((now - since) / 1000));
        const downtimeMin = downtimeSec / 60;
        let nextStatus = currentStatus;
        if (downtimeMin >= downtimeCriticalMin) {
            nextStatus = 'critical';
        } else if (downtimeMin >= downtimeWarnMin && nextStatus === 'ok') {
            nextStatus = 'degraded';
        }
        component.status = nextStatus;
        component.metrics = {
            ...(component.metrics || {}),
            downtimeSec,
            downtimeSince: since
        };
    }

    return { components, config };
}

function buildOperationalHealthSnapshot() {
    const now = Date.now();
    const { components } = collectOperationalComponents();
    let summary = { ok: 0, degraded: 0, critical: 0 };
    let overall = 'ok';
    for (const component of Object.values(components)) {
        const status = normalizeHealthStatus(component.status);
        summary[status] += 1;
        if (healthStatusRank(status) > healthStatusRank(overall)) overall = status;
    }
    return {
        generatedAt: now,
        status: overall,
        components,
        incidents: Array.from(operationalIncidents.values())
            .map((incident) => ({ ...incident }))
            .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0)),
        summary
    };
}

function buildIncidentHash(snapshot) {
    const compact = {
        status: snapshot.status,
        components: Object.fromEntries(
            Object.entries(snapshot.components || {}).map(([key, value]) => [
                key,
                {
                    status: value.status,
                    message: value.message,
                    lagSec: Number(value?.metrics?.lagSec || 0),
                    ageMin: Number(value?.metrics?.ageMin || 0),
                    downtimeSec: Number(value?.metrics?.downtimeSec || 0)
                }
            ])
        ),
        incidents: (snapshot.incidents || []).map((incident) => ({
            id: incident.id,
            status: incident.status,
            component: incident.component,
            openedAt: incident.openedAt,
            closedAt: incident.closedAt || 0
        }))
    };
    return JSON.stringify(compact);
}

function formatIncidentWhatsappMessage(incident, phase = 'opened') {
    const severity = String(incident?.status || 'degraded').toUpperCase();
    const component = sanitizePublicText(incident?.component || 'system', 80) || 'system';
    const title = phase === 'closed'
        ? `[HimeFit] Recuperacao ${component}`
        : `[HimeFit] Incidente ${severity} - ${component}`;
    const openedAt = Number(incident?.openedAt || 0);
    const closedAt = Number(incident?.closedAt || 0);
    const lines = [
        title,
        `Mensagem: ${sanitizePublicText(incident?.message || '', 180) || 'sem detalhes'}`,
        openedAt > 0 ? `Inicio: ${formatDateTimeBR(openedAt)}` : '',
        closedAt > 0 ? `Fim: ${formatDateTimeBR(closedAt)}` : ''
    ].filter(Boolean);
    return lines.join('\n');
}

async function dispatchOperationalWhatsappAlert(incident, phase = 'opened') {
    const config = getOpsAlertsConfig();
    if (!config?.enabled) return;
    const destinations = Array.isArray(config.whatsappDestinations) ? config.whatsappDestinations : [];
    if (!destinations.length) return;
    if (!sock?.user) return;
    const message = formatIncidentWhatsappMessage(incident, phase);
    await Promise.all(destinations.map(async (jid) => {
        try {
            await sock.sendMessage(jid, { text: message });
        } catch (error) {
            console.error('[ops-alert] falha ao enviar alerta whatsapp:', jid, error?.message || error);
        }
    }));
}

function broadcastToAdmins(message) {
    if (!wss?.clients) return;
    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState !== client.OPEN) return;
        if (!client.isLogged || !client.isAdmin) return;
        client.send(payload);
    });
}

function reconcileOperationalIncidents(snapshot) {
    const now = Date.now();
    const config = getOpsAlertsConfig();
    const cooldownMs = Math.max(60 * 1000, Number(config?.thresholds?.cooldownMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.cooldownMin) * 60 * 1000);

    for (const [componentName, component] of Object.entries(snapshot.components || {})) {
        const status = normalizeHealthStatus(component.status);
        const existing = operationalIncidents.get(componentName) || null;
        if (status === 'ok') {
            if (existing) {
                const closed = {
                    ...existing,
                    status: 'ok',
                    closedAt: now,
                    lastUpdatedAt: now
                };
                operationalIncidents.delete(componentName);
                broadcastToAdmins({ type: 'incident_closed', incident: closed });
                void dispatchOperationalWhatsappAlert(closed, 'closed');
            }
            continue;
        }

        if (!existing) {
            const opened = {
                id: `${componentName}:${now}`,
                component: componentName,
                status,
                message: normalizeIncidentMessage(component.message),
                openedAt: now,
                lastUpdatedAt: now,
                lastAlertAt: now,
                meta: component.metrics || {}
            };
            operationalIncidents.set(componentName, opened);
            broadcastToAdmins({ type: 'incident_opened', incident: opened });
            void dispatchOperationalWhatsappAlert(opened, 'opened');
            continue;
        }

        const escalated = healthStatusRank(status) > healthStatusRank(existing.status);
        const messageChanged = normalizeIncidentMessage(component.message) !== String(existing.message || '');
        existing.status = status;
        existing.message = normalizeIncidentMessage(component.message);
        existing.meta = component.metrics || {};
        existing.lastUpdatedAt = now;
        if (escalated || messageChanged) {
            const canAlert = (now - Number(existing.lastAlertAt || 0)) >= cooldownMs;
            if (canAlert) {
                existing.lastAlertAt = now;
                broadcastToAdmins({ type: 'incident_opened', incident: { ...existing, escalated } });
                void dispatchOperationalWhatsappAlert(existing, 'opened');
            }
        } else if ((now - Number(existing.lastAlertAt || 0)) >= cooldownMs) {
            existing.lastAlertAt = now;
            void dispatchOperationalWhatsappAlert(existing, 'opened');
        }
    }
}

function evaluateOperationalHealth({ emit = true } = {}) {
    const snapshot = buildOperationalHealthSnapshot();
    reconcileOperationalIncidents(snapshot);
    snapshot.incidents = Array.from(operationalIncidents.values())
        .map((incident) => ({ ...incident }))
        .sort((a, b) => Number(b.openedAt || 0) - Number(a.openedAt || 0));
    operationalHealthSnapshot = snapshot;
    const hash = buildIncidentHash(snapshot);
    if (emit && hash !== operationalHealthHash) {
        broadcastToAdmins({ type: 'system_health_update', health: snapshot });
    }
    operationalHealthHash = hash;
    return snapshot;
}

function getOperationalHealthSnapshot() {
    if (!operationalHealthSnapshot.generatedAt || (Date.now() - operationalHealthSnapshot.generatedAt) > 20000) {
        try {
            evaluateOperationalHealth({ emit: false });
        } catch (error) {
            console.error('[ops-health] falha ao atualizar snapshot:', error?.message || error);
        }
    }
    return operationalHealthSnapshot;
}

function startOperationalHealthMonitoring() {
    if (operationalHealthTimer) clearInterval(operationalHealthTimer);
    evaluateOperationalHealth({ emit: false });
    operationalHealthTimer = setInterval(() => {
        try {
            evaluateOperationalHealth({ emit: true });
            reevaluateAllConversationsSla({ emit: true, reason: 'sla_timer' });
        } catch (error) {
            console.error('[ops-health] monitor loop error:', error?.message || error);
        }
    }, 30000);
}

function buildScaContextSnippetForSender(senderJid, senderRawJid = '') {
    if (!SCA_SYNC_ENABLED) return '';
    const variants = new Set();
    const candidates = [senderJid, senderRawJid].filter(Boolean);
    for (const jid of candidates) {
        const phone = normalizePhoneDigits(extractPhoneDigitsFromJid(jid));
        if (!phone) continue;
        for (const variant of brPhoneVariants(phone)) {
            variants.add(variant);
        }
    }
    if (!variants.size) return '';
    const phones = [...variants];
    const placeholders = phones.map(() => '?').join(', ');
    const person = db.prepare(`
        SELECT *
        FROM sca_people
        WHERE phone IN (${placeholders})
        ORDER BY updated_at DESC
        LIMIT 1
    `).get(...phones) || null;
    const cutoff30 = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recent = db.prepare(`
        SELECT COUNT(1) AS total
        FROM sca_access_events
        WHERE phone IN (${placeholders}) AND event_at >= ?
    `).get(...phones, cutoff30);
    const lastEvent = db.prepare(`
        SELECT event_type, event_at, status, plan, gate
        FROM sca_access_events
        WHERE phone IN (${placeholders})
        ORDER BY event_at DESC, id DESC
        LIMIT 1
    `).get(...phones) || null;

    if (!person && !lastEvent) return '';
    const lines = [];
    if (person) {
        const displayName = sanitizePublicText(person.name || '', 120) || 'Aluno';
        const displayExternalId = sanitizePublicText(person.external_id || '', 120);
        lines.push(displayExternalId ? `Aluno SCA: ${displayName} (ID ${displayExternalId})` : `Aluno SCA: ${displayName}`);
        if (person.status) lines.push(`Status no SCA: ${person.status}`);
        if (person.plan) lines.push(`Plano: ${person.plan}`);
    }
    if (lastEvent) {
        const eventTypeLabel = lastEvent.event_type === 'entry'
            ? 'entrada'
            : lastEvent.event_type === 'exit'
                ? 'saida'
                : String(lastEvent.event_type || 'acesso');
        lines.push(`Ultimo acesso: ${formatDateTimeBR(lastEvent.event_at)} (${eventTypeLabel})`);
    }
    lines.push(`Acessos ultimos 30 dias: ${Number(recent?.total || 0)}`);
    const referenceTs = Number(lastEvent?.event_at || person?.last_access_at || 0);
    const daysWithout = formatDaysWithoutAccess(referenceTs);
    if (Number.isFinite(daysWithout) && daysWithout >= 7) {
        lines.push(`Alerta: sem acesso ha ${daysWithout} dias.`);
    }
    return lines.join('\n');
}

function dateKeyFromTs(ts) {
    const d = new Date(Number(ts || Date.now()));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseDateKeyInput(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
        const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
        if (dt.getFullYear() !== y || (dt.getMonth() + 1) !== mo || dt.getDate() !== d) return null;
        return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (m) {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        const y = Number(m[3]);
        if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
        const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
        if (dt.getFullYear() !== y || (dt.getMonth() + 1) !== mo || dt.getDate() !== d) return null;
        return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
}

function formatDateKeyBR(dateKey) {
    const safe = parseDateKeyInput(dateKey);
    if (!safe) return String(dateKey || '');
    const [y, m, d] = safe.split('-');
    return `${d}/${m}/${y}`;
}

function hhmmFromTs(ts) {
    const d = new Date(Number(ts || Date.now()));
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

function minutesToHHMM(mins) {
    const total = Math.max(0, Number(mins || 0));
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function parseHHMMToMinutes(raw) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(raw || ''));
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return (hh * 60) + mm;
}

const ATTENDANCE_ACTIVITY_SEED = [
    { type: 'class', name: 'Musculacao', default_value: 20, sort_order: 10 },
    { type: 'class', name: 'Ergometria', default_value: 20, sort_order: 20 },
    { type: 'class', name: 'Danca', default_value: 20, sort_order: 30 },
    { type: 'class', name: 'Capoeira', default_value: 20, sort_order: 40 },
    { type: 'class', name: 'Hidroginastica', default_value: 20, sort_order: 50 },
    { type: 'class', name: 'Natacao Infantil', default_value: 20, sort_order: 60 },
    { type: 'class', name: 'Natacao Baby', default_value: 20, sort_order: 70 },
    { type: 'class', name: 'Natacao Adulto', default_value: 20, sort_order: 80 },
    { type: 'class', name: 'Pilates', default_value: 20, sort_order: 90 },
    { type: 'function', name: 'Recepcao', default_value: 0, sort_order: 100 },
    { type: 'function', name: 'Limpeza', default_value: 0, sort_order: 110 },
    { type: 'function', name: 'Gerencia', default_value: 0, sort_order: 120 },
    { type: 'function', name: 'Administrativo', default_value: 0, sort_order: 130 },
    { type: 'function', name: 'Professor', default_value: 0, sort_order: 140 },
    { type: 'function', name: 'Expediente', default_value: 0, sort_order: 150 }
];

const ATTENDANCE_TEMPLATE_SEED = [
    { activity: 'Musculacao', weekday: 1, start_time: '06:00', end_time: '07:00' },
    { activity: 'Musculacao', weekday: 2, start_time: '06:00', end_time: '07:00' },
    { activity: 'Musculacao', weekday: 3, start_time: '06:00', end_time: '07:00' },
    { activity: 'Musculacao', weekday: 4, start_time: '06:00', end_time: '07:00' },
    { activity: 'Musculacao', weekday: 5, start_time: '06:00', end_time: '07:00' },
    { activity: 'Pilates', weekday: 1, start_time: '07:00', end_time: '08:00' },
    { activity: 'Pilates', weekday: 3, start_time: '07:00', end_time: '08:00' },
    { activity: 'Pilates', weekday: 5, start_time: '07:00', end_time: '08:00' },
    { activity: 'Natacao Infantil', weekday: 2, start_time: '16:00', end_time: '17:00' },
    { activity: 'Natacao Infantil', weekday: 4, start_time: '16:00', end_time: '17:00' },
    { activity: 'Natacao Adulto', weekday: 2, start_time: '19:00', end_time: '20:00' },
    { activity: 'Natacao Adulto', weekday: 4, start_time: '19:00', end_time: '20:00' }
];

function formatCurrencyBRL(value) {
    const n = Number(value || 0);
    try {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(n) ? n : 0);
    } catch (_) {
        return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
    }
}

function normalizeAttendanceActivityType(raw) {
    const v = String(raw || '').toLowerCase().trim();
    return v === 'class' ? 'class' : 'function';
}

function parseAttendanceActivityTypeStrict(raw) {
    const v = String(raw || '').toLowerCase().trim();
    if (v === 'class' || v === 'function') return v;
    return null;
}

function isAttendanceTeacherRole(role) {
    const normalized = normalizeTextForCommand(role || '');
    return normalized.includes('prof');
}

const ATTENDANCE_DEFAULT_EMPLOYEE_ROLE = 'Sem Função';
const ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN = 45;
const ATTENDANCE_TEMPLATE_SOURCE_CONTEXT = 'context';
const ATTENDANCE_TEMPLATE_SOURCE_MANUAL = 'manual';

function normalizeAttendanceTemplateIds(raw) {
    const out = [];
    const seen = new Set();
    if (!Array.isArray(raw)) return out;
    for (const idRaw of raw) {
        const id = Number(idRaw);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function normalizeHHMMInput(raw) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || '').trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function attendanceWeekdayMatches(text) {
    const norm = normalizeTextForCommand(text || '');
    const out = [];
    const seen = new Set();
    const re = /\b(dom(?:ingo)?|seg(?:unda)?|ter(?:ca)?|qua(?:rta)?|qui(?:nta)?|sex(?:ta)?|sab(?:ado)?)\b/g;
    let match = null;
    while ((match = re.exec(norm))) {
        const token = String(match[1] || '').slice(0, 3);
        const day = token === 'dom' ? 0
            : token === 'seg' ? 1
            : token === 'ter' ? 2
            : token === 'qua' ? 3
            : token === 'qui' ? 4
            : token === 'sex' ? 5
            : token === 'sab' ? 6
            : null;
        if (day === null || seen.has(day)) continue;
        seen.add(day);
        out.push(day);
    }
    return out;
}

function parseClassTemplateSegment(activityLabel, segmentText, defaultDurationMin = ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN) {
    const segment = String(segmentText || '').trim();
    if (!segment) return [];
    const normalized = normalizeTextForCommand(segment);
    if (!normalized || normalized.includes('livre')) return [];

    const timeRaw = [...segment.matchAll(/(\d{1,2}:\d{2})/g)].map((m) => normalizeHHMMInput(m[1])).filter(Boolean);
    if (!timeRaw.length) return [];

    const firstTime = timeRaw[0];
    const firstIdx = segment.indexOf(firstTime);
    const dayPart = firstIdx >= 0 ? segment.slice(0, firstIdx) : segment;
    const weekdays = attendanceWeekdayMatches(dayPart);
    if (!weekdays.length) return [];

    const explicitRange = /(\d{1,2}:\d{2})\s*(?:a|as|ate|até|às)\s*(\d{1,2}:\d{2})/i.exec(segment);
    const slots = [];

    if (explicitRange) {
        const start = normalizeHHMMInput(explicitRange[1]);
        const end = normalizeHHMMInput(explicitRange[2]);
        const startMin = parseHHMMToMinutes(start);
        const endMinRaw = parseHHMMToMinutes(end);
        if (startMin !== null && endMinRaw !== null) {
            let endMin = endMinRaw;
            if (endMin <= startMin) endMin += 24 * 60;
            const durationMin = Math.max(1, endMin - startMin);
            for (const weekday of weekdays) {
                slots.push({
                    activityLabel,
                    weekday,
                    start_time: start,
                    end_time: minutesToHHMM(startMin + durationMin),
                    duration_min: durationMin,
                    source: ATTENDANCE_TEMPLATE_SOURCE_CONTEXT
                });
            }
        }
        return slots;
    }

    for (const start of timeRaw) {
        const startMin = parseHHMMToMinutes(start);
        if (startMin === null) continue;
        const durationMin = Math.max(1, Number(defaultDurationMin || ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN));
        const end = minutesToHHMM(startMin + durationMin);
        for (const weekday of weekdays) {
            slots.push({
                activityLabel,
                weekday,
                start_time: start,
                end_time: end,
                duration_min: durationMin,
                source: ATTENDANCE_TEMPLATE_SOURCE_CONTEXT
            });
        }
    }
    return slots;
}

function parseClassTemplatesFromBaseContext(baseContextText, { defaultDurationMin = ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN } = {}) {
    const lines = String(baseContextText || '').split(/\r?\n/);
    let inSection = false;
    const out = [];
    const seen = new Set();
    const errors = [];

    for (const rawLine of lines) {
        const line = String(rawLine || '').trim();
        const lineNorm = normalizeTextForCommand(line);
        if (!inSection) {
            if (line.startsWith('##') && lineNorm.includes('grade de aulas')) {
                inSection = true;
            }
            continue;
        }
        if (line.startsWith('##')) break;
        if (!line || line.startsWith('*')) continue;
        if (!line.includes(':')) continue;

        const boldMatch = /^(?:-?\s*)\*\*(.+?)\*\s*:\s*(.+)$/.exec(line);
        const plainMatch = /^(?:-?\s*)([^:]+):\s*(.+)$/.exec(line);
        const labelRaw = sanitizePublicText((boldMatch?.[1] ?? plainMatch?.[1] ?? ''), 80);
        const scheduleRaw = String(boldMatch?.[2] ?? plainMatch?.[2] ?? '').trim();
        if (!labelRaw || !scheduleRaw) continue;
        if (normalizeTextForCommand(scheduleRaw).includes('livre')) continue;

        const segments = scheduleRaw.split('|').map((s) => s.trim()).filter(Boolean);
        for (const segment of segments) {
            try {
                const items = parseClassTemplateSegment(labelRaw, segment, defaultDurationMin);
                for (const item of items) {
                    const key = `${normalizeTextForCommand(item.activityLabel)}|${item.weekday}|${item.start_time}|${item.end_time}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push(item);
                }
            } catch (e) {
                errors.push(`segment_parse_error:${segment}`);
            }
        }
    }
    return { templates: out, errors };
}

function resolveAttendanceEmployeeRoleCatalog(roleActivityIdRaw, roleRaw) {
    const roleActivityId = Number(roleActivityIdRaw || 0);
    if (Number.isFinite(roleActivityId) && roleActivityId > 0) {
        return db.prepare('SELECT id, type, name, active FROM attendance_activity_catalog WHERE id=? AND type=? AND active=1')
            .get(roleActivityId, 'function') || null;
    }
    const roleLabel = sanitizePublicText(roleRaw, 80);
    if (!roleLabel) return null;
    const byName = findAttendanceCatalogByName('function', roleLabel);
    if (!byName || !byName.active) return null;
    return byName;
}

function findAttendanceCatalogByName(type, name) {
    const target = normalizeTextForCommand(name || '');
    if (!target) return null;
    const rows = db.prepare('SELECT id, type, name, default_value, active, sort_order FROM attendance_activity_catalog WHERE type=? ORDER BY sort_order ASC, name ASC').all(type);
    for (const row of rows) {
        if (normalizeTextForCommand(row.name || '') === target) return row;
    }
    return null;
}

function ensureAttendanceCatalogItem(type, name, defaultValue = 0, sortOrder = 0) {
    const safeType = normalizeAttendanceActivityType(type);
    const safeName = sanitizePublicText(name, 80);
    if (!safeName) return null;
    const existing = findAttendanceCatalogByName(safeType, safeName);
    if (existing) return existing;
    const now = Date.now();
    const value = Math.max(0, Number(defaultValue || 0));
    const order = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0;
    const r = db.prepare(`
        INSERT INTO attendance_activity_catalog (type, name, default_value, active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)
    `).run(safeType, safeName, value, order, now, now);
    return db.prepare('SELECT id, type, name, default_value, active, sort_order FROM attendance_activity_catalog WHERE id=?')
        .get(Number(r.lastInsertRowid));
}

function seedAttendanceCatalogDefaults() {
    let created = 0;
    for (const item of ATTENDANCE_ACTIVITY_SEED) {
        const before = findAttendanceCatalogByName(item.type, item.name);
        if (before) continue;
        const out = ensureAttendanceCatalogItem(item.type, item.name, item.default_value, item.sort_order);
        if (out) created += 1;
    }
    return created;
}

function seedAttendanceTemplateDefaults() {
    const now = Date.now();
    let created = 0;
    let skipped = 0;
    for (const seed of ATTENDANCE_TEMPLATE_SEED) {
        const startMin = parseHHMMToMinutes(seed.start_time);
        const endMinRaw = parseHHMMToMinutes(seed.end_time);
        if (startMin === null || endMinRaw === null) {
            skipped += 1;
            continue;
        }
        let endMin = endMinRaw;
        if (endMin <= startMin) endMin += 24 * 60;
        const durationMin = Math.max(1, endMin - startMin);

        const activityItem = findAttendanceCatalogByName('class', seed.activity) || ensureAttendanceCatalogItem('class', seed.activity, 20, 900);
        if (!activityItem) {
            skipped += 1;
            continue;
        }
        const activityLabel = sanitizePublicText(activityItem.name || seed.activity, 80) || 'Aula';
        const sourceKey = `${activityItem.id}|${seed.weekday}|${seed.start_time}|${seed.end_time}|${ATTENDANCE_TEMPLATE_SOURCE_MANUAL}`;
        const existing = db.prepare('SELECT id FROM attendance_class_templates WHERE source_key=?').get(sourceKey);
        if (existing) {
            skipped += 1;
            continue;
        }
        db.prepare(`
            INSERT INTO attendance_class_templates
            (activity_id, activity_label, weekday, start_time, end_time, duration_min, source, source_key, active, created_at, updated_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
            Number(activityItem.id),
            activityLabel,
            Number(seed.weekday),
            String(seed.start_time),
            String(seed.end_time),
            durationMin,
            ATTENDANCE_TEMPLATE_SOURCE_MANUAL,
            sourceKey,
            now,
            now,
            now
        );
        created += 1;
    }
    return { created, skipped, reason: created > 0 ? 'seeded' : 'already_exists' };
}

function backfillAttendanceScheduleCatalog() {
    const rows = db.prepare('SELECT * FROM attendance_schedules ORDER BY id ASC').all();
    if (!rows.length) return { updated: 0, createdCatalog: 0 };
    let updated = 0;
    let createdCatalog = 0;
    const now = Date.now();
    for (const row of rows) {
        const labelRaw = sanitizePublicText(row.activity_label || row.class_name || '', 80);
        let scheduleType = normalizeAttendanceActivityType(row.schedule_type);
        let activity = null;

        if (labelRaw) {
            const inferredType = scheduleType || 'class';
            activity = row.activity_id
                ? db.prepare('SELECT id, type, name, default_value, active, sort_order FROM attendance_activity_catalog WHERE id=?').get(Number(row.activity_id))
                : null;
            if (!activity) {
                activity = findAttendanceCatalogByName(inferredType, labelRaw);
            }
            if (!activity) {
                activity = ensureAttendanceCatalogItem(inferredType, labelRaw, 0, 999);
                if (activity) createdCatalog += 1;
            }
            scheduleType = normalizeAttendanceActivityType(activity?.type || inferredType);
        } else {
            scheduleType = 'function';
            activity = row.activity_id
                ? db.prepare('SELECT id, type, name, default_value, active, sort_order FROM attendance_activity_catalog WHERE id=?').get(Number(row.activity_id))
                : null;
            if (!activity || normalizeAttendanceActivityType(activity.type) !== 'function') {
                const hadExpediente = !!findAttendanceCatalogByName('function', 'Expediente');
                activity = findAttendanceCatalogByName('function', 'Expediente') || ensureAttendanceCatalogItem('function', 'Expediente', 0, 150);
                if (activity && !hadExpediente) createdCatalog += 1;
            }
        }

        const activityId = Number(activity?.id || 0) || null;
        const activityLabel = sanitizePublicText(activity?.name || labelRaw || 'Expediente', 80);
        const valuePerClass = Math.max(0, Number(row.value_per_class || 0));
        const classNameLegacy = activityLabel;
        const sourceType = String(row.source_type || '').trim().toLowerCase() === 'template' ? 'template' : 'manual';
        const templateId = sourceType === 'template' ? (Number(row.template_id || 0) || null) : null;

        const changed =
            String(row.schedule_type || '') !== scheduleType ||
            Number(row.activity_id || 0) !== Number(activityId || 0) ||
            String(row.activity_label || '') !== activityLabel ||
            Number(row.value_per_class || 0) !== valuePerClass ||
            String(row.class_name || '') !== classNameLegacy ||
            String(row.source_type || '') !== sourceType ||
            Number(row.template_id || 0) !== Number(templateId || 0);

        if (!changed) continue;

        db.prepare(`
            UPDATE attendance_schedules
            SET schedule_type=?, activity_id=?, activity_label=?, value_per_class=?, class_name=?, source_type=?, template_id=?, updated_at=?
            WHERE id=?
        `).run(scheduleType, activityId, activityLabel, valuePerClass, classNameLegacy, sourceType, templateId, now, row.id);
        updated += 1;
    }
    return { updated, createdCatalog };
}

function bootstrapAttendanceCatalog() {
    try {
        const seedCreated = seedAttendanceCatalogDefaults();
        const templateSeed = seedAttendanceTemplateDefaults();
        const backfill = backfillAttendanceScheduleCatalog();
        if (seedCreated || backfill.updated || backfill.createdCatalog || templateSeed.created) {
            logAdminAction(
                'attendance.catalog.bootstrap',
                'system',
                'attendance_schedules',
                {
                    seedCreated,
                    templateSeedCreated: templateSeed.created,
                    templateSeedSkipped: templateSeed.skipped,
                    templateSeedReason: templateSeed.reason,
                    backfillUpdated: backfill.updated,
                    createdCatalog: backfill.createdCatalog
                },
                '127.0.0.1'
            );
            console.log(`[attendance] catalog bootstrap seed=${seedCreated} templates=${templateSeed.created} schedules=${backfill.updated} catalogCreated=${backfill.createdCatalog}`);
        }
    } catch (e) {
        console.error('[attendance] catalog bootstrap error:', e?.message || e);
    }
}

function bootstrapAttendanceEmployeeRoles() {
    try {
        let updatedEmployees = 0;
        let createdFunctionCatalogItems = 0;
        let defaultedEmptyRoles = 0;
        const now = Date.now();

        let defaultRoleItem = findAttendanceCatalogByName('function', ATTENDANCE_DEFAULT_EMPLOYEE_ROLE);
        if (!defaultRoleItem) {
            defaultRoleItem = ensureAttendanceCatalogItem('function', ATTENDANCE_DEFAULT_EMPLOYEE_ROLE, 0, 100);
            if (defaultRoleItem) createdFunctionCatalogItems += 1;
        } else if (!defaultRoleItem.active) {
            db.prepare('UPDATE attendance_activity_catalog SET active=1, updated_at=? WHERE id=?').run(now, defaultRoleItem.id);
            defaultRoleItem = db.prepare('SELECT id, type, name, active FROM attendance_activity_catalog WHERE id=?').get(defaultRoleItem.id);
        }

        const rows = db.prepare('SELECT id, role FROM attendance_employees ORDER BY id ASC').all();
        for (const row of rows) {
            const roleRaw = sanitizePublicText(row.role, 80);
            let roleItem = null;

            if (!roleRaw) {
                roleItem = defaultRoleItem;
                defaultedEmptyRoles += 1;
            } else {
                roleItem = findAttendanceCatalogByName('function', roleRaw);
                if (!roleItem) {
                    roleItem = ensureAttendanceCatalogItem('function', roleRaw, 0, 900);
                    if (roleItem) createdFunctionCatalogItems += 1;
                } else if (!roleItem.active) {
                    db.prepare('UPDATE attendance_activity_catalog SET active=1, updated_at=? WHERE id=?').run(now, roleItem.id);
                    roleItem = db.prepare('SELECT id, type, name, active FROM attendance_activity_catalog WHERE id=?').get(roleItem.id);
                }
            }

            const canonicalRole = sanitizePublicText(roleItem?.name || ATTENDANCE_DEFAULT_EMPLOYEE_ROLE, 80) || ATTENDANCE_DEFAULT_EMPLOYEE_ROLE;
            if (String(row.role || '') !== canonicalRole) {
                db.prepare('UPDATE attendance_employees SET role=?, updated_at=? WHERE id=?').run(canonicalRole, now, row.id);
                updatedEmployees += 1;
            }
        }

        if (updatedEmployees || createdFunctionCatalogItems || defaultedEmptyRoles) {
            logAdminAction(
                'attendance.employee_role.bootstrap',
                'system',
                'attendance_employees',
                { updatedEmployees, createdFunctionCatalogItems, defaultedEmptyRoles },
                '127.0.0.1'
            );
            console.log(`[attendance] employee-role bootstrap updated=${updatedEmployees} catalogCreated=${createdFunctionCatalogItems} defaulted=${defaultedEmptyRoles}`);
        }
    } catch (e) {
        console.error('[attendance] employee-role bootstrap error:', e?.message || e);
    }
}

function syncAttendanceClassTemplatesFromContext({ actor = 'system', mode = 'auto' } = {}) {
    const now = Date.now();
    const parsed = parseClassTemplatesFromBaseContext(baseContextCache || '', {
        defaultDurationMin: ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN
    });
    let upserted = 0;
    let deactivated = 0;
    let ensureCatalogCreated = 0;
    const seenKeys = new Set();

    for (const item of parsed.templates) {
        const classItemBefore = findAttendanceCatalogByName('class', item.activityLabel);
        const classItem = classItemBefore || ensureAttendanceCatalogItem('class', item.activityLabel, 0, 900);
        if (!classItem) continue;
        if (!classItemBefore) ensureCatalogCreated += 1;
        const activityLabel = sanitizePublicText(classItem.name || item.activityLabel, 80) || 'Aula';
        const sourceKey = `${classItem.id}|${item.weekday}|${item.start_time}|${item.end_time}|${ATTENDANCE_TEMPLATE_SOURCE_CONTEXT}`;
        seenKeys.add(sourceKey);
        const existing = db.prepare('SELECT id FROM attendance_class_templates WHERE source_key=?').get(sourceKey);
        if (existing) {
            db.prepare(`
                UPDATE attendance_class_templates
                SET activity_id=?, activity_label=?, weekday=?, start_time=?, end_time=?, duration_min=?, source=?, active=1, updated_at=?, last_seen_at=?
                WHERE id=?
            `).run(
                classItem.id,
                activityLabel,
                Number(item.weekday),
                item.start_time,
                item.end_time,
                Math.max(1, Number(item.duration_min || ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN)),
                ATTENDANCE_TEMPLATE_SOURCE_CONTEXT,
                now,
                now,
                existing.id
            );
        } else {
            db.prepare(`
                INSERT INTO attendance_class_templates
                (activity_id, activity_label, weekday, start_time, end_time, duration_min, source, source_key, active, created_at, updated_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            `).run(
                classItem.id,
                activityLabel,
                Number(item.weekday),
                item.start_time,
                item.end_time,
                Math.max(1, Number(item.duration_min || ATTENDANCE_TEMPLATE_DEFAULT_DURATION_MIN)),
                ATTENDANCE_TEMPLATE_SOURCE_CONTEXT,
                sourceKey,
                now,
                now,
                now
            );
        }
        upserted += 1;
    }

    const activeRows = db.prepare('SELECT id, source_key FROM attendance_class_templates WHERE source=? AND active=1').all(ATTENDANCE_TEMPLATE_SOURCE_CONTEXT);
    for (const row of activeRows) {
        if (seenKeys.has(String(row.source_key || ''))) continue;
        db.prepare('UPDATE attendance_class_templates SET active=0, updated_at=? WHERE id=?').run(now, row.id);
        deactivated += 1;
    }

    const summary = {
        parsed: Number(parsed.templates.length || 0),
        upserted,
        deactivated,
        ensureCatalogCreated,
        errors: Number(parsed.errors.length || 0),
        updated_at: now
    };

    if (mode !== 'auto' || upserted || deactivated || parsed.errors.length) {
        logAdminAction(
            'attendance.templates.sync_context',
            actor || 'system',
            'attendance_class_templates',
            summary,
            '127.0.0.1'
        );
    }
    return summary;
}

function getAttendanceClassTemplates({ activeOnly = false, source = '' } = {}) {
    const where = [];
    const params = [];
    if (activeOnly) where.push('t.active=1');
    if (source) {
        where.push('t.source=?');
        params.push(String(source || '').trim().toLowerCase());
    }
    const sql = `
        SELECT t.*,
               c.name AS catalog_name,
               c.default_value AS catalog_default_value
        FROM attendance_class_templates t
        LEFT JOIN attendance_activity_catalog c ON c.id=t.activity_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY t.weekday ASC, t.start_time ASC, t.activity_label ASC
    `;
    return db.prepare(sql).all(...params);
}

function validateAttendanceTemplateIdsActive(templateIds) {
    const ids = normalizeAttendanceTemplateIds(templateIds);
    if (!ids.length) return { ids: [], rows: [] };
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`
        SELECT id, activity_id, activity_label, weekday, start_time, end_time, duration_min, active
        FROM attendance_class_templates
        WHERE active=1 AND id IN (${placeholders})
    `).all(...ids);
    if (rows.length !== ids.length) return { error: 'invalid_template_ids', ids: [], rows: [] };
    return { ids, rows };
}

function applyAttendanceTemplatesToEmployee({ employeeId, templateIds = [], replace = false, toleranceMin = 5, actor = 'system', endpoint = '' } = {}) {
    const employee = db.prepare('SELECT id, role, active FROM attendance_employees WHERE id=?').get(Number(employeeId));
    if (!employee || !employee.active) return { error: 'invalid_employee' };
    const idsCheck = validateAttendanceTemplateIdsActive(templateIds);
    if (idsCheck.error) return { error: idsCheck.error };
    const ids = idsCheck.ids;
    const templates = idsCheck.rows;

    if (ids.length && !isAttendanceTeacherRole(employee.role)) {
        logAdminAction('attendance.schedule.blocked_role_rule', actor || 'system', String(employeeId), {
            employeeId: Number(employeeId),
            employeeRole: String(employee.role || ''),
            scheduleType: 'class',
            templateIds: ids,
            endpoint: endpoint || 'templates_apply'
        }, '127.0.0.1');
        return { error: 'not_teacher_for_class' };
    }

    const now = Date.now();
    const tol = Math.max(0, Math.min(180, Number(toleranceMin || 5)));
    const existingRows = db.prepare(`
        SELECT id, template_id
        FROM attendance_schedules
        WHERE employee_id=? AND active=1 AND source_type='template' AND template_id IS NOT NULL
    `).all(Number(employeeId));
    const existingByTemplate = new Map(existingRows.map((r) => [Number(r.template_id), Number(r.id)]));

    let inserted = 0;
    let skipped = 0;
    const activityDefaultValueCache = new Map();
    for (const tpl of templates) {
        const tplId = Number(tpl.id);
        if (existingByTemplate.has(tplId)) {
            skipped += 1;
            continue;
        }
        const activityId = Number(tpl.activity_id || 0);
        if (!activityDefaultValueCache.has(activityId)) {
            const activityRow = db.prepare('SELECT default_value FROM attendance_activity_catalog WHERE id=?').get(activityId);
            activityDefaultValueCache.set(activityId, Math.max(0, Number(activityRow?.default_value || 0)));
        }
        const valuePerClass = Math.max(0, Number(activityDefaultValueCache.get(activityId) || 0));
        db.prepare(`
            INSERT INTO attendance_schedules
            (employee_id, weekday, start_time, end_time, class_name, schedule_type, activity_id, activity_label, value_per_class, tolerance_min, source_type, template_id, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'class', ?, ?, ?, ?, 'template', ?, 1, ?, ?)
        `).run(
            Number(employeeId),
            Number(tpl.weekday),
            String(tpl.start_time),
            String(tpl.end_time),
            sanitizePublicText(tpl.activity_label || '', 80) || 'Aula',
            activityId,
            sanitizePublicText(tpl.activity_label || '', 80) || 'Aula',
            valuePerClass,
            tol,
            tplId,
            now,
            now
        );
        inserted += 1;
    }

    let deactivated = 0;
    if (replace) {
        if (!ids.length) {
            const r = db.prepare(`
                UPDATE attendance_schedules
                SET active=0, updated_at=?
                WHERE employee_id=? AND active=1 AND source_type='template'
            `).run(now, Number(employeeId));
            deactivated = Number(r.changes || 0);
        } else {
            const placeholders = ids.map(() => '?').join(',');
            const r = db.prepare(`
                UPDATE attendance_schedules
                SET active=0, updated_at=?
                WHERE employee_id=? AND active=1 AND source_type='template' AND (template_id IS NULL OR template_id NOT IN (${placeholders}))
            `).run(now, Number(employeeId), ...ids);
            deactivated = Number(r.changes || 0);
        }
    }

    return {
        ok: true,
        employeeId: Number(employeeId),
        selectedTemplateIds: ids,
        inserted,
        skipped,
        deactivated
    };
}

function groupSchedulesIntoBlocks(daySchedules, gapMin = ATTENDANCE_CONSECUTIVE_GAP_MIN) {
    const scheduleItems = (daySchedules || [])
        .map((s) => {
            const startMin = parseHHMMToMinutes(s.start_time);
            const endMinRaw = parseHHMMToMinutes(s.end_time);
            if (startMin === null || endMinRaw === null) return null;
            let endMin = endMinRaw;
            if (endMin < startMin) endMin += 24 * 60;
            return {
                ...s,
                start_min: startMin,
                end_min: endMin,
                tolerance_min: Math.max(0, Number(s.tolerance_min || 0)),
                schedule_type: normalizeAttendanceActivityType(s.schedule_type),
                activity_label: sanitizePublicText(s.activity_label || s.class_name || '', 80) || 'Atividade',
                value_per_class: Math.max(0, Number(s.value_per_class || 0))
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.start_min === b.start_min) return a.end_min - b.end_min;
            return a.start_min - b.start_min;
        });

    const blocks = [];
    for (const item of scheduleItems) {
        if (!blocks.length) {
            blocks.push({
                start_min: item.start_min,
                end_min: item.end_min,
                tolerance_min: item.tolerance_min,
                class_names: [item.activity_label || item.class_name || 'Atividade'],
                schedule_ids: [item.id],
                schedules: [item]
            });
            continue;
        }
        const prev = blocks[blocks.length - 1];
        if (item.start_min <= (prev.end_min + Math.max(0, Number(gapMin || 0)))) {
            prev.end_min = Math.max(prev.end_min, item.end_min);
            prev.class_names.push(item.activity_label || item.class_name || 'Atividade');
            prev.schedule_ids.push(item.id);
            prev.schedules.push(item);
        } else {
            blocks.push({
                start_min: item.start_min,
                end_min: item.end_min,
                tolerance_min: item.tolerance_min,
                class_names: [item.activity_label || item.class_name || 'Atividade'],
                schedule_ids: [item.id],
                schedules: [item]
            });
        }
    }
    return blocks;
}

function buildAttendanceDayBlocks(daySchedules, dayStartMs, gapMin = ATTENDANCE_CONSECUTIVE_GAP_MIN) {
    const grouped = groupSchedulesIntoBlocks(daySchedules, gapMin);
    const safeDayStartMs = Number(dayStartMs || 0);
    if (!Number.isFinite(safeDayStartMs)) return [];
    const blocks = grouped.map((block, index) => {
        const blockStartAt = safeDayStartMs + (Number(block.start_min || 0) * 60000);
        const blockEndAt = safeDayStartMs + (Number(block.end_min || 0) * 60000);
        return {
            ...block,
            block_index: index,
            block_start_at: blockStartAt,
            block_end_at: blockEndAt,
            window_start_at: blockStartAt - (ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN * 60000),
            window_end_at: blockEndAt - (ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN * 60000)
        };
    });
    for (let i = 0; i < blocks.length; i += 1) {
        const nextBlock = blocks[i + 1] || null;
        blocks[i].next_window_start_at = nextBlock ? nextBlock.window_start_at : (safeDayStartMs + (24 * 60 * 60000));
    }
    return blocks;
}

function dateKeyToStartMs(dateKey) {
    const safe = parseDateKeyInput(dateKey);
    if (!safe) return null;
    const [y, m, d] = safe.split('-').map((v) => Number(v));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function getAttendanceBlocksForPunch(employeeId, eventAt) {
    const ts = Number(eventAt || Date.now());
    const dayStartMs = dateKeyToStartMs(dateKeyFromTs(ts));
    if (!Number.isFinite(dayStartMs)) {
        return { dateKey: dateKeyFromTs(ts), weekday: new Date(ts).getDay(), dayStartMs: null, dayEndMs: null, schedules: [], blocks: [] };
    }
    const dateKey = dateKeyFromTs(dayStartMs);
    const weekday = new Date(dayStartMs).getDay();
    const schedules = db.prepare(`
        SELECT *
        FROM attendance_schedules
        WHERE employee_id=? AND active=1 AND weekday=?
        ORDER BY start_time ASC, end_time ASC, id ASC
    `).all(Number(employeeId), weekday);
    const blocks = buildAttendanceDayBlocks(schedules, dayStartMs, ATTENDANCE_CONSECUTIVE_GAP_MIN);
    return {
        dateKey,
        weekday,
        dayStartMs,
        dayEndMs: dayStartMs + 86399999,
        schedules,
        blocks
    };
}

function getAttendanceBlockEventsForDate(employeeId, dateKey, blocks) {
    const dayStartMs = dateKeyToStartMs(dateKey);
    if (!Number.isFinite(dayStartMs) || !Array.isArray(blocks) || !blocks.length) return [];
    const dayEndMs = dayStartMs + 86399999;
    const events = db.prepare(`
        SELECT id, event_type, event_at, geo_status, geo_lat, geo_lng, geo_distance_m, note
        FROM attendance_events
        WHERE employee_id=? AND event_type IN ('entry', 'exit') AND event_at BETWEEN ? AND ?
        ORDER BY event_at ASC, id ASC
    `).all(Number(employeeId), dayStartMs, dayEndMs);
    const entryEvents = events.filter((e) => e.event_type === 'entry');
    const exitEvents = events.filter((e) => e.event_type === 'exit');
    const usedEntryIds = new Set();
    const usedExitIds = new Set();
    const mapped = [];

    for (const block of blocks) {
        const nextWindowStartAt = Number.isFinite(Number(block.next_window_start_at))
            ? Number(block.next_window_start_at)
            : (dayEndMs + 1);
        let entryEvent = null;
        for (const evt of entryEvents) {
            if (usedEntryIds.has(evt.id)) continue;
            const at = Number(evt.event_at || 0);
            if (at >= Number(block.window_start_at) && at < nextWindowStartAt) {
                entryEvent = evt;
                usedEntryIds.add(evt.id);
                break;
            }
        }

        let exitEvent = null;
        const minExitAt = entryEvent
            ? Math.max(Number(entryEvent.event_at || 0), Number(block.block_start_at || 0))
            : Number(block.block_start_at || 0);
        for (const evt of exitEvents) {
            if (usedExitIds.has(evt.id)) continue;
            const at = Number(evt.event_at || 0);
            if (at >= minExitAt && at < nextWindowStartAt) {
                exitEvent = evt;
                usedExitIds.add(evt.id);
                break;
            }
        }

        mapped.push({
            ...block,
            entryEvent,
            exitEvent
        });
    }

    return mapped;
}

function findLatestUnclosedAttendanceEntry(employeeId, upToAt = Date.now()) {
    const latestEntry = db.prepare(`
        SELECT id, event_at
        FROM attendance_events
        WHERE employee_id=? AND event_type='entry' AND event_at<=?
        ORDER BY event_at DESC, id DESC
        LIMIT 1
    `).get(Number(employeeId), Number(upToAt || Date.now()));
    if (!latestEntry) return null;
    const exitAfter = db.prepare(`
        SELECT id
        FROM attendance_events
        WHERE employee_id=? AND event_type='exit' AND event_at>=?
        ORDER BY event_at ASC, id ASC
        LIMIT 1
    `).get(Number(employeeId), Number(latestEntry.event_at || 0));
    if (exitAfter) return null;
    return latestEntry;
}

function resolveAttendancePunchContext(employeeId, eventAt, eventType) {
    const safeType = String(eventType || '').trim().toLowerCase();
    const ts = Number(eventAt || Date.now());
    const day = getAttendanceBlocksForPunch(employeeId, ts);
    if (!day.blocks.length) {
        if (safeType === 'exit') {
            const latestOpenEntry = findLatestUnclosedAttendanceEntry(employeeId, ts);
            if (latestOpenEntry && dateKeyFromTs(latestOpenEntry.event_at) !== day.dateKey) {
                return { ok: false, error: 'wrong_day_for_exit', dateKey: day.dateKey };
            }
            return { ok: false, error: 'no_open_entry', dateKey: day.dateKey };
        }
        return { ok: false, error: 'no_schedule_today', dateKey: day.dateKey };
    }

    const blockStates = getAttendanceBlockEventsForDate(employeeId, day.dateKey, day.blocks);
    if (safeType === 'entry') {
        const existingOpenBlock = blockStates.find((item) => item.entryEvent && !item.exitEvent && ts >= Number(item.window_start_at) && ts < Number(item.next_window_start_at || item.window_end_at));
        if (existingOpenBlock) {
            return {
                ok: false,
                error: 'entry_already_open_for_block',
                dateKey: day.dateKey,
                block: existingOpenBlock,
                openEntryEvent: existingOpenBlock.entryEvent
            };
        }
        const block = blockStates.find((item) => ts >= Number(item.window_start_at) && ts <= Number(item.window_end_at));
        if (!block) {
            return { ok: false, error: 'outside_schedule_window', dateKey: day.dateKey, blocks: blockStates };
        }
        if (block.entryEvent && !block.exitEvent) {
            return {
                ok: false,
                error: 'entry_already_open_for_block',
                dateKey: day.dateKey,
                block,
                openEntryEvent: block.entryEvent
            };
        }
        return {
            ok: true,
            eventType: safeType,
            dateKey: day.dateKey,
            dayStartMs: day.dayStartMs,
            dayEndMs: day.dayEndMs,
            block,
            blocks: blockStates,
            windowStartAt: block.window_start_at,
            windowEndAt: block.window_end_at,
            openEntryEvent: block.entryEvent || null,
            existingExitEvent: block.exitEvent || null
        };
    }

    const openBlocks = [...blockStates].reverse();
    const block = openBlocks.find((item) => item.entryEvent && !item.exitEvent) || null;
    if (!block) {
        const latestClosedBlock = [...blockStates]
            .filter((item) => item.entryEvent && item.exitEvent)
            .sort((a, b) => Number(b.exitEvent?.event_at || 0) - Number(a.exitEvent?.event_at || 0))[0] || null;
        if (latestClosedBlock && ts >= Number(latestClosedBlock.exitEvent?.event_at || 0)) {
            return {
                ok: false,
                error: 'exit_already_closed_for_block',
                dateKey: day.dateKey,
                block: latestClosedBlock,
                openEntryEvent: latestClosedBlock.entryEvent || null,
                existingExitEvent: latestClosedBlock.exitEvent || null
            };
        }
        const latestOpenEntry = findLatestUnclosedAttendanceEntry(employeeId, ts);
        if (latestOpenEntry && dateKeyFromTs(latestOpenEntry.event_at) !== day.dateKey) {
            return { ok: false, error: 'wrong_day_for_exit', dateKey: day.dateKey, blocks: blockStates };
        }
        return { ok: false, error: 'no_open_entry', dateKey: day.dateKey, blocks: blockStates };
    }
    if (ts < Number(block.entryEvent?.event_at || 0)) {
        return {
            ok: false,
            error: 'invalid_exit_before_entry',
            dateKey: day.dateKey,
            block,
            openEntryEvent: block.entryEvent
        };
    }
    const exitAllowedUntilAt = Number(block.block_end_at || 0) + (ATTENDANCE_EXIT_MANUAL_GRACE_AFTER_END_MIN * 60000);
    if (Number.isFinite(exitAllowedUntilAt) && ts > exitAllowedUntilAt) {
        return {
            ok: false,
            error: 'exit_window_closed',
            dateKey: day.dateKey,
            block,
            openEntryEvent: block.entryEvent,
            exitAllowedUntilAt
        };
    }
    if (dateKeyFromTs(ts) !== day.dateKey) {
        return {
            ok: false,
            error: 'wrong_day_for_exit',
            dateKey: day.dateKey,
            block,
            openEntryEvent: block.entryEvent
        };
    }
    return {
        ok: true,
        eventType: safeType,
        dateKey: day.dateKey,
        dayStartMs: day.dayStartMs,
        dayEndMs: day.dayEndMs,
        block,
        blocks: blockStates,
        windowStartAt: block.window_start_at,
        windowEndAt: block.window_end_at,
        openEntryEvent: block.entryEvent || null,
        existingExitEvent: block.exitEvent || null
    };
}

function resolvePendingGeoPunchContext(employeeId, pendingGeo, eventAt) {
    const ts = Number(eventAt || Date.now());
    if (!pendingGeo) return { ok: false, error: 'geo_window_expired' };
    const pendingDateKey = parseDateKeyInput(pendingGeo.schedule_date_key || '');
    const blockStartMin = Number(pendingGeo.block_start_min);
    const blockEndMin = Number(pendingGeo.block_end_min);
    if (pendingDateKey && Number.isFinite(blockStartMin) && blockStartMin >= 0 && Number.isFinite(blockEndMin) && blockEndMin >= blockStartMin) {
        const dayStartMs = dateKeyToStartMs(pendingDateKey);
        if (!Number.isFinite(dayStartMs) || dateKeyFromTs(ts) !== pendingDateKey) {
            return { ok: false, error: 'geo_window_expired', dateKey: pendingDateKey };
        }
        const blockStartAt = dayStartMs + (blockStartMin * 60000);
        const blockEndAt = dayStartMs + (blockEndMin * 60000);
        const windowStartAt = blockStartAt - (ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN * 60000);
        const windowEndAt = blockEndAt - (ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN * 60000);
        if (ts < windowStartAt || ts > windowEndAt) {
            return {
                ok: false,
                error: 'geo_window_expired',
                dateKey: pendingDateKey,
                windowStartAt,
                windowEndAt
            };
        }
        return {
            ok: true,
            eventType: 'entry',
            dateKey: pendingDateKey,
            block: {
                start_min: blockStartMin,
                end_min: blockEndMin,
                block_start_at: blockStartAt,
                block_end_at: blockEndAt,
                window_start_at: windowStartAt,
                window_end_at: windowEndAt
            },
            windowStartAt,
            windowEndAt
        };
    }
    const fallback = resolveAttendancePunchContext(employeeId, ts, 'entry');
    if (!fallback.ok) return { ok: false, error: 'geo_window_expired', dateKey: fallback.dateKey || dateKeyFromTs(ts) };
    return fallback;
}

function getAttendanceBlockWindowLabel(block) {
    if (!block) return '';
    const hasStart = Number.isFinite(Number(block.start_min));
    const hasEnd = Number.isFinite(Number(block.end_min));
    if (!hasStart && !hasEnd) return '';
    if (hasStart && hasEnd) return `${minutesToHHMM(block.start_min)} as ${minutesToHHMM(block.end_min)}`;
    if (hasEnd) return `ate ${minutesToHHMM(block.end_min)}`;
    return `a partir de ${minutesToHHMM(block.start_min)}`;
}

function getAttendanceBlockScopeLabel(block) {
    const labels = Array.isArray(block?.class_names)
        ? block.class_names.filter(Boolean)
        : [];
    if (!labels.length) return '';
    return ` (${labels.join(' + ')})`;
}

function buildAttendanceEntryAck(employee, eventAt, block = null) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    const greeting = getDayPeriodGreeting(eventAt);
    const scope = isAttendanceTeacherRole(employee?.role || '')
        ? 'Tenha uma boa aula.'
        : 'Tenha um bom expediente.';
    const blockLabel = getAttendanceBlockWindowLabel(block);
    const extra = blockLabel ? ` no bloco de ${blockLabel}` : '';
    return `${greeting}, ${safeName}! Sua entrada foi registrada as ${hhmmFromTs(eventAt)}${extra}. ${scope}`;
}

function buildAttendanceExitAck(employee, eventAt, block = null) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    const blockLabel = getAttendanceBlockWindowLabel(block);
    const extra = blockLabel ? ` do bloco de ${blockLabel}` : '';
    return `Tudo certo, ${safeName}! Sua saida foi registrada as ${hhmmFromTs(eventAt)}${extra}.`;
}

function buildAttendanceAutoExitAck(employee, block) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    const end = Number.isFinite(Number(block?.end_min)) ? minutesToHHMM(block.end_min) : hhmmFromTs(Date.now());
    const scopeLabel = getAttendanceBlockScopeLabel(block);
    return `Oi, ${safeName}! Fechei sua saida automaticamente as ${end}, no fim da sua escala${scopeLabel}. Se precisar de ajuste, fale com a administracao.`;
}

function buildAttendanceGeoRequestMessage(employee, ttlSec, block = null) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    const ttlMin = Math.max(1, Math.floor(Number(ttlSec || 300) / 60));
    const scopeLabel = getAttendanceBlockScopeLabel(block);
    return `Oi, ${safeName}! Para confirmar sua entrada${scopeLabel}, envie sua localizacao atual do WhatsApp em ate ${ttlMin} min.`;
}

function buildAttendanceGeoOutsideMessage(employee, distanceM) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    const rounded = Math.max(0, Math.round(Number(distanceM || 0)));
    return `Oi, ${safeName}! Recebi sua localizacao, mas ela apareceu a cerca de ${rounded} m da academia. Aproxime-se e envie a localizacao novamente.`;
}

function buildAttendanceGeoWithoutPendingMessage(employee) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    return `Oi, ${safeName}! Recebi sua localizacao, mas nao tenho nenhuma entrada pendente para confirmar agora. Envie "entrada" primeiro.`;
}

function buildAttendanceJustificationSavedMessage(employee, dateKey) {
    const safeName = sanitizePublicText(employee?.name || '', 120) || 'colaborador';
    return `Perfeito, ${safeName}! Sua justificativa para ${formatDateKeyBR(dateKey)} foi registrada.`;
}

function buildAttendanceInvalidJustificationDateMessage() {
    return 'Nao consegui entender a data da justificativa. Use DD/MM/AAAA ou YYYY-MM-DD.';
}

function buildAttendanceInvalidJustificationReasonMessage() {
    return 'Me envie um motivo um pouco mais completo para registrar a justificativa.';
}

function buildAttendanceVacationJustificationMessage(targetDate) {
    return `Voce esta em ferias em ${formatDateKeyBR(targetDate)}. Nao precisa justificar esse dia.`;
}

function buildAttendanceJustificationSaveFailedMessage() {
    return 'Nao consegui registrar sua justificativa agora. Tente novamente em instantes.';
}

function buildAttendanceGeoFallbackBlockedMessage() {
    return 'Nao consegui validar sua localizacao agora. Tente novamente com o GPS ativo.';
}

function buildAttendanceInvalidGeoPolicyMessage() {
    return 'O ponto esta indisponivel no momento porque a localizacao da academia nao esta configurada. Avise a administracao.';
}

function buildAttendanceDuplicatePunchMessage(eventType) {
    return eventType === 'entry'
        ? 'Sua entrada ja foi registrada ha pouco.'
        : 'Sua saida ja foi registrada ha pouco.';
}

function getAttendancePunchErrorMessage(errorCode, context = null) {
    const code = String(errorCode || '').trim();
    const block = context?.block || null;
    const blockLabel = getAttendanceBlockWindowLabel(block);
    const exitAt = context?.existingExitEvent?.event_at ? hhmmFromTs(context.existingExitEvent.event_at) : '';
    if (code === 'no_schedule_today') return 'Hoje nao encontrei nenhuma escala sua para registrar ponto. Se precisar, fale com a administracao.';
    if (code === 'outside_schedule_window') return `Sua entrada pode ser registrada de ${ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN} min antes do inicio ate ${ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN} min antes do fim da escala.`;
    if (code === 'entry_already_open_for_block') return blockLabel
        ? `Sua entrada do bloco de ${blockLabel} ja foi registrada. Quando encerrar, envie "saida".`
        : 'Sua entrada deste horario ja foi registrada. Quando encerrar, envie "saida".';
    if (code === 'no_open_entry') return 'Nao encontrei nenhuma entrada aberta para fechar agora. Se precisar de ajuste, fale com a administracao.';
    if (code === 'exit_already_closed_for_block') return exitAt
        ? `Sua saida deste bloco ja foi registrada as ${exitAt}. Nao precisa enviar novamente.`
        : 'Sua saida deste bloco ja foi registrada. Nao precisa enviar novamente.';
    if (code === 'invalid_exit_before_entry') return 'A saida nao pode ser registrada antes da entrada.';
    if (code === 'exit_window_closed') return blockLabel
        ? `A saida manual do bloco de ${blockLabel} so pode ser enviada ate o horario final da escala. Depois disso, o sistema encerra automaticamente.`
        : 'A saida manual so pode ser registrada ate o horario final da escala. Depois disso, o sistema encerra automaticamente.';
    if (code === 'wrong_day_for_exit') return 'A saida so pode ser registrada no mesmo dia da entrada.';
    if (code === 'geo_window_expired') return 'O tempo para confirmar esta entrada expirou. Envie "entrada" novamente dentro do horario da sua escala.';
    return 'Nao foi possivel registrar o ponto agora. Tente novamente em instantes.';
}

function normalizeTextForCommand(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectHumanHandoffIntent(text) {
    const normalizedText = normalizeTextForCommand(text);
    if (!normalizedText) return { type: 'none', normalizedText };

    const explicitRules = [
        { rule: 'talk_to_attendant', test: /\bfalar com (um |uma )?(atendente|humano)\b/ },
        { rule: 'request_human_service', test: /\b(quero|preciso)\b.*\batendimento humano\b/ },
        { rule: 'transfer_to_human', test: /\b(me )?(transfere|transferir|passa|passar|encaminha|encaminhar)\b.*\b(atendente|humano)\b/ },
        { rule: 'call_attendant', test: /\b(chama|chamar)\b.*\b(atendente|humano)\b/ },
        { rule: 'real_person', test: /\b(quero|preciso|falar)\b.*\bpessoa real\b/ }
    ];
    for (const item of explicitRules) {
        if (item.test.test(normalizedText)) {
            return { type: 'explicit', normalizedText, matchedRule: item.rule };
        }
    }

    const exactAmbiguous = new Map([
        ['atendente', 'single_attendant'],
        ['humano', 'single_human'],
        ['suporte', 'single_support'],
        ['ajuda', 'single_help'],
        ['reclamacao', 'single_complaint'],
        ['reclamar', 'single_complaint_verb'],
        ['pessoa real', 'single_real_person']
    ]);
    if (exactAmbiguous.has(normalizedText)) {
        return { type: 'ambiguous', normalizedText, matchedRule: exactAmbiguous.get(normalizedText) };
    }

    const ambiguousRules = [
        { rule: 'mention_attendant', test: /\b(atendente|humano)\b/ },
        { rule: 'complaint', test: /\b(reclamacao|reclamar)\b/ },
        { rule: 'support', test: /\bsuporte\b/ },
        { rule: 'real_person_mention', test: /\bpessoa real\b/ },
        { rule: 'help_with_human_context', test: /\bajuda\b.*\b(atendente|humano|suporte)\b/ },
        { rule: 'unclear_handoff', test: /\b(acho que preciso|preciso de|quero reclamar)\b.*\b(atendente|humano|suporte|reclamacao)\b/ }
    ];
    for (const item of ambiguousRules) {
        if (item.test.test(normalizedText)) {
            return { type: 'ambiguous', normalizedText, matchedRule: item.rule };
        }
    }

    return { type: 'none', normalizedText };
}

function openPendingHumanHandoff(user, originalText, meta = {}) {
    if (!user) return null;
    const now = Date.now();
    user.pendingHumanHandoff = {
        createdAt: now,
        expiresAt: now + HUMAN_HANDOFF_CONFIRM_TTL_MS,
        originalText: String(originalText || ''),
        normalizedText: String(meta.normalizedText || normalizeTextForCommand(originalText)),
        matchedRule: String(meta.matchedRule || '')
    };
    return user.pendingHumanHandoff;
}

function clearPendingHumanHandoff(user) {
    if (!user) return null;
    const previous = user.pendingHumanHandoff || null;
    user.pendingHumanHandoff = null;
    return previous;
}

function getPendingHumanHandoff(user) {
    if (!user?.pendingHumanHandoff) return null;
    if (Number(user.pendingHumanHandoff.expiresAt || 0) <= Date.now()) {
        user.pendingHumanHandoff = null;
        return null;
    }
    return user.pendingHumanHandoff;
}

function isHumanHandoffConfirmation(text) {
    const normalizedText = normalizeTextForCommand(text);
    if (!normalizedText) return null;
    if (['sim', 's', 'pode', 'isso', 'ok', 'quero', 'quero sim'].includes(normalizedText)) return 'yes';
    if (['nao', 'n', 'deixa', 'deixa pra la', 'nao precisa', 'continuar aqui'].includes(normalizedText)) return 'no';
    return null;
}

function shouldReuseHumanOriginalText(text) {
    const normalizedText = normalizeTextForCommand(text);
    if (!normalizedText || normalizedText.length <= 4) return false;
    if ([
        'atendente',
        'humano',
        'suporte',
        'ajuda',
        'reclamacao',
        'reclamar',
        'pessoa real'
    ].includes(normalizedText)) return false;
    if (/^(um |uma )?(atendente|humano)$/.test(normalizedText)) return false;
    return true;
}

async function executeHumanHandoff({ sender, user, text, triggerMode = 'explicit', matchedRule = '', eventTimestamp = Date.now() }) {
    if (!user || user.pausedByHuman) return false;
    user.pausedByHuman = true;
    if (!user.tags.includes('Ajuda')) user.tags.push('Ajuda');
    clearPendingHumanHandoff(user);
    const reply = "Entendido! Estou pausando meu sistema e chamando um atendente humano para falar com voce. Aguarde um momento!";
    const userTs = Number(eventTimestamp) > 0 ? Number(eventTimestamp) : Date.now();
    const replyTs = Date.now();
    if (sock) await sock.sendMessage(getSendTarget(sender), { text: reply });
    appendHistoryEntry(user.history, 'Usuario', text, userTs);
    appendHistoryEntry(user.history, 'Hime', reply, replyTs);
    saveChat(sender);
    broadcast({
        type: 'help_alert',
        from: sender,
        name: user.name,
        text,
        timestamp: userTs,
        tags: user.tags,
        triggerMode,
        matchedRule
    });
    return true;
}

function broadcastHumanHandoffStatus({ sender, user, pending, reason = '', expiresAt = 0 }) {
    broadcast({
        type: 'human_handoff_status',
        from: sender,
        name: user?.name || sender,
        pending: !!pending,
        reason: String(reason || ''),
        ...(pending && expiresAt ? { expiresAt } : {})
    });
}

function detectAttendanceCommand(text) {
    const t = normalizeTextForCommand(text);
    if (!t) return null;
    const inList = ['entrada', 'entrei', 'cheguei', 'iniciar turno', 'iniciar expediente', 'ponto entrada', 'checkin', 'check in'];
    const outList = ['saida', 'sai', 'saindo', 'encerrar turno', 'fim do turno', 'finalizar expediente', 'ponto saida', 'checkout', 'check out'];
    if (inList.some(k => t.includes(k))) return 'entry';
    if (outList.some(k => t.includes(k))) return 'exit';
    return null;
}

bootstrapAttendanceCatalog();
try {
    const summary = syncAttendanceClassTemplatesFromContext({ actor: 'system', mode: 'bootstrap' });
    if (summary?.parsed || summary?.upserted || summary?.deactivated) {
        console.log(`[attendance] templates bootstrap parsed=${summary.parsed} upserted=${summary.upserted} deactivated=${summary.deactivated}`);
    }
} catch (e) {
    console.error('[attendance] templates bootstrap error:', e?.message || e);
}
bootstrapAttendanceEmployeeRoles();
if (ATTENDANCE_ENABLED) {
    try { getAttendanceGeoPolicy(); } catch (e) {}
}

function markEmployeeWhatsappConfirmed(employeeId) {
    try {
        db.prepare('UPDATE attendance_employees SET whatsapp_confirmed=1, updated_at=? WHERE id=?').run(Date.now(), employeeId);
    } catch (e) {}
}

function parseAttendanceAbsenceJustification(text) {
    const raw = String(text || '').trim();
    const norm = normalizeTextForCommand(raw);
    if (!norm.startsWith('justificar falta')) return { matched: false };
    const rest = raw.replace(/^justificar\s+falta\s*/i, '').trim();
    if (!rest) return { matched: true, dateKey: null, reason: '' };
    const dateMatchBr = /^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/i.exec(rest);
    if (dateMatchBr) {
        return {
            matched: true,
            dateKey: parseDateKeyInput(dateMatchBr[1]),
            reason: String(dateMatchBr[2] || '').trim()
        };
    }
    const dateMatchIso = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/i.exec(rest);
    if (dateMatchIso) {
        return {
            matched: true,
            dateKey: parseDateKeyInput(dateMatchIso[1]),
            reason: String(dateMatchIso[2] || '').trim()
        };
    }
    return { matched: true, dateKey: null, reason: rest };
}

function getAttendanceJustificationForDate(employeeId, dateKey) {
    const key = parseDateKeyInput(dateKey);
    if (!key) return null;
    return db.prepare(`
        SELECT *
        FROM attendance_absence_justifications
        WHERE employee_id=? AND date_key=? AND status IN ('approved_auto', 'approved_manual')
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
    `).get(Number(employeeId), key) || null;
}

function upsertAttendanceAbsenceJustification({ employeeId, dateKey, reason, source = 'whatsapp', status = 'approved_auto' }) {
    const safeDate = parseDateKeyInput(dateKey);
    if (!safeDate) return null;
    const safeReason = sanitizePublicText(reason || '', 280);
    if (!safeReason) return null;
    const safeSource = source === 'panel' ? 'panel' : 'whatsapp';
    const safeStatus = ['approved_auto', 'approved_manual', 'rejected'].includes(String(status || ''))
        ? String(status)
        : 'approved_auto';
    const now = Date.now();
    db.prepare(`
        INSERT INTO attendance_absence_justifications (employee_id, date_key, reason, source, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(employee_id, date_key) DO UPDATE SET
            reason=excluded.reason,
            source=excluded.source,
            status=excluded.status,
            updated_at=excluded.updated_at
    `).run(Number(employeeId), safeDate, safeReason, safeSource, safeStatus, now, now);
    return db.prepare('SELECT * FROM attendance_absence_justifications WHERE employee_id=? AND date_key=? LIMIT 1')
        .get(Number(employeeId), safeDate) || null;
}

function isEmployeeOnVacation(employeeId, tsOrDateKey) {
    const dateKey = typeof tsOrDateKey === 'string'
        ? parseDateKeyInput(tsOrDateKey)
        : dateKeyFromTs(Number(tsOrDateKey || Date.now()));
    if (!dateKey) return false;
    const row = db.prepare(`
        SELECT id
        FROM attendance_vacations
        WHERE employee_id=? AND active=1 AND start_date<=? AND end_date>=?
        ORDER BY start_date ASC
        LIMIT 1
    `).get(Number(employeeId), dateKey, dateKey);
    return !!row;
}

function getEmployeeVacationForDate(employeeId, tsOrDateKey) {
    const dateKey = typeof tsOrDateKey === 'string'
        ? parseDateKeyInput(tsOrDateKey)
        : dateKeyFromTs(Number(tsOrDateKey || Date.now()));
    if (!dateKey) return null;
    return db.prepare(`
        SELECT *
        FROM attendance_vacations
        WHERE employee_id=? AND active=1 AND start_date<=? AND end_date>=?
        ORDER BY start_date ASC
        LIMIT 1
    `).get(Number(employeeId), dateKey, dateKey) || null;
}

function listEmployeeVacations(employeeId) {
    return db.prepare(`
        SELECT *
        FROM attendance_vacations
        WHERE employee_id=? AND active=1
        ORDER BY start_date ASC, end_date ASC
    `).all(Number(employeeId));
}

function createVacation({ employeeId, startDate, endDate, note = '', createdBy = '' }) {
    const start = parseDateKeyInput(startDate);
    const end = parseDateKeyInput(endDate);
    if (!start || !end || start > end) return { ok: false, error: 'invalid_date_range' };
    const overlap = db.prepare(`
        SELECT id
        FROM attendance_vacations
        WHERE employee_id=? AND active=1 AND NOT (end_date < ? OR start_date > ?)
        LIMIT 1
    `).get(Number(employeeId), start, end);
    if (overlap) return { ok: false, error: 'vacation_overlap' };
    const now = Date.now();
    const result = db.prepare(`
        INSERT INTO attendance_vacations (employee_id, start_date, end_date, note, active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    `).run(Number(employeeId), start, end, sanitizePublicText(note || '', 180), sanitizePublicText(createdBy || '', 40), now, now);
    const row = db.prepare('SELECT * FROM attendance_vacations WHERE id=?').get(Number(result.lastInsertRowid));
    return { ok: true, item: row };
}

function deactivateVacation(vacationId) {
    const id = Number(vacationId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    db.prepare('UPDATE attendance_vacations SET active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    return db.prepare('SELECT * FROM attendance_vacations WHERE id=?').get(id) || null;
}

function normalizeGeoFallbackMode(raw) {
    const mode = String(raw || '').trim().toLowerCase();
    if (mode === 'strict_block') return 'strict_block';
    return 'justify_and_alert';
}

function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function toNullableNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function ensureAttendanceGeoPolicyRow() {
    const row = db.prepare('SELECT * FROM attendance_geo_policy WHERE id=1').get();
    if (row) return row;
    const now = Date.now();
    db.prepare(`
        INSERT INTO attendance_geo_policy (id, enabled, require_entry_location, require_exit_location, academy_lat, academy_lng, radius_m, fallback_mode, request_ttl_sec, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        ATTENDANCE_GEO_DEFAULTS.enabled ? 1 : 0,
        ATTENDANCE_GEO_DEFAULTS.require_entry_location ? 1 : 0,
        ATTENDANCE_GEO_DEFAULTS.require_exit_location ? 1 : 0,
        ATTENDANCE_GEO_DEFAULTS.academy_lat,
        ATTENDANCE_GEO_DEFAULTS.academy_lng,
        ATTENDANCE_GEO_DEFAULTS.radius_m,
        ATTENDANCE_GEO_DEFAULTS.fallback_mode,
        ATTENDANCE_GEO_DEFAULTS.request_ttl_sec,
        now
    );
    return db.prepare('SELECT * FROM attendance_geo_policy WHERE id=1').get();
}

function getAttendanceGeoPolicy() {
    const row = ensureAttendanceGeoPolicyRow();
    return {
        enabled: !!Number(row.enabled || 0),
        require_entry_location: !!Number(row.require_entry_location || 0),
        require_exit_location: !!Number(row.require_exit_location || 0),
        academy_lat: toNullableNumber(row.academy_lat),
        academy_lng: toNullableNumber(row.academy_lng),
        radius_m: clampInt(row.radius_m, 30, 1000, ATTENDANCE_GEO_DEFAULTS.radius_m),
        fallback_mode: normalizeGeoFallbackMode(row.fallback_mode),
        request_ttl_sec: clampInt(row.request_ttl_sec, 60, 1800, ATTENDANCE_GEO_DEFAULTS.request_ttl_sec),
        updated_at: Number(row.updated_at || 0)
    };
}

function setAttendanceGeoPolicy(patch = {}) {
    const current = getAttendanceGeoPolicy();
    const next = {
        enabled: patch.enabled === undefined ? current.enabled : !!patch.enabled,
        require_entry_location: patch.require_entry_location === undefined ? current.require_entry_location : !!patch.require_entry_location,
        require_exit_location: patch.require_exit_location === undefined ? current.require_exit_location : !!patch.require_exit_location,
        academy_lat: patch.academy_lat === undefined ? current.academy_lat : toNullableNumber(patch.academy_lat),
        academy_lng: patch.academy_lng === undefined ? current.academy_lng : toNullableNumber(patch.academy_lng),
        radius_m: patch.radius_m === undefined ? current.radius_m : clampInt(patch.radius_m, 30, 1000, current.radius_m),
        fallback_mode: patch.fallback_mode === undefined ? current.fallback_mode : normalizeGeoFallbackMode(patch.fallback_mode),
        request_ttl_sec: patch.request_ttl_sec === undefined ? current.request_ttl_sec : clampInt(patch.request_ttl_sec, 60, 1800, current.request_ttl_sec)
    };
    const now = Date.now();
    db.prepare(`
        UPDATE attendance_geo_policy
        SET enabled=?, require_entry_location=?, require_exit_location=?, academy_lat=?, academy_lng=?, radius_m=?, fallback_mode=?, request_ttl_sec=?, updated_at=?
        WHERE id=1
    `).run(
        next.enabled ? 1 : 0,
        next.require_entry_location ? 1 : 0,
        next.require_exit_location ? 1 : 0,
        next.academy_lat,
        next.academy_lng,
        next.radius_m,
        next.fallback_mode,
        next.request_ttl_sec,
        now
    );
    return getAttendanceGeoPolicy();
}

function cleanupExpiredAttendanceGeoPending(now = Date.now()) {
    try {
        db.prepare("UPDATE attendance_geo_pending SET status='expired', updated_at=? WHERE status='pending' AND expires_at<?")
            .run(now, now);
    } catch (e) {}
}

function resolvePendingGeoRequest(id, status) {
    const safeStatus = ['resolved', 'expired', 'cancelled'].includes(String(status || '')) ? status : 'resolved';
    try {
        db.prepare('UPDATE attendance_geo_pending SET status=?, updated_at=? WHERE id=?').run(safeStatus, Date.now(), id);
    } catch (e) {}
}

function getActivePendingGeoRequest(senderJid, employeeId = null) {
    cleanupExpiredAttendanceGeoPending();
    const now = Date.now();
    const baseSql = `
        SELECT * FROM attendance_geo_pending
        WHERE status='pending' AND sender_jid=? AND expires_at>=?
    `;
    const row = (Number.isFinite(Number(employeeId)) && Number(employeeId) > 0)
        ? db.prepare(`${baseSql} AND employee_id=? ORDER BY id DESC LIMIT 1`).get(senderJid, now, Number(employeeId))
        : db.prepare(`${baseSql} ORDER BY id DESC LIMIT 1`).get(senderJid, now);
    return row || null;
}

function getActivePendingGeoRequestByEmployee(employeeId) {
    const safeEmployeeId = Number(employeeId);
    if (!Number.isFinite(safeEmployeeId) || safeEmployeeId <= 0) return null;
    cleanupExpiredAttendanceGeoPending();
    const now = Date.now();
    const row = db.prepare(`
        SELECT * FROM attendance_geo_pending
        WHERE status='pending' AND employee_id=? AND expires_at>=?
        ORDER BY id DESC
        LIMIT 1
    `).get(safeEmployeeId, now);
    return row || null;
}

function openPendingGeoRequest(employeeId, senderJid, eventType = 'entry', ttlSec = ATTENDANCE_GEO_DEFAULTS.request_ttl_sec, punchContext = null) {
    const now = Date.now();
    const safeTtl = clampInt(ttlSec, 60, 1800, ATTENDANCE_GEO_DEFAULTS.request_ttl_sec);
    cleanupExpiredAttendanceGeoPending(now);
    const safeDateKey = parseDateKeyInput(punchContext?.dateKey || '') || '';
    const safeBlockStartMin = Number.isFinite(Number(punchContext?.block?.start_min)) ? Number(punchContext.block.start_min) : null;
    const safeBlockEndMin = Number.isFinite(Number(punchContext?.block?.end_min)) ? Number(punchContext.block.end_min) : null;
    const existing = getActivePendingGeoRequest(senderJid, employeeId);
    if (existing && String(existing.event_type || '') === String(eventType)) {
        db.prepare(`
            UPDATE attendance_geo_pending
            SET requested_at=?, expires_at=?, schedule_date_key=?, block_start_min=?, block_end_min=?, updated_at=?
            WHERE id=?
        `).run(now, now + (safeTtl * 1000), safeDateKey, safeBlockStartMin, safeBlockEndMin, now, existing.id);
        return db.prepare('SELECT * FROM attendance_geo_pending WHERE id=?').get(existing.id) || existing;
    }
    if (existing) resolvePendingGeoRequest(existing.id, 'cancelled');
    try {
        db.prepare(`
            UPDATE attendance_geo_pending
            SET status='cancelled', updated_at=?
            WHERE status='pending' AND employee_id=?
        `).run(now, Number(employeeId));
    } catch (e) {}
    const result = db.prepare(`
        INSERT INTO attendance_geo_pending (
            employee_id, sender_jid, event_type, requested_at, expires_at, status, schedule_date_key, block_start_min, block_end_min, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(employeeId, senderJid, eventType, now, now + (safeTtl * 1000), safeDateKey, safeBlockStartMin, safeBlockEndMin, now, now);
    return db.prepare('SELECT * FROM attendance_geo_pending WHERE id=?').get(Number(result.lastInsertRowid)) || null;
}

function getPendingGeoRequestForSender(senderJid, senderRawJid, employeeId = null) {
    const candidates = [senderJid, senderRawJid].filter(Boolean);
    for (const jid of candidates) {
        const row = getActivePendingGeoRequest(jid, employeeId);
        if (row) return row;
    }
    const byEmployee = getActivePendingGeoRequestByEmployee(employeeId);
    if (byEmployee) {
        const nextSenderJid = String(senderJid || senderRawJid || '').trim();
        if (nextSenderJid && String(byEmployee.sender_jid || '') !== nextSenderJid) {
            try {
                db.prepare('UPDATE attendance_geo_pending SET sender_jid=?, updated_at=? WHERE id=?')
                    .run(nextSenderJid, Date.now(), byEmployee.id);
            } catch (e) {}
        }
        return byEmployee;
    }
    return null;
}

function unwrapIncomingMessage(message) {
    if (!message || typeof message !== 'object') return {};
    let wrapped = message;
    for (let i = 0; i < 6; i += 1) {
        const next = wrapped?.ephemeralMessage?.message
            || wrapped?.viewOnceMessage?.message
            || wrapped?.viewOnceMessageV2?.message
            || wrapped?.viewOnceMessageV2Extension?.message;
        if (!next || next === wrapped) break;
        wrapped = next;
    }
    return wrapped || {};
}

function toSafeNumber(raw, fallback = 0) {
    if (raw && typeof raw === 'object' && Number.isFinite(Number(raw.low))) return Number(raw.low);
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeChatImageMime(mime) {
    return String(mime || '').split(';')[0].trim().toLowerCase();
}

function extFromChatImageMime(mime) {
    const m = normalizeChatImageMime(mime);
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    return '';
}

function buildChatImagePublicUrl(filename, ts = Date.now()) {
    const safe = encodeURIComponent(String(filename || '').trim());
    return `/admin/chat/media/${safe}?v=${Number(ts || Date.now())}`;
}

function normalizeChatStickerMime(mime) {
    return String(mime || '').split(';')[0].trim().toLowerCase();
}

function isWebpBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

function buildChatImageHistoryMarker(media) {
    const payload = {
        url: String(media?.url || ''),
        caption: sanitizePublicText(media?.caption || '', 1024),
        mime: normalizeChatImageMime(media?.mime || ''),
        size: Math.max(0, toSafeNumber(media?.size, 0)),
        ts: toSafeNumber(media?.ts, Date.now())
    };
    if (Number.isFinite(Number(media?.width)) && Number(media.width) > 0) payload.width = Number(media.width);
    if (Number.isFinite(Number(media?.height)) && Number(media.height) > 0) payload.height = Number(media.height);
    return `[IMG]${JSON.stringify(payload)}`;
}

function buildChatStickerHistoryMarker(media) {
    const payload = {
        url: String(media?.url || ''),
        mime: normalizeChatStickerMime(media?.mime || ''),
        size: Math.max(0, toSafeNumber(media?.size, 0)),
        ts: toSafeNumber(media?.ts, Date.now())
    };
    return `[STK]${JSON.stringify(payload)}`;
}

async function saveChatImageBuffer(buffer, mime, sourceTag = 'in') {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty_buffer');
    if (buffer.length > CHAT_IMAGE_MAX_BYTES) throw new Error('file_too_large');
    const normalizedMime = normalizeChatImageMime(mime);
    if (!CHAT_IMAGE_ALLOWED_MIME.has(normalizedMime)) throw new Error('invalid_file_type');
    const ext = extFromChatImageMime(normalizedMime);
    if (!ext) throw new Error('invalid_file_type');
    const filename = `${Date.now()}_${sourceTag}_${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const fullPath = path.join(CHAT_MEDIA_DIR, filename);
    await writeFile(fullPath, buffer);
    return {
        filename,
        fullPath,
        mime: normalizedMime,
        size: buffer.length
    };
}

async function saveChatStickerBuffer(buffer, mime, sourceTag = 'stk') {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty_buffer');
    if (buffer.length > CHAT_STICKER_MAX_BYTES) throw new Error('file_too_large');
    const normalizedMime = normalizeChatStickerMime(mime);
    const mimeAllowed = CHAT_STICKER_ALLOWED_MIME.has(normalizedMime);
    if (!mimeAllowed && !isWebpBuffer(buffer)) throw new Error('invalid_sticker_type');
    const filename = `${Date.now()}_${sourceTag}_${crypto.randomBytes(6).toString('hex')}.webp`;
    const fullPath = path.join(CHAT_MEDIA_DIR, filename);
    await writeFile(fullPath, buffer);
    return {
        filename,
        fullPath,
        mime: 'image/webp',
        size: buffer.length
    };
}

function extractIncomingImage(message) {
    const wrapped = unwrapIncomingMessage(message);
    const image = wrapped.imageMessage;
    if (!image) return null;
    const caption = sanitizePublicText(image.caption || '', 1024);
    const mime = normalizeChatImageMime(image.mimetype || '');
    return {
        caption,
        mime,
        fileLength: toSafeNumber(image.fileLength, 0),
        width: toSafeNumber(image.width, 0),
        height: toSafeNumber(image.height, 0)
    };
}

function extractIncomingSticker(message) {
    const wrapped = unwrapIncomingMessage(message);
    let sticker = wrapped.stickerMessage || null;
    if (!sticker && wrapped?.documentWithCaptionMessage?.message?.stickerMessage) {
        sticker = wrapped.documentWithCaptionMessage.message.stickerMessage;
    }
    if (!sticker && wrapped && typeof wrapped === 'object') {
        const stack = [wrapped];
        const seen = new Set();
        while (stack.length && !sticker) {
            const node = stack.pop();
            if (!node || typeof node !== 'object') continue;
            if (seen.has(node)) continue;
            seen.add(node);
            if (node.stickerMessage && typeof node.stickerMessage === 'object') {
                sticker = node.stickerMessage;
                break;
            }
            Object.values(node).forEach((v) => {
                if (v && typeof v === 'object') stack.push(v);
            });
        }
    }
    if (!sticker) return null;
    const mime = normalizeChatStickerMime(sticker.mimetype || 'image/webp');
    return {
        mime,
        isAnimated: !!sticker.isAnimated,
        fileLength: toSafeNumber(sticker.fileLength, 0)
    };
}

function extractIncomingLocation(message) {
    const wrapped = unwrapIncomingMessage(message);
    const loc = wrapped.locationMessage || wrapped.liveLocationMessage;
    if (!loc) return null;
    const latitude = Number(loc.degreesLatitude);
    const longitude = Number(loc.degreesLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const accuracy = Number.isFinite(Number(loc.accuracyInMeters)) ? Number(loc.accuracyInMeters) : null;
    return {
        latitude,
        longitude,
        accuracy_m: accuracy
    };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const r = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = (Math.sin(dLat / 2) ** 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * (Math.sin(dLon / 2) ** 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
}

function isJustificationText(text) {
    const t = normalizeTextForCommand(text || '');
    if (!t) return false;
    if (t.includes('justificativa')) return true;
    if (t.includes('sem gps')) return true;
    if (t.includes('gps falhou')) return true;
    if (t.includes('localizacao indisponivel')) return true;
    if (t.includes('nao consigo enviar localizacao')) return true;
    return false;
}

function createAttendanceEvent(employeeId, eventType, source, eventAt, messageText, note, geo = {}) {
    const at = Number(eventAt || Date.now());
    const msg = String(messageText || '').slice(0, 1000);
    const noteText = String(note || '').slice(0, 280);
    const geoStatus = sanitizePublicText(geo?.status || '', 24);
    const geoLat = toNullableNumber(geo?.lat);
    const geoLng = toNullableNumber(geo?.lng);
    const geoAccuracy = toNullableNumber(geo?.accuracy_m);
    const geoDistance = toNullableNumber(geo?.distance_m);
    const geoNote = sanitizePublicText(geo?.note || '', 280);
    try {
        db.prepare(`
            INSERT INTO attendance_events (
                employee_id, event_type, source, event_at, message_text, note, geo_status, geo_lat, geo_lng, geo_accuracy_m, geo_distance_m, geo_note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            employeeId,
            eventType,
            source || 'whatsapp',
            at,
            msg,
            noteText,
            geoStatus,
            geoLat,
            geoLng,
            geoAccuracy,
            geoDistance,
            geoNote,
            Date.now()
        );
    } catch (e) {}
}

function hasRecentAttendanceEvent(employeeId, eventType, withinMs = 90 * 1000) {
    const row = db.prepare('SELECT event_at FROM attendance_events WHERE employee_id=? AND event_type=? ORDER BY id DESC LIMIT 1')
        .get(employeeId, eventType);
    if (!row || !row.event_at) return false;
    return (Date.now() - Number(row.event_at)) <= withinMs;
}

function getDayPeriodGreeting(ts) {
    const d = new Date(Number(ts || Date.now()));
    const hour = Number(d.getHours());
    if (hour >= 5 && hour <= 11) return 'Bom dia';
    if (hour >= 12 && hour <= 17) return 'Boa tarde';
    return 'Boa noite';
}

function isKnownWhatsappForAttendance(jid) {
    if (!jid) return false;
    if (conversationState[jid]) return true;
    const alias = db.prepare('SELECT jid FROM contact_alias WHERE jid=? OR canonical_jid=? LIMIT 1').get(jid, jid);
    return !!alias;
}

function getBotPhoneDigits() {
    const botJid = sock?.user?.id || '';
    return normalizePhoneDigits(phoneFromJid(botJid));
}

let attendanceDebugLast = {
    at: 0,
    sender: '',
    senderRaw: '',
    text: '',
    command: null,
    matched: false,
    consumed: false,
    employeeId: null,
    reason: '',
    geoStatus: '',
    geoDistanceM: null
};

function findAttendanceEmployeeByIncomingJid(senderJid, senderRawJid) {
    const candidates = new Set();
    [senderJid, senderRawJid].forEach((jid) => {
        if (!jid) return;
        candidates.add(jid);
        const digits = extractPhoneDigitsFromJid(jid);
        if (digits) candidates.add(`${digits}@s.whatsapp.net`);
        const mapped = contactAliasCache[jid];
        if (mapped) candidates.add(mapped);
    });

    for (const jid of candidates) {
        const row = db.prepare('SELECT * FROM attendance_employees WHERE active=1 AND whatsapp_jid=?').get(jid);
        if (row) return row;
    }

    const phones = [];
    for (const jid of candidates) {
        const digits = normalizePhoneDigits(phoneFromJid(jid));
        if (digits) phones.push(digits);
    }
    if (!phones.length) return null;

    const rows = db.prepare('SELECT * FROM attendance_employees WHERE active=1').all();
    for (const phone of phones) {
        const incomingSet = brPhoneVariants(phone);
        const found = rows.find((r) => {
            const employeeSet = brPhoneVariants(r.whatsapp_phone || '');
            for (const p of incomingSet) {
                if (employeeSet.has(p)) return true;
            }
            return false;
        });
        if (found) {
            const incomingCanonical = toWhatsappJid(phone);
            if (incomingCanonical && found.whatsapp_jid !== incomingCanonical) {
                try {
                    db.prepare('UPDATE attendance_employees SET whatsapp_jid=?, whatsapp_phone=?, updated_at=? WHERE id=?')
                        .run(incomingCanonical, normalizePhoneDigits(phone), Date.now(), found.id);
                    found.whatsapp_jid = incomingCanonical;
                    found.whatsapp_phone = normalizePhoneDigits(phone);
                } catch (e) {}
            }
            return found;
        }
    }

    return null;
}

function computeAttendanceReport({ fromDate, toDate, employeeId }) {
    const start = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return {
            rows: [],
            classRows: [],
            summary: {
                totalDays: 0,
                presentDays: 0,
                lateDays: 0,
                lateMinutes: 0,
                absences: 0,
                missingExitDays: 0,
                workedMinutes: 0,
                workedHours: '00:00',
                totalEntries: 0,
                totalExits: 0,
                expectedBlocks: 0,
                blocksOnTime: 0,
                blocksLateStart: 0,
                blocksMissingEntry: 0,
                blocksMissingExit: 0,
                blocksEarlyExit: 0,
                classExpected: 0,
                classCompleted: 0,
                classMissed: 0,
                classAmountTotal: 0,
                classAmountCurrency: formatCurrencyBRL(0),
                geoInsideEntries: 0,
                geoJustifiedEntries: 0,
                geoOutsideAttempts: 0,
                geoMissingEntries: 0,
                vacationDays: 0,
                justifiedAbsences: 0,
                unjustifiedAbsences: 0
            }
        };
    }

    const empRows = employeeId
        ? db.prepare('SELECT * FROM attendance_employees WHERE id=?').all(Number(employeeId))
        : db.prepare('SELECT * FROM attendance_employees WHERE active=1 ORDER BY name ASC').all();
    if (!empRows.length) {
        return {
            rows: [],
            classRows: [],
            summary: {
                totalDays: 0,
                presentDays: 0,
                lateDays: 0,
                lateMinutes: 0,
                absences: 0,
                missingExitDays: 0,
                workedMinutes: 0,
                workedHours: '00:00',
                totalEntries: 0,
                totalExits: 0,
                expectedBlocks: 0,
                blocksOnTime: 0,
                blocksLateStart: 0,
                blocksMissingEntry: 0,
                blocksMissingExit: 0,
                blocksEarlyExit: 0,
                classExpected: 0,
                classCompleted: 0,
                classMissed: 0,
                classAmountTotal: 0,
                classAmountCurrency: formatCurrencyBRL(0),
                geoInsideEntries: 0,
                geoJustifiedEntries: 0,
                geoOutsideAttempts: 0,
                geoMissingEntries: 0,
                vacationDays: 0,
                justifiedAbsences: 0,
                unjustifiedAbsences: 0
            }
        };
    }

    const allSchedules = db.prepare('SELECT * FROM attendance_schedules WHERE active=1 ORDER BY start_time ASC').all();
    const activityRows = db.prepare('SELECT id, type, name, default_value FROM attendance_activity_catalog').all();
    const activityById = new Map(activityRows.map((a) => [Number(a.id), a]));
    const rows = [];
    const classRows = [];
    let lateDays = 0;
    let lateMinutes = 0;
    let absences = 0;
    let presentDays = 0;
    let missingExitDays = 0;
    let workedMinutes = 0;
    let totalDays = 0;
    let totalEntries = 0;
    let totalExits = 0;
    let expectedBlocks = 0;
    let blocksOnTime = 0;
    let blocksLateStart = 0;
    let blocksMissingEntry = 0;
    let blocksMissingExit = 0;
    let blocksEarlyExit = 0;
    let classExpected = 0;
    let classCompleted = 0;
    let classAmountTotal = 0;
    let geoInsideEntries = 0;
    let geoJustifiedEntries = 0;
    let geoOutsideAttempts = 0;
    let geoMissingEntries = 0;
    let vacationDays = 0;
    let justifiedAbsences = 0;
    let unjustifiedAbsences = 0;

    const EARLY_ENTRY_WINDOW_MS = 90 * 60 * 1000;
    const EXIT_GRACE_WINDOW_MS = 120 * 60 * 1000;
    const EARLY_EXIT_TOLERANCE_MIN = 5;

    for (const emp of empRows) {
        const empSchedules = allSchedules.filter(s => Number(s.employee_id) === Number(emp.id));
        for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
            const dayEnd = dayStart + 86399999;
            const dayDateKey = dateKeyFromTs(dayStart);
            const weekday = new Date(dayStart).getDay();
            const schedules = empSchedules.filter(s => Number(s.weekday) === Number(weekday));
            if (!schedules.length) continue;
            const vacation = getEmployeeVacationForDate(emp.id, dayDateKey);
            if (vacation) {
                vacationDays += 1;
                rows.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    employee_role: emp.role || '',
                    date: dayDateKey,
                    weekday,
                    weekday_label: WEEKDAY_LABELS[weekday] || '',
                    expected_start: schedules[0]?.start_time || '',
                    expected_end: schedules[schedules.length - 1]?.end_time || '',
                    class_name: schedules[0]?.activity_label || schedules[0]?.class_name || '',
                    tolerance_min: Number(schedules[0]?.tolerance_min || 0),
                    first_entry_at: null,
                    first_entry_hhmm: '',
                    first_entry_geo_status: '',
                    first_entry_geo_distance_m: null,
                    last_exit_at: null,
                    last_exit_hhmm: '',
                    last_exit_geo_status: '',
                    last_exit_geo_distance_m: null,
                    exit_assumed: false,
                    missing_exit: false,
                    worked_min: 0,
                    worked_hhmm: '00:00',
                    entries_hhmm: [],
                    exits_hhmm: [],
                    entries_count: 0,
                    exits_count: 0,
                    entries_all: '',
                    exits_all: '',
                    late_min: 0,
                    absent: false,
                    justified_absence: false,
                    justification_reason: '',
                    on_vacation: true,
                    vacation_note: sanitizePublicText(vacation.note || '', 180),
                    message_count: 0,
                    geo_outside_attempts: 0
                });
                continue;
            }

            const events = db.prepare('SELECT * FROM attendance_events WHERE employee_id=? AND event_at BETWEEN ? AND ? ORDER BY event_at ASC')
                .all(emp.id, dayStart, dayEnd);
            const entryEvents = events.filter(e => e.event_type === 'entry');
            const exitEvents = events.filter(e => e.event_type === 'exit');
            const geoOutsideEvents = events.filter(e => e.event_type === 'geo_outside');
            const firstEntry = entryEvents[0] || null;
            const lastExit = exitEvents.length ? exitEvents[exitEvents.length - 1] : null;
            const absenceJustification = getAttendanceJustificationForDate(emp.id, dayDateKey);
            const messageCount = events.filter(e => e.event_type === 'message').length;
            const entriesHHMM = entryEvents.map(e => hhmmFromTs(e.event_at));
            const exitsHHMM = exitEvents.map(e => hhmmFromTs(e.event_at));
            totalEntries += entryEvents.length;
            totalExits += exitEvents.length;
            geoOutsideAttempts += geoOutsideEvents.length;

            const blocks = groupSchedulesIntoBlocks(schedules, ATTENDANCE_CONSECUTIVE_GAP_MIN);

            const usedEntryIdx = new Set();
            const usedExitIdx = new Set();
            blocks.forEach((block, blockIndex) => {
                const blockStartAt = dayStart + (block.start_min * 60000);
                const blockEndAt = dayStart + (block.end_min * 60000);
                const expectedEntryLimitAt = blockStartAt + (block.tolerance_min * 60000);

                let entryIdx = -1;
                for (let i = 0; i < entryEvents.length; i += 1) {
                    if (usedEntryIdx.has(i)) continue;
                    const at = Number(entryEvents[i].event_at || 0);
                    if (at >= (blockStartAt - EARLY_ENTRY_WINDOW_MS) && at <= blockEndAt) {
                        entryIdx = i;
                        break;
                    }
                }
                if (entryIdx >= 0) usedEntryIdx.add(entryIdx);
                const matchedEntry = entryIdx >= 0 ? entryEvents[entryIdx] : null;

                let exitIdx = -1;
                for (let i = 0; i < exitEvents.length; i += 1) {
                    if (usedExitIdx.has(i)) continue;
                    const at = Number(exitEvents[i].event_at || 0);
                    if (at >= blockStartAt && at <= (blockEndAt + EXIT_GRACE_WINDOW_MS)) {
                        exitIdx = i;
                    }
                }
                if (exitIdx >= 0) usedExitIdx.add(exitIdx);
                const matchedExit = exitIdx >= 0 ? exitEvents[exitIdx] : null;

                const entryGeoStatus = sanitizePublicText(matchedEntry?.geo_status || '', 24) || '';
                const exitGeoStatus = sanitizePublicText(matchedExit?.geo_status || '', 24) || '';
                if (entryGeoStatus === 'inside') geoInsideEntries += 1;
                else if (entryGeoStatus === 'justified') geoJustifiedEntries += 1;
                else if (entryGeoStatus === 'outside') geoOutsideAttempts += 1;
                else if (matchedEntry) geoMissingEntries += 1;

                const missingEntry = !matchedEntry;
                const missingExit = !matchedExit;
                const startLateMin = (!missingEntry && Number(matchedEntry.event_at) > expectedEntryLimitAt)
                    ? Math.ceil((Number(matchedEntry.event_at) - expectedEntryLimitAt) / 60000)
                    : 0;
                const earlyExitMin = (!missingExit && Number(matchedExit.event_at) < (blockEndAt - (EARLY_EXIT_TOLERANCE_MIN * 60000)))
                    ? Math.ceil((blockEndAt - Number(matchedExit.event_at)) / 60000)
                    : 0;

                let startStatus = 'ok';
                if (missingEntry) startStatus = 'missing';
                else if (startLateMin > 0) startStatus = 'late';

                let endStatus = 'ok';
                if (missingExit) endStatus = 'missing';
                else if (earlyExitMin > 0) endStatus = 'early';

                const classItems = (block.schedules || []).filter((s) => normalizeAttendanceActivityType(s.schedule_type) === 'class');
                const classItemsCount = classItems.length;
                classExpected += classItemsCount;
                // Regra financeira: se houve entrada valida no bloco, contabiliza as aulas do bloco
                // mesmo quando a saida nao foi registrada (a saida continua em alerta operacional).
                const blockCompleted = !!matchedEntry;
                const classItemsCompleted = blockCompleted ? classItemsCount : 0;
                classCompleted += classItemsCompleted;
                let classAmount = 0;
                const classAmountBreakdown = [];
                if (classItemsCompleted > 0) {
                    for (const item of classItems) {
                        const activity = activityById.get(Number(item.activity_id || 0));
                        const defaultValue = Math.max(0, Number(activity?.default_value || 0));
                        const overrideValue = Math.max(0, Number(item.value_per_class || 0));
                        const finalValue = overrideValue > 0 ? overrideValue : defaultValue;
                        classAmount += finalValue;
                        const label = sanitizePublicText(item.activity_label || activity?.name || item.class_name || 'Aula', 80) || 'Aula';
                        classAmountBreakdown.push(`${label}: ${formatCurrencyBRL(finalValue)}`);
                    }
                    classAmountTotal += classAmount;
                }

                expectedBlocks += 1;
                if (startStatus === 'ok' && endStatus === 'ok') blocksOnTime += 1;
                if (startStatus === 'late') blocksLateStart += 1;
                if (startStatus === 'missing') blocksMissingEntry += 1;
                if (endStatus === 'missing') blocksMissingExit += 1;
                if (endStatus === 'early') blocksEarlyExit += 1;

                classRows.push({
                    employee_id: emp.id,
                    employee_name: emp.name,
                    employee_role: emp.role || '',
                    date: dayDateKey,
                    weekday,
                    weekday_label: WEEKDAY_LABELS[weekday] || '',
                    block_index: blockIndex + 1,
                    classes_label: block.class_names.join(' + '),
                    classes_count: block.class_names.length,
                    expected_start_hhmm: minutesToHHMM(block.start_min),
                    expected_end_hhmm: minutesToHHMM(block.end_min),
                    entry_hhmm: matchedEntry ? hhmmFromTs(matchedEntry.event_at) : '',
                    exit_hhmm: matchedExit ? hhmmFromTs(matchedExit.event_at) : '',
                    start_status: startStatus,
                    end_status: endStatus,
                    late_min: startLateMin,
                    early_exit_min: earlyExitMin,
                    missing_entry: !!missingEntry,
                    missing_exit: !!missingExit,
                    on_time: startStatus === 'ok' && endStatus === 'ok',
                    class_items_count: classItemsCount,
                    class_items_completed: classItemsCompleted,
                    class_amount: Number(classAmount.toFixed(2)),
                    class_amount_currency: formatCurrencyBRL(classAmount),
                    class_amount_breakdown: classAmountBreakdown.join(' | '),
                    entry_geo_status: entryGeoStatus,
                    entry_geo_distance_m: Number.isFinite(Number(matchedEntry?.geo_distance_m)) ? Number(matchedEntry.geo_distance_m) : null,
                    exit_geo_status: exitGeoStatus,
                    exit_geo_distance_m: Number.isFinite(Number(matchedExit?.geo_distance_m)) ? Number(matchedExit.geo_distance_m) : null,
                    on_vacation: false,
                    justified_absence: !matchedEntry && !!absenceJustification,
                    justification_reason: !matchedEntry ? sanitizePublicText(absenceJustification?.reason || '', 280) : ''
                });
            });

            const baseSchedule = schedules[0];
            const startMin = parseHHMMToMinutes(baseSchedule.start_time);
            const endMin = parseHHMMToMinutes(baseSchedule.end_time);
            const tolerance = Math.max(0, Number(baseSchedule.tolerance_min || 0));
            const expectedMs = startMin === null ? null : dayStart + (startMin * 60000) + (tolerance * 60000);
            let lateMin = 0;
            if (firstEntry && expectedMs !== null && firstEntry.event_at > expectedMs) {
                lateMin = Math.ceil((firstEntry.event_at - expectedMs) / 60000);
            }
            const justifiedAbsence = !firstEntry && !!absenceJustification;
            const absent = !firstEntry && !justifiedAbsence;
            if (firstEntry) presentDays += 1;
            const missingExit = !!firstEntry && !lastExit;
            if (missingExit) missingExitDays += 1;

            let assumedExitAt = null;
            if (firstEntry && endMin !== null) {
                assumedExitAt = dayStart + (endMin * 60000);
                if (startMin !== null && endMin < startMin) assumedExitAt += 24 * 60 * 60000;
            }
            const effectiveExitAt = lastExit ? Number(lastExit.event_at) : assumedExitAt;
            const exitAssumed = !lastExit && !!firstEntry && Number.isFinite(effectiveExitAt);
            let workedMin = 0;
            if (firstEntry && Number.isFinite(effectiveExitAt) && effectiveExitAt > Number(firstEntry.event_at)) {
                workedMin = Math.max(0, Math.round((effectiveExitAt - Number(firstEntry.event_at)) / 60000));
                workedMinutes += workedMin;
            }
            if (lateMin > 0) {
                lateDays += 1;
                lateMinutes += lateMin;
            }
            if (justifiedAbsence) justifiedAbsences += 1;
            if (absent) {
                absences += 1;
                unjustifiedAbsences += 1;
            }
            totalDays += 1;

            rows.push({
                employee_id: emp.id,
                employee_name: emp.name,
                employee_role: emp.role || '',
                date: dayDateKey,
                weekday,
                weekday_label: WEEKDAY_LABELS[weekday] || '',
                expected_start: baseSchedule.start_time,
                expected_end: baseSchedule.end_time,
                class_name: baseSchedule.activity_label || baseSchedule.class_name || '',
                tolerance_min: tolerance,
                first_entry_at: firstEntry ? firstEntry.event_at : null,
                first_entry_hhmm: firstEntry ? hhmmFromTs(firstEntry.event_at) : '',
                first_entry_geo_status: sanitizePublicText(firstEntry?.geo_status || '', 24) || '',
                first_entry_geo_lat: Number.isFinite(Number(firstEntry?.geo_lat)) ? Number(firstEntry.geo_lat) : null,
                first_entry_geo_lng: Number.isFinite(Number(firstEntry?.geo_lng)) ? Number(firstEntry.geo_lng) : null,
                first_entry_lat: Number.isFinite(Number(firstEntry?.geo_lat)) ? Number(firstEntry.geo_lat) : null,
                first_entry_lng: Number.isFinite(Number(firstEntry?.geo_lng)) ? Number(firstEntry.geo_lng) : null,
                first_entry_geo_distance_m: Number.isFinite(Number(firstEntry?.geo_distance_m)) ? Number(firstEntry.geo_distance_m) : null,
                last_exit_at: Number.isFinite(effectiveExitAt) ? effectiveExitAt : null,
                last_exit_hhmm: Number.isFinite(effectiveExitAt) ? hhmmFromTs(effectiveExitAt) : '',
                last_exit_geo_status: sanitizePublicText(lastExit?.geo_status || '', 24) || '',
                last_exit_geo_lat: Number.isFinite(Number(lastExit?.geo_lat)) ? Number(lastExit.geo_lat) : null,
                last_exit_geo_lng: Number.isFinite(Number(lastExit?.geo_lng)) ? Number(lastExit.geo_lng) : null,
                last_exit_lat: Number.isFinite(Number(lastExit?.geo_lat)) ? Number(lastExit.geo_lat) : null,
                last_exit_lng: Number.isFinite(Number(lastExit?.geo_lng)) ? Number(lastExit.geo_lng) : null,
                last_exit_geo_distance_m: Number.isFinite(Number(lastExit?.geo_distance_m)) ? Number(lastExit.geo_distance_m) : null,
                exit_assumed: !!exitAssumed,
                missing_exit: !!missingExit,
                worked_min: workedMin,
                worked_hhmm: minutesToHHMM(workedMin),
                entries_hhmm: entriesHHMM,
                exits_hhmm: exitsHHMM,
                entries_count: entryEvents.length,
                exits_count: exitEvents.length,
                entries_all: entriesHHMM.join(' | '),
                exits_all: exitsHHMM.join(' | '),
                late_min: lateMin,
                absent,
                justified_absence: justifiedAbsence,
                justification_reason: sanitizePublicText(absenceJustification?.reason || '', 280),
                on_vacation: false,
                vacation_note: '',
                message_count: messageCount,
                geo_outside_attempts: geoOutsideEvents.length
            });
        }
    }

    rows.sort((a, b) => {
        if (a.date === b.date) return a.employee_name.localeCompare(b.employee_name);
        return a.date < b.date ? -1 : 1;
    });
    classRows.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        if (a.employee_name !== b.employee_name) return a.employee_name.localeCompare(b.employee_name);
        return Number(a.block_index || 0) - Number(b.block_index || 0);
    });

    return {
        rows,
        classRows,
        summary: {
            totalDays,
            presentDays,
            lateDays,
            lateMinutes,
            absences,
            missingExitDays,
            workedMinutes,
            workedHours: minutesToHHMM(workedMinutes),
            totalEntries,
            totalExits,
            expectedBlocks,
            blocksOnTime,
            blocksLateStart,
            blocksMissingEntry,
            blocksMissingExit,
            blocksEarlyExit,
            classExpected,
            classCompleted,
            classMissed: Math.max(0, classExpected - classCompleted),
            classAmountTotal: Number(classAmountTotal.toFixed(2)),
            classAmountCurrency: formatCurrencyBRL(classAmountTotal),
            geoInsideEntries,
            geoJustifiedEntries,
            geoOutsideAttempts,
            geoMissingEntries,
            vacationDays,
            justifiedAbsences,
            unjustifiedAbsences
        }
    };
}

function attendanceReminderNoteKey(dateKey, employeeId, blockStartMin) {
    return `reminder:${dateKey}:${employeeId}:${blockStartMin}`;
}

function hasAttendanceReminderBeenSent(employeeId, dateKey, blockStartMin) {
    const noteKey = attendanceReminderNoteKey(dateKey, employeeId, blockStartMin);
    const row = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND note=? LIMIT 1')
        .get(employeeId, 'reminder', noteKey);
    return !!row;
}

function attendanceAbsenceFollowupNoteKey(dateKey, employeeId) {
    return `absence_followup:${dateKey}:${employeeId}`;
}

function hasAttendanceAbsenceFollowupBeenSent(employeeId, dateKey) {
    const noteKey = attendanceAbsenceFollowupNoteKey(dateKey, employeeId);
    const row = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND note=? LIMIT 1')
        .get(employeeId, 'absence_followup', noteKey);
    return !!row;
}

function attendanceExitReminderNoteKey(dateKey, employeeId, blockStartMin) {
    return `exit_reminder:${dateKey}:${employeeId}:${blockStartMin}`;
}

function attendanceExitPreReminderNoteKey(dateKey, employeeId, blockStartMin) {
    return `exit_pre_reminder:${dateKey}:${employeeId}:${blockStartMin}`;
}

function hasAttendanceExitPreReminderBeenSent(employeeId, dateKey, blockStartMin) {
    const noteKey = attendanceExitPreReminderNoteKey(dateKey, employeeId, blockStartMin);
    const row = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND note=? LIMIT 1')
        .get(employeeId, 'exit_pre_reminder', noteKey);
    return !!row;
}

function hasAttendanceExitReminderBeenSent(employeeId, dateKey, blockStartMin) {
    const noteKey = attendanceExitReminderNoteKey(dateKey, employeeId, blockStartMin);
    const row = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND note=? LIMIT 1')
        .get(employeeId, 'exit_reminder', noteKey);
    return !!row;
}

function attendanceAutoExitNoteKey(dateKey, employeeId, blockStartMin) {
    return `auto_exit:${dateKey}:${employeeId}:${blockStartMin}`;
}

function hasAttendanceAutoExitBeenSent(employeeId, dateKey, blockStartMin) {
    const noteKey = attendanceAutoExitNoteKey(dateKey, employeeId, blockStartMin);
    const row = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND note=? LIMIT 1')
        .get(employeeId, 'exit', noteKey);
    return !!row;
}

function getAttendanceReminderMessage(employeeName, block) {
    const safeName = sanitizePublicText(employeeName || '', 120) || 'colaborador';
    const start = minutesToHHMM(block.start_min || 0);
    const end = minutesToHHMM(block.end_min || 0);
    const scopeLabel = getAttendanceBlockScopeLabel(block);
    return `Oi, ${safeName}! Seu horario de ${start} as ${end}${scopeLabel} comeca em breve. Quando iniciar, envie "entrada".`;
}

function getAttendanceAbsenceFollowupMessage(employeeName, dateKey) {
    const safeName = sanitizePublicText(employeeName || '', 120) || 'colaborador';
    const dateLabel = formatDateKeyBR(dateKey);
    return `Oi, ${safeName}! Ainda nao vimos sua entrada de hoje (${dateLabel}). Se voce ja chegou, envie "entrada". Se nao vier hoje, voce pode justificar assim: "justificar falta motivo" ou "justificar falta DD/MM/AAAA motivo".`;
}

function getAttendanceExitReminderMessage(employeeName, block) {
    const safeName = sanitizePublicText(employeeName || '', 120) || 'colaborador';
    const end = minutesToHHMM(block.end_min || 0);
    return `Oi, ${safeName}! Seu horario terminou as ${end}. Se a saida ainda nao foi registrada, envie "saida" agora.`;
}

function getAttendanceExitPreReminderMessage(employeeName, block) {
    const safeName = sanitizePublicText(employeeName || '', 120) || 'colaborador';
    const end = minutesToHHMM(block.end_min || 0);
    return `Oi, ${safeName}! Seu horario termina as ${end}. Se quiser fechar manualmente, envie "saida" ate esse horario. Depois disso, o sistema encerra automaticamente.`;
}

async function sendAttendanceActionPrompt(targetJid, text, action) {
    const sender = createAttendanceActionPromptSender({
        getSock: () => sock,
        getGenerateWAMessageFromContent: () => generateWAMessageFromContent,
        logger: console
    });
    return sender(targetJid, text, action);
}

let attendanceReminderTimer = null;
let attendanceReminderRunning = false;

async function runAttendanceReminderTick(nowMs = Date.now()) {
    if (!ATTENDANCE_REMINDER_ENABLED && !ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED && !ATTENDANCE_EXIT_PRE_REMINDER_ENABLED && !ATTENDANCE_EXIT_REMINDER_ENABLED && !ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED) return;
    if (attendanceReminderRunning) return;
    attendanceReminderRunning = true;
    try {
        const now = Number(nowMs || Date.now());
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayStartMs = dayStart.getTime();
        const dayEndMs = dayStartMs + 86399999;
        const weekday = dayStart.getDay();
        const dateKey = dateKeyFromTs(dayStartMs);

        const employees = db.prepare(`
            SELECT id, name, whatsapp_jid, whatsapp_phone, whatsapp_confirmed, active
            FROM attendance_employees
            WHERE active=1
        `).all();
        if (!employees.length) return;

        const schedules = db.prepare(`
            SELECT employee_id, id, weekday, start_time, end_time, class_name, schedule_type, activity_id, activity_label, value_per_class, tolerance_min, active
            FROM attendance_schedules
            WHERE active=1 AND weekday=?
            ORDER BY employee_id ASC, start_time ASC
        `).all(weekday);
        if (!schedules.length) return;

        const byEmployee = new Map();
        for (const s of schedules) {
            const key = Number(s.employee_id);
            if (!byEmployee.has(key)) byEmployee.set(key, []);
            byEmployee.get(key).push(s);
        }

        const botPhone = getBotPhoneDigits();
        for (const emp of employees) {
            const empId = Number(emp.id);
            if (isEmployeeOnVacation(empId, dateKey)) continue;
            const daySchedules = byEmployee.get(empId) || [];
            if (!daySchedules.length) continue;

            let targetJid = '';
            if (emp.whatsapp_confirmed) {
                targetJid = String(emp.whatsapp_jid || '').trim() || toWhatsappJid(emp.whatsapp_phone || '');
                if (targetJid && isPhoneJid(targetJid)) {
                    const targetPhone = extractPhoneDigitsFromJid(targetJid);
                    if (botPhone && targetPhone === botPhone) targetJid = '';
                } else {
                    targetJid = '';
                }
            }
            const canSendMessages = !!(sock?.user && targetJid);
            if (!canSendMessages && !ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED) continue;

            const blocks = buildAttendanceDayBlocks(daySchedules, dayStartMs, ATTENDANCE_CONSECUTIVE_GAP_MIN);
            const blockEvents = (ATTENDANCE_EXIT_PRE_REMINDER_ENABLED || ATTENDANCE_EXIT_REMINDER_ENABLED || ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED)
                ? getAttendanceBlockEventsForDate(empId, dateKey, blocks)
                : [];
            if (ATTENDANCE_REMINDER_ENABLED && canSendMessages) {
                for (const block of blocks) {
                    const blockStartAt = dayStartMs + (Number(block.start_min || 0) * 60000);
                    const triggerAt = blockStartAt - (ATTENDANCE_REMINDER_BEFORE_MIN * 60000);
                    const triggerWindowEnd = triggerAt + (90 * 1000);
                    if (now < triggerAt || now > triggerWindowEnd) continue;

                    const noteKey = attendanceReminderNoteKey(dateKey, empId, Number(block.start_min || 0));
                    if (hasAttendanceReminderBeenSent(empId, dateKey, Number(block.start_min || 0))) continue;

                    const text = getAttendanceReminderMessage(emp.name || 'Colaborador', block);
                    try {
                        await sendAttendanceActionPrompt(targetJid, text, 'entry');
                        createAttendanceEvent(empId, 'reminder', 'system', now, text, noteKey);
                        console.log(`[attendance] reminder sent employee=${empId} date=${dateKey} start=${minutesToHHMM(block.start_min || 0)}`);
                        broadcast({
                            type: 'attendance_reminder_sent',
                            employeeId: empId,
                            employeeName: emp.name || '',
                            date: dateKey,
                            start: minutesToHHMM(block.start_min || 0),
                            beforeMin: ATTENDANCE_REMINDER_BEFORE_MIN
                        });
                    } catch (err) {
                        console.error('[attendance] reminder send error:', err?.message || err);
                    }
                }
            }

            if (ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED && blocks.length && canSendMessages) {
                const alreadySentAbsenceFollowup = hasAttendanceAbsenceFollowupBeenSent(empId, dateKey);
                const hasJustification = !!getAttendanceJustificationForDate(empId, dateKey);
                if (!alreadySentAbsenceFollowup && !hasJustification) {
                    const firstBlock = blocks[0];
                    const firstBlockStartAt = dayStartMs + (Number(firstBlock.start_min || 0) * 60000);
                    const followupAt = firstBlockStartAt + ((Math.max(0, Number(firstBlock.tolerance_min || 0)) + ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN) * 60000);
                    if (now >= followupAt && now <= dayEndMs) {
                        const hasEntry = db.prepare('SELECT id FROM attendance_events WHERE employee_id=? AND event_type=? AND event_at BETWEEN ? AND ? LIMIT 1')
                            .get(empId, 'entry', dayStartMs, dayEndMs);
                        if (!hasEntry) {
                            const noteKey = attendanceAbsenceFollowupNoteKey(dateKey, empId);
                            const text = getAttendanceAbsenceFollowupMessage(emp.name || 'Colaborador', dateKey);
                            try {
                                await sock.sendMessage(targetJid, { text });
                                createAttendanceEvent(empId, 'absence_followup', 'system', now, text, noteKey);
                                console.log(`[attendance] absence followup sent employee=${empId} date=${dateKey}`);
                                broadcast({
                                    type: 'attendance_absence_followup_sent',
                                    employeeId: empId,
                                    employeeName: emp.name || '',
                                    date: dateKey
                                });
                            } catch (err) {
                                console.error('[attendance] absence followup send error:', err?.message || err);
                            }
                        }
                    }
                }
            }

            if (ATTENDANCE_EXIT_PRE_REMINDER_ENABLED && blockEvents.length && canSendMessages) {
                for (const block of blockEvents) {
                    const blockStartMin = Number(block.start_min || 0);
                    const blockEndAt = dayStartMs + (Number(block.end_min || 0) * 60000);
                    const triggerAt = blockEndAt - (ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN * 60000);
                    if (now < triggerAt || now > blockEndAt) continue;
                    if (!block.entryEvent || block.exitEvent) continue;
                    if (hasAttendanceExitPreReminderBeenSent(empId, dateKey, blockStartMin)) continue;

                    const noteKey = attendanceExitPreReminderNoteKey(dateKey, empId, blockStartMin);
                    const text = getAttendanceExitPreReminderMessage(emp.name || 'Colaborador', block);
                    try {
                        await sendAttendanceActionPrompt(targetJid, text, 'exit');
                        createAttendanceEvent(empId, 'exit_pre_reminder', 'system', now, text, noteKey);
                        console.log(`[attendance] exit pre-reminder sent employee=${empId} date=${dateKey} start=${minutesToHHMM(block.start_min || 0)} end=${minutesToHHMM(block.end_min || 0)}`);
                        broadcast({
                            type: 'attendance_exit_pre_reminder_sent',
                            employeeId: empId,
                            employeeName: emp.name || '',
                            date: dateKey,
                            start: minutesToHHMM(block.start_min || 0),
                            end: minutesToHHMM(block.end_min || 0),
                            beforeMin: ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN
                        });
                    } catch (err) {
                        console.error('[attendance] exit pre-reminder send error:', err?.message || err);
                    }
                }
            }

            if (ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED && blockEvents.length) {
                for (const block of blockEvents) {
                    const blockStartMin = Number(block.start_min || 0);
                    const blockEndAt = dayStartMs + (Number(block.end_min || 0) * 60000);
                    if (now < blockEndAt) continue;
                    if (!block.entryEvent || block.exitEvent) continue;
                    if (hasAttendanceAutoExitBeenSent(empId, dateKey, blockStartMin)) continue;
                    const noteKey = attendanceAutoExitNoteKey(dateKey, empId, blockStartMin);
                    try {
                        createAttendanceEvent(empId, 'exit', 'system', blockEndAt, '', noteKey);
                        if (canSendMessages) {
                            try {
                                const text = buildAttendanceAutoExitAck(emp, block);
                                await sock.sendMessage(targetJid, { text });
                            } catch (messageErr) {
                                console.error('[attendance] auto-exit notify error:', messageErr?.message || messageErr);
                            }
                        }
                        console.log(`[attendance] auto-exit created employee=${empId} date=${dateKey} start=${minutesToHHMM(block.start_min || 0)} end=${minutesToHHMM(block.end_min || 0)}`);
                        broadcast({
                            type: 'attendance_auto_exit_created',
                            employeeId: empId,
                            employeeName: emp.name || '',
                            date: dateKey,
                            start: minutesToHHMM(block.start_min || 0),
                            end: minutesToHHMM(block.end_min || 0)
                        });
                    } catch (err) {
                        console.error('[attendance] auto-exit error:', err?.message || err);
                    }
                }
            }

            if (!ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED && ATTENDANCE_EXIT_REMINDER_ENABLED && blockEvents.length && canSendMessages) {
                for (const block of blockEvents) {
                    const blockStartMin = Number(block.start_min || 0);
                    const blockEndAt = dayStartMs + (Number(block.end_min || 0) * 60000);
                    const triggerAt = blockEndAt + (ATTENDANCE_EXIT_REMINDER_AFTER_MIN * 60000);
                    if (now < triggerAt || now > dayEndMs) continue;
                    if (!block.entryEvent || block.exitEvent) continue;
                    if (hasAttendanceExitReminderBeenSent(empId, dateKey, blockStartMin)) continue;

                    const noteKey = attendanceExitReminderNoteKey(dateKey, empId, blockStartMin);
                    const text = getAttendanceExitReminderMessage(emp.name || 'Colaborador', block);
                    try {
                        await sendAttendanceActionPrompt(targetJid, text, 'exit');
                        createAttendanceEvent(empId, 'exit_reminder', 'system', now, text, noteKey);
                        console.log(`[attendance] exit reminder sent employee=${empId} date=${dateKey} start=${minutesToHHMM(block.start_min || 0)} end=${minutesToHHMM(block.end_min || 0)}`);
                        broadcast({
                            type: 'attendance_exit_reminder_sent',
                            employeeId: empId,
                            employeeName: emp.name || '',
                            date: dateKey,
                            start: minutesToHHMM(block.start_min || 0),
                            end: minutesToHHMM(block.end_min || 0),
                            afterMin: ATTENDANCE_EXIT_REMINDER_AFTER_MIN
                        });
                    } catch (err) {
                        console.error('[attendance] exit reminder send error:', err?.message || err);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[attendance] reminder tick error:', err?.message || err);
    } finally {
        attendanceReminderRunning = false;
    }
}

function startAttendanceReminderLoop() {
    if (!ATTENDANCE_REMINDER_ENABLED && !ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED && !ATTENDANCE_EXIT_PRE_REMINDER_ENABLED && !ATTENDANCE_EXIT_REMINDER_ENABLED && !ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED) return;
    if (attendanceReminderTimer) return;
    attendanceReminderTimer = setInterval(() => {
        runAttendanceReminderTick().catch(() => {});
    }, 30000);
    runAttendanceReminderTick().catch(() => {});
    console.log(`[attendance] reminder loop ativo (${ATTENDANCE_REMINDER_BEFORE_MIN} min antes, followup +${ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN} min, pre-saida -${ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN} min, saida +${ATTENDANCE_EXIT_REMINDER_AFTER_MIN} min, auto-exit=${ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED ? 'on' : 'off'})`);
}

let chatMediaCleanupTimer = null;
function cleanupOldChatMediaFiles(now = Date.now()) {
    try {
        if (!fs.existsSync(CHAT_MEDIA_DIR)) return { removed: 0, total: 0 };
        const cutoff = Number(now) - (CHAT_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const files = fs.readdirSync(CHAT_MEDIA_DIR);
        let removed = 0;
        for (const file of files) {
            const full = path.join(CHAT_MEDIA_DIR, file);
            let st = null;
            try { st = fs.statSync(full); } catch (e) { continue; }
            if (!st?.isFile?.()) continue;
            if (Number(st.mtimeMs || 0) < cutoff) {
                try {
                    fs.unlinkSync(full);
                    removed += 1;
                } catch (e) {}
            }
        }
        return { removed, total: files.length };
    } catch (e) {
        return { removed: 0, total: 0, error: e?.message || 'cleanup_failed' };
    }
}

function startChatMediaCleanupLoop() {
    if (chatMediaCleanupTimer) return;
    const run = () => {
        const result = cleanupOldChatMediaFiles();
        if (result?.removed) {
            console.log(`[chat-media] cleanup removed=${result.removed} retention_days=${CHAT_IMAGE_RETENTION_DAYS}`);
        }
    };
    run();
    chatMediaCleanupTimer = setInterval(run, 6 * 60 * 60 * 1000);
}

async function handleAttendanceIncomingMessage(senderJid, senderRawJid, text, eventAtMs, locationPayload = null) {
    if (!ATTENDANCE_ENABLED) return { matched: false, consumed: false };
    const employee = findAttendanceEmployeeByIncomingJid(senderJid, senderRawJid);
    if (!employee) return { matched: false, consumed: false, reason: 'employee_not_found' };

    const safeText = String(text || '').trim();
    const eventAt = Number(eventAtMs || Date.now());
    const hasLocation = !!(locationPayload && Number.isFinite(Number(locationPayload.latitude)) && Number.isFinite(Number(locationPayload.longitude)));
    const policy = getAttendanceGeoPolicy();
    const pendingGeo = getPendingGeoRequestForSender(senderJid, senderRawJid, employee.id);
    let punchContext = null;

    if (!employee.whatsapp_confirmed) markEmployeeWhatsappConfirmed(employee.id);

    if (safeText) {
        createAttendanceEvent(employee.id, 'message', 'whatsapp', eventAt, safeText, '');
    }

    if (hasLocation && pendingGeo) {
        const pendingContext = resolvePendingGeoPunchContext(employee.id, pendingGeo, eventAt);
        if (!pendingContext.ok) {
            resolvePendingGeoRequest(pendingGeo.id, 'expired');
            if (sock) {
                await sock.sendMessage(senderJid, { text: getAttendancePunchErrorMessage(pendingContext.error, pendingContext) });
            }
            return {
                matched: true,
                consumed: true,
                command: 'entry',
                employeeId: employee.id,
                reason: pendingContext.error || 'geo_window_expired',
                panelText: 'entrada bloqueada: janela expirada'
            };
        }
        if (!Number.isFinite(policy.academy_lat) || !Number.isFinite(policy.academy_lng)) {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceInvalidGeoPolicyMessage() });
            }
            return { matched: true, consumed: true, employeeId: employee.id, reason: 'invalid_geo_policy', panelText: 'erro de configuracao de localizacao' };
        }
        const distanceM = haversineMeters(
            Number(locationPayload.latitude),
            Number(locationPayload.longitude),
            Number(policy.academy_lat),
            Number(policy.academy_lng)
        );
        const inside = Number.isFinite(distanceM) && distanceM <= Number(policy.radius_m || ATTENDANCE_GEO_DEFAULTS.radius_m);
        if (inside) {
            if (hasRecentAttendanceEvent(employee.id, 'entry', 90 * 1000)) {
                if (sock) {
                    await sock.sendMessage(senderJid, { text: buildAttendanceDuplicatePunchMessage('entry') });
                }
                resolvePendingGeoRequest(pendingGeo.id, 'resolved');
                return {
                    matched: true,
                    consumed: true,
                    command: 'entry',
                    deduped: true,
                    employeeId: employee.id,
                    reason: 'deduped_after_geo',
                    geoStatus: 'inside',
                    geoDistanceM: Number(distanceM.toFixed(1)),
                    panelText: 'entrada duplicada (localizacao confirmada)'
                };
            }

            createAttendanceEvent(employee.id, 'entry', 'whatsapp', eventAt, safeText || '[localizacao]', '', {
                status: 'inside',
                lat: Number(locationPayload.latitude),
                lng: Number(locationPayload.longitude),
                accuracy_m: Number(locationPayload.accuracy_m || 0) || null,
                distance_m: Number(distanceM.toFixed(1)),
                note: ''
            });
            resolvePendingGeoRequest(pendingGeo.id, 'resolved');
            try {
                broadcast({
                    type: 'attendance_event',
                    employeeId: employee.id,
                    employeeName: employee.name,
                    eventType: 'entry',
                    at: eventAt,
                    geoStatus: 'inside',
                    geoDistanceM: Number(distanceM.toFixed(1))
                }, true);
            } catch (e) {}
            if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceEntryAck(employee, eventAt, pendingContext?.block || null) });
            return {
                matched: true,
                consumed: true,
                command: 'entry',
                employeeId: employee.id,
                reason: 'geo_inside',
                geoStatus: 'inside',
                geoDistanceM: Number(distanceM.toFixed(1)),
                panelText: 'entrada confirmada por localizacao'
            };
        }

        if (sock) {
            await sock.sendMessage(senderJid, {
                text: buildAttendanceGeoOutsideMessage(employee, distanceM)
            });
        }
        createAttendanceEvent(employee.id, 'geo_outside', 'whatsapp', eventAt, safeText || '[localizacao fora da area]', '', {
            status: 'outside',
            lat: Number(locationPayload.latitude),
            lng: Number(locationPayload.longitude),
            accuracy_m: Number(locationPayload.accuracy_m || 0) || null,
            distance_m: Number(distanceM.toFixed(1)),
            note: 'outside_radius'
        });
        return {
            matched: true,
            consumed: true,
            command: 'entry',
            employeeId: employee.id,
            reason: 'geo_outside',
            geoStatus: 'outside',
            geoDistanceM: Number(distanceM.toFixed(1)),
            panelText: 'localizacao fora da area'
        };
    }

    const cmd = detectAttendanceCommand(safeText);

    if (!cmd) {
        const parsedJust = parseAttendanceAbsenceJustification(safeText);
        if (parsedJust.matched) {
            const targetDate = parsedJust.dateKey || dateKeyFromTs(eventAt);
            const reason = sanitizePublicText(parsedJust.reason || '', 280);
            if (!parseDateKeyInput(targetDate)) {
                if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceInvalidJustificationDateMessage() });
                return { matched: true, consumed: true, employeeId: employee.id, reason: 'invalid_justification_date', panelText: 'justificativa com data invalida' };
            }
            if (!reason || reason.length < 5) {
                if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceInvalidJustificationReasonMessage() });
                return { matched: true, consumed: true, employeeId: employee.id, reason: 'invalid_justification_reason', panelText: 'justificativa sem motivo valido' };
            }
            if (isEmployeeOnVacation(employee.id, targetDate)) {
                if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceVacationJustificationMessage(targetDate) });
                return { matched: true, consumed: true, employeeId: employee.id, reason: 'on_vacation', panelText: `justificativa ignorada (ferias ${formatDateKeyBR(targetDate)})` };
            }
            const saved = upsertAttendanceAbsenceJustification({
                employeeId: employee.id,
                dateKey: targetDate,
                reason,
                source: 'whatsapp',
                status: 'approved_auto'
            });
            if (!saved) {
                if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceJustificationSaveFailedMessage() });
                return { matched: true, consumed: true, employeeId: employee.id, reason: 'justification_save_failed', panelText: 'falha ao salvar justificativa' };
            }
            if (sock) await sock.sendMessage(senderJid, { text: buildAttendanceJustificationSavedMessage(employee, targetDate) });
            try {
                broadcast({
                    type: 'attendance_absence_justified',
                    employeeId: employee.id,
                    employeeName: employee.name,
                    date: targetDate,
                    reason,
                    status: saved.status || 'approved_auto',
                    source: saved.source || 'whatsapp',
                    at: Date.now()
                }, true);
            } catch (e) {}
            return {
                matched: true,
                consumed: true,
                employeeId: employee.id,
                reason: 'absence_justified',
                panelText: `falta justificada (${formatDateKeyBR(targetDate)})`
            };
        }
    }

    if (!cmd && pendingGeo && safeText && isJustificationText(safeText)) {
        const pendingContext = resolvePendingGeoPunchContext(employee.id, pendingGeo, eventAt);
        if (!pendingContext.ok) {
            resolvePendingGeoRequest(pendingGeo.id, 'expired');
            if (sock) {
                await sock.sendMessage(senderJid, { text: getAttendancePunchErrorMessage(pendingContext.error, pendingContext) });
            }
            return {
                matched: true,
                consumed: true,
                command: 'entry',
                employeeId: employee.id,
                reason: pendingContext.error || 'geo_window_expired',
                panelText: 'entrada bloqueada: janela expirada'
            };
        }
        if (policy.fallback_mode !== 'justify_and_alert') {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceGeoFallbackBlockedMessage() });
            }
            return { matched: true, consumed: true, command: 'entry', employeeId: employee.id, reason: 'fallback_blocked', panelText: 'entrada bloqueada sem localizacao' };
        }
        if (hasRecentAttendanceEvent(employee.id, 'entry', 90 * 1000)) {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceDuplicatePunchMessage('entry') });
            }
            resolvePendingGeoRequest(pendingGeo.id, 'resolved');
            return {
                matched: true,
                consumed: true,
                command: 'entry',
                deduped: true,
                employeeId: employee.id,
                reason: 'deduped_justified',
                geoStatus: 'justified',
                panelText: 'entrada duplicada (justificativa)'
            };
        }
        createAttendanceEvent(employee.id, 'entry', 'whatsapp', eventAt, safeText, '', {
            status: 'justified',
            note: safeText
        });
        resolvePendingGeoRequest(pendingGeo.id, 'resolved');
        const reply = `${buildAttendanceEntryAck(employee, eventAt, pendingContext?.block || null)} Registrado com justificativa.`;
        if (sock) await sock.sendMessage(senderJid, { text: reply });
        const alertPayload = {
            type: 'attendance_geo_fallback_alert',
            employeeId: employee.id,
            employeeName: employee.name,
            reason: safeText,
            at: eventAt
        };
        try {
            broadcast({
                type: 'attendance_event',
                employeeId: employee.id,
                employeeName: employee.name,
                eventType: 'entry',
                at: eventAt,
                geoStatus: 'justified'
            }, true);
            broadcast(alertPayload, true);
        } catch (e) {}
        return {
            matched: true,
            consumed: true,
            command: 'entry',
            employeeId: employee.id,
            reason: 'geo_justified',
            geoStatus: 'justified',
            panelText: 'entrada com justificativa'
        };
    }

    if (!cmd) {
        if (hasLocation) {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceGeoWithoutPendingMessage(employee) });
            }
            return { matched: true, consumed: true, employeeId: employee.id, reason: 'geo_without_pending', panelText: 'localizacao sem solicitacao de ponto' };
        }
        return { matched: true, consumed: false, employeeId: employee.id, reason: 'no_command' };
    }

    punchContext = resolveAttendancePunchContext(employee.id, eventAt, cmd);
    if (!punchContext.ok) {
        if (sock) {
            await sock.sendMessage(senderJid, { text: getAttendancePunchErrorMessage(punchContext.error, punchContext) });
        }
        return {
            matched: true,
            consumed: true,
            command: cmd,
            employeeId: employee.id,
            reason: punchContext.error,
            panelText: `ponto bloqueado (${punchContext.error})`
        };
    }

    if (cmd === 'entry' && policy.enabled && policy.require_entry_location) {
        if (hasRecentAttendanceEvent(employee.id, cmd, 90 * 1000)) {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceDuplicatePunchMessage('entry') });
            }
            return { matched: true, consumed: true, command: cmd, deduped: true, employeeId: employee.id, reason: 'deduped' };
        }
        if (!Number.isFinite(policy.academy_lat) || !Number.isFinite(policy.academy_lng)) {
            if (sock) {
                await sock.sendMessage(senderJid, { text: buildAttendanceInvalidGeoPolicyMessage() });
            }
            return { matched: true, consumed: true, command: cmd, employeeId: employee.id, reason: 'invalid_geo_policy', panelText: 'entrada bloqueada: configuracao de localizacao invalida' };
        }
        const activePending = openPendingGeoRequest(employee.id, senderJid, 'entry', policy.request_ttl_sec, punchContext);
        if (sock) {
            await sock.sendMessage(senderJid, {
                text: buildAttendanceGeoRequestMessage(employee, policy.request_ttl_sec, punchContext?.block || null)
            });
        }
        return {
            matched: true,
            consumed: true,
            command: cmd,
            employeeId: employee.id,
            reason: 'awaiting_geo',
            panelText: 'aguardando localizacao',
            pendingGeoId: activePending?.id || null
        };
    }

    if (hasRecentAttendanceEvent(employee.id, cmd, 90 * 1000)) {
        if (sock) {
            await sock.sendMessage(senderJid, {
                text: buildAttendanceDuplicatePunchMessage(cmd)
            });
        }
        return { matched: true, consumed: true, command: cmd, deduped: true, employeeId: employee.id, reason: 'deduped' };
    }

    createAttendanceEvent(employee.id, cmd, 'whatsapp', eventAt, safeText, '');
    try {
        broadcast({
            type: 'attendance_event',
            employeeId: employee.id,
            employeeName: employee.name,
            eventType: cmd,
            at: eventAt
        }, true);
    } catch (e) {}

    if (sock) {
        if (cmd === 'entry') {
            await sock.sendMessage(senderJid, { text: buildAttendanceEntryAck(employee, eventAt, punchContext?.block || null) });
        } else {
            await sock.sendMessage(senderJid, { text: buildAttendanceExitAck(employee, eventAt, punchContext?.block || null) });
        }
    }
    return { matched: true, consumed: true, command: cmd, employeeId: employee.id, reason: 'ok' };
}

const AI_REPLY_LEAK_PATTERNS = [
    /hime and the ai have begun to exchange messages/i,
    /this is the first turn of the conversation/i,
    /\b(?:gmt|utc)\s*[+-]\s*\d+/i,
    /^\s*#\s*instru/i
];

function stripUnsafeReplyGlyphs(text) {
    return String(text || '')
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\uFE0F\u2640\u2642]/g, '')
        .replace(/<@\s*/g, ' ');
}

function sanitizeAssistantReply(input) {
    let text = String(input || '');
    text = fixMojibakeText(text);
    text = stripUnsafeReplyGlyphs(text);
    text = stripInvisibleGarbage(text).trim();
    if (!text) return '';

    text = text.replace(/^\*{0,2}\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\(gmt[+-]\d+\)\*{0,2}\s*/i, '').trim();

    const hasLeak = AI_REPLY_LEAK_PATTERNS.some((rx) => rx.test(text));
    if (hasLeak) {
        const firstHuman = text.search(/\b(ol(?:a|\u00E1)|oi|bom dia|boa tarde|boa noite|bem-vindo)/i);
        if (firstHuman > 0) text = text.slice(firstHuman).trim();
    }

    if (AI_REPLY_LEAK_PATTERNS.some((rx) => rx.test(text))) return '';
    if (text.length > 900) text = text.slice(0, 900).trim();
    return text;
}

function getPublicRadioComments(limit = 40) {
    let safeLimit = Number(limit);
    if (!Number.isFinite(safeLimit)) safeLimit = 40;
    safeLimit = Math.max(1, Math.min(200, Math.floor(safeLimit)));
    return db.prepare('SELECT id, user, comment, created_at FROM radio_comments ORDER BY id DESC LIMIT ?').all(safeLimit);
}

function addPublicRadioComment(user, comment) {
    const now = Date.now();
    const row = db.prepare('INSERT INTO radio_comments (user, comment, created_at) VALUES (?, ?, ?)').run(user, comment, now);
    return { id: Number(row.lastInsertRowid), user, comment, created_at: now };
}

const RADIO_SYNC_CACHE_TO_PLAYLIST = process.env.RADIO_SYNC_CACHE_TO_PLAYLIST === '1';

async function sincronizarArquivosCache() {
    try {
        const files = await readdir(CACHE_DIR);
        for (const file of files) {
            if (!file.endsWith('.mp3')) continue;
            const videoId = file.replace('.mp3', '');
            const exists = db.prepare('SELECT id FROM playlist WHERE videoId=?').get(videoId);
            if (!exists) { db.prepare('INSERT INTO playlist (videoId, title, duration, duration_sec, added_at, status) VALUES (?, ?, ?, ?, ?, ?)').run(videoId, `Musica Recuperada (${videoId})`, '03:00', 180, Date.now(), 'ready'); }
            else { const track = db.prepare('SELECT status FROM playlist WHERE videoId=?').get(videoId); if(track.status !== 'ready') db.prepare("UPDATE playlist SET status='ready' WHERE videoId=?").run(videoId); }
        }
    } catch (e) { console.error("Erro ao sincronizar cache:", e); }
}
if (RADIO_SYNC_CACHE_TO_PLAYLIST) {
    sincronizarArquivosCache();
}

function listCacheMp3() {
    if (!fs.existsSync(CACHE_DIR)) return [];
    return fs.readdirSync(CACHE_DIR).filter(f => f.toLowerCase().endsWith('.mp3')).map(f => path.join(CACHE_DIR, f));
}

function getTrashSessionDir() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(RADIO_TRASH_DIR, `playlist_clear_${stamp}`);
    ensureDir(dir);
    return dir;
}

function movePlaylistCacheToTrash() {
    ensureDir(RADIO_TRASH_DIR);
    const dir = getTrashSessionDir();
    const files = listCacheMp3();
    const moved = [];
    for (const f of files) {
        const base = path.basename(f);
        let dest = path.join(dir, base);
        if (fs.existsSync(dest)) dest = path.join(dir, `${Date.now()}_${base}`);
        fs.renameSync(f, dest);
        moved.push({ from: toRel(f), to: toRel(dest) });
    }
    const manifest = {
        movedAt: Date.now(),
        from: toRel(CACHE_DIR),
        count: moved.length,
        files: moved
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
}

function deletePlaylistCache() {
    const files = listCacheMp3();
    let count = 0;
    for (const f of files) {
        try { fs.unlinkSync(f); count += 1; } catch(e) {}
    }
    return count;
}

function findLatestTrashSession() {
    if (!fs.existsSync(RADIO_TRASH_DIR)) return null;
    const dirs = fs.readdirSync(RADIO_TRASH_DIR).filter(d => d.startsWith('playlist_clear_')).sort();
    if (!dirs.length) return null;
    return path.join(RADIO_TRASH_DIR, dirs[dirs.length - 1]);
}

function restoreLastPlaylistTrash() {
    const dir = findLatestTrashSession();
    if (!dir) return { restored: 0, error: 'no_trash' };
    const manifestPath = path.join(dir, 'manifest.json');
    let files = [];
    if (fs.existsSync(manifestPath)) {
        try {
            const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            files = (m.files || []).map(f => path.resolve(ROOT_DIR, f.to.replace(/\//g, path.sep)));
        } catch(e) {}
    }
    if (!files.length) {
        files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3')).map(f => path.join(dir, f));
    }
    let restored = 0;
    for (const f of files) {
        if (!fs.existsSync(f)) continue;
        const dest = path.join(CACHE_DIR, path.basename(f));
        try {
            fs.renameSync(f, dest);
            restored += 1;
        } catch(e) {}
    }
    if (restored > 0) {
        try { sincronizarArquivosCache(); } catch(e) {}
    }
    return { restored };
}

// ESTADO E FUNCOES DE BANCO
let conversationState = {};
const rows = db.prepare('SELECT * FROM conversations').all();
rows.forEach(row => {
    let history = [];
    let tags = [];
    try { history = JSON.parse(row.history || '[]'); } catch (e) { history = []; }
    try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
    conversationState[row.id] = {
        history: history.map((h) => typeof h === 'string' ? fixMojibakeText(h) : h),
        tags: tags.map((t) => typeof t === 'string' ? fixMojibakeText(t) : t),
        notes: fixMojibakeText(row.notes || ''),
        name: fixMojibakeText(row.name || row.id),
        lastActivityTimestamp: row.last_activity,
        pausedByHuman: !!row.paused_by_human,
        pendingHumanHandoff: null,
        status: row.status || 'active',
        routeJid: row.route_jid || row.id,
        slaPendingSince: Number(row.sla_pending_since || 0),
        slaStatus: String(row.sla_status || 'ok'),
        slaUpdatedAt: Number(row.sla_updated_at || 0),
        messageBuffer: [],
        typingTimer: null
    };
});

const saveStmt = db.prepare('INSERT OR REPLACE INTO conversations (id, name, history, tags, notes, last_activity, paused_by_human, status, route_jid, sla_pending_since, sla_status, sla_updated_at) VALUES (@id, @name, @history, @tags, @notes, @last_activity, @paused_by_human, @status, @route_jid, @sla_pending_since, @sla_status, @sla_updated_at)');
function saveChat(id) {
    const u = conversationState[id]; if (!u) return;
    try {
        saveStmt.run({
            id: id,
            name: u.name,
            history: JSON.stringify(u.history),
            tags: JSON.stringify(u.tags),
            notes: u.notes,
            last_activity: u.lastActivityTimestamp,
            paused_by_human: u.pausedByHuman ? 1 : 0,
            status: u.status,
            route_jid: u.routeJid || id,
            sla_pending_since: Number(u.slaPendingSince || 0),
            sla_status: String(u.slaStatus || 'ok'),
            sla_updated_at: Number(u.slaUpdatedAt || Date.now())
        });
    } catch (e) {}
}

const CHAT_SLA_STATUS = Object.freeze({
    OK: 'ok',
    DELAYED: 'atrasando',
    CRITICAL: 'critico'
});

function normalizeChatSlaStatus(raw) {
    const value = String(raw || '').toLowerCase().trim();
    if (value === CHAT_SLA_STATUS.CRITICAL) return CHAT_SLA_STATUS.CRITICAL;
    if (value === CHAT_SLA_STATUS.DELAYED) return CHAT_SLA_STATUS.DELAYED;
    return CHAT_SLA_STATUS.OK;
}

function getChatSlaThresholds() {
    const config = getOpsAlertsConfig();
    const thresholds = config?.thresholds || {};
    const delayMin = Math.max(1, Number(thresholds.chatSlaDelayMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.chatSlaDelayMin));
    const criticalMinRaw = Math.max(2, Number(thresholds.chatSlaCriticalMin || OPS_ALERTS_DEFAULT_CONFIG.thresholds.chatSlaCriticalMin));
    const criticalMin = Math.max(delayMin + 1, criticalMinRaw);
    return {
        delayMin,
        criticalMin
    };
}

function computeChatSlaStatus(pendingSince, now = Date.now()) {
    const since = Number(pendingSince || 0);
    if (!Number.isFinite(since) || since <= 0) return CHAT_SLA_STATUS.OK;
    const elapsedSec = Math.max(0, Math.floor((Number(now) - since) / 1000));
    const elapsedMin = elapsedSec / 60;
    const { delayMin, criticalMin } = getChatSlaThresholds();
    if (elapsedMin >= criticalMin) return CHAT_SLA_STATUS.CRITICAL;
    if (elapsedMin >= delayMin) return CHAT_SLA_STATUS.DELAYED;
    return CHAT_SLA_STATUS.OK;
}

function getChatSlaSeverityRank(status) {
    if (status === CHAT_SLA_STATUS.CRITICAL) return 2;
    if (status === CHAT_SLA_STATUS.DELAYED) return 1;
    return 0;
}

function normalizeHistorySender(sender) {
    return String(sender || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function parseHistoryEntry(rawEntry) {
    const raw = String(rawEntry || '');
    let content = raw;
    let timestamp = 0;
    const tsMatch = content.match(/^\[ts=(\d{10,16})\]\s*/i);
    if (tsMatch) {
        const parsedTs = Number(tsMatch[1]);
        if (Number.isFinite(parsedTs) && parsedTs > 0) timestamp = Math.floor(parsedTs);
        content = content.slice(tsMatch[0].length);
    }
    const splitIndex = content.indexOf(':');
    if (splitIndex < 0) {
        return {
            sender: '',
            body: content.trim(),
            timestamp
        };
    }
    return {
        sender: content.slice(0, splitIndex).trim(),
        body: content.slice(splitIndex + 1).trim(),
        timestamp
    };
}

function findLastHistoryMessageByRole(history, role) {
    const list = Array.isArray(history) ? history : [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
        const parsed = parseHistoryEntry(list[i]);
        const sender = normalizeHistorySender(parsed.sender);
        const isUser = sender === 'usuario' || sender === 'cliente';
        const isAi = sender === 'hime';
        if ((role === 'user' && isUser) || (role === 'ai' && isAi)) {
            return {
                text: parsed.body || '',
                timestamp: Number(parsed.timestamp || 0)
            };
        }
    }
    return { text: '', timestamp: 0 };
}

function buildChatSlaPayload(contactId, user, now = Date.now()) {
    const pendingSince = Number(user?.slaPendingSince || 0);
    const status = normalizeChatSlaStatus(user?.slaStatus || computeChatSlaStatus(pendingSince, now));
    const elapsedSec = pendingSince > 0 ? Math.max(0, Math.floor((now - pendingSince) / 1000)) : 0;
    return {
        from: contactId,
        status,
        pendingSince,
        elapsedSec,
        updatedAt: now
    };
}

function evaluateConversationSlaStatus(contactId, { emit = true, reason = 'refresh', force = false } = {}) {
    const user = conversationState[contactId];
    if (!user) return null;
    const now = Date.now();
    const nextStatus = normalizeChatSlaStatus(computeChatSlaStatus(user.slaPendingSince, now));
    const prevStatus = normalizeChatSlaStatus(user.slaStatus);
    const statusChanged = nextStatus !== prevStatus;
    if (statusChanged || force) {
        user.slaStatus = nextStatus;
        user.slaUpdatedAt = now;
        saveChat(contactId);
        if (emit) {
            broadcast({
                type: 'chat_sla_update',
                reason,
                ...buildChatSlaPayload(contactId, user, now)
            });
        }
    }
    return buildChatSlaPayload(contactId, user, now);
}

function markConversationInboundForSla(contactId, timestamp = Date.now()) {
    const user = conversationState[contactId];
    if (!user) return null;
    const ts = Number(timestamp);
    const safeTs = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : Date.now();
    if (!Number.isFinite(Number(user.slaPendingSince || 0)) || Number(user.slaPendingSince || 0) <= 0) {
        user.slaPendingSince = safeTs;
    }
    return evaluateConversationSlaStatus(contactId, { emit: true, reason: 'inbound' });
}

function acknowledgeConversationAttention(contactId, { actor = 'system', reason = 'ack' } = {}) {
    const user = conversationState[contactId];
    if (!user) return null;
    const hadPending = Number(user.slaPendingSince || 0) > 0 || normalizeChatSlaStatus(user.slaStatus) !== CHAT_SLA_STATUS.OK;
    user.slaPendingSince = 0;
    user.slaStatus = CHAT_SLA_STATUS.OK;
    user.slaUpdatedAt = Date.now();
    saveChat(contactId);
    if (hadPending) {
        broadcast({
            type: 'chat_sla_update',
            reason,
            actor: String(actor || ''),
            ...buildChatSlaPayload(contactId, user)
        });
    }
    return buildChatSlaPayload(contactId, user);
}

function reevaluateAllConversationsSla({ emit = true, reason = 'timer' } = {}) {
    const ids = Object.keys(conversationState || {});
    ids.forEach((id) => {
        evaluateConversationSlaStatus(id, { emit, reason });
    });
}

function buildAiContextPreviewForConversation(contactId) {
    const convo = conversationState[contactId];
    if (!convo) return null;
    const snapshot = getAIContextSnapshot();
    const scaContext = buildScaContextSnippetForSender(contactId, convo.routeJid || contactId);
    const warnings = [];
    const baseLen = Number(snapshot?.contexto_length || 0);
    const noticesLen = Number(snapshot?.avisos_length || 0);
    if (baseLen <= 0) warnings.push('Base de conhecimento vazia.');
    if (SCA_SYNC_ENABLED && !scaContext) warnings.push('Sem match SCA por telefone para este contato.');
    const confidence = warnings.length >= 2 ? 'low' : warnings.length === 1 ? 'medium' : 'high';
    return {
        conversation: {
            id: contactId,
            name: convo.name || contactId,
            routeJid: convo.routeJid || contactId
        },
        generatedAt: Date.now(),
        context: {
            baseContextLength: baseLen,
            noticesLength: noticesLen,
            baseContextUpdatedAt: Number(snapshot?.contexto_mtime_ms || 0),
            noticesUpdatedAt: Number(snapshot?.avisos_mtime_ms || 0),
            scaMatch: !!scaContext,
            scaSnippet: scaContext || ''
        },
        confidence,
        warnings
    };
}

function registerAiFeedbackForConversation({ contactId, actor = '', feedbackType = 'inadequada', reason = '' } = {}) {
    const convo = conversationState[contactId];
    if (!convo) return null;
    const now = Date.now();
    const userMsg = findLastHistoryMessageByRole(convo.history, 'user');
    const aiMsg = findLastHistoryMessageByRole(convo.history, 'ai');
    const preview = buildAiContextPreviewForConversation(contactId);
    const cleanType = sanitizePublicText(feedbackType, 30) || 'inadequada';
    const cleanReason = sanitizePublicText(reason, 240);
    const row = db.prepare(`
        INSERT INTO ai_feedback_events (
            conversation_id,
            actor,
            feedback_type,
            reason,
            last_user_message,
            last_ai_message,
            context_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        String(contactId || ''),
        sanitizePublicText(actor || '', 80),
        cleanType,
        cleanReason,
        sanitizePublicText(userMsg.text || '', 1500),
        sanitizePublicText(aiMsg.text || '', 1500),
        safeJsonStringify(preview || {}, '{}'),
        now
    );
    return {
        id: Number(row?.lastInsertRowid || 0),
        conversation_id: String(contactId || ''),
        actor: sanitizePublicText(actor || '', 80),
        feedback_type: cleanType,
        reason: cleanReason,
        created_at: now
    };
}

function listAiFeedbackEvents({ limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
    const rows = db.prepare(`
        SELECT id, conversation_id, actor, feedback_type, reason, last_user_message, last_ai_message, context_json, created_at
        FROM ai_feedback_events
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    `).all(safeLimit);
    return rows.map((row) => {
        let context = {};
        try { context = JSON.parse(row.context_json || '{}'); } catch (_) { context = {}; }
        return {
            id: Number(row.id || 0),
            conversation_id: String(row.conversation_id || ''),
            actor: String(row.actor || ''),
            feedback_type: String(row.feedback_type || 'inadequada'),
            reason: String(row.reason || ''),
            last_user_message: String(row.last_user_message || ''),
            last_ai_message: String(row.last_ai_message || ''),
            context,
            created_at: Number(row.created_at || 0)
        };
    });
}

function appendHistoryEntry(history, sender, text, timestamp = Date.now()) {
    if (!Array.isArray(history)) return;
    const senderLabel = String(sender || 'Sistema').replace(/\s+/g, ' ').trim() || 'Sistema';
    const content = String(text ?? '');
    const ts = Number(timestamp);
    const safeTs = Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : Date.now();
    history.push(`[ts=${safeTs}] ${senderLabel}: ${content}`);
}

function isPhoneJid(jid) {
    return typeof jid === 'string' && /^\d{10,13}(?::\d+)?@(s\.whatsapp\.net|c\.us)$/.test(jid);
}
function normalizeName(n) {
    return (n || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}
function getSendTarget(contactId) {
    const c = conversationState[contactId];
    return c?.routeJid || contactId;
}
const contactAliasCache = {};
try {
    const aliasRows = db.prepare('SELECT jid, canonical_jid FROM contact_alias').all();
    aliasRows.forEach(r => { if (r.jid && r.canonical_jid) contactAliasCache[r.jid] = r.canonical_jid; });
} catch(e) {}
function setContactAlias(jid, canonicalJid, source = 'runtime') {
    if (!jid || !canonicalJid || jid === canonicalJid) return;
    if (!isPhoneJid(canonicalJid)) return;
    contactAliasCache[jid] = canonicalJid;
    try {
        db.prepare('INSERT INTO contact_alias (jid, canonical_jid, updated_at, source) VALUES (?, ?, ?, ?) ON CONFLICT(jid) DO UPDATE SET canonical_jid=excluded.canonical_jid, updated_at=excluded.updated_at, source=excluded.source')
          .run(jid, canonicalJid, Date.now(), source);
    } catch(e) {}
}
function findPhoneJidByName(pushName) {
    const target = normalizeName(pushName);
    if (!target) return null;
    const matches = Object.entries(conversationState)
        .filter(([id, c]) => isPhoneJid(id) && normalizeName(c?.name) === target)
        .map(([id]) => id);
    return matches.length === 1 ? matches[0] : null;
}
function resolveByLidFile(senderJid) {
    try {
        const m = /^(\d+)@lid$/.exec(String(senderJid || '').trim());
        if (!m) return null;
        const lid = m[1];
        const reverseFile = path.join(AUTH_SESSION_DIR, `lid-mapping-${lid}_reverse.json`);
        if (!fs.existsSync(reverseFile)) return null;
        const raw = fs.readFileSync(reverseFile, 'utf-8');
        const phone = String(JSON.parse(raw) || '').replace(/\D/g, '');
        if (phone.length < 10) return null;
        return `${phone}@s.whatsapp.net`;
    } catch (_) {
        return null;
    }
}
function resolveCanonicalContactId(senderJid, pushName) {
    const raw = String(senderJid || '');
    const m = /^(\d{10,13})(?::\d+)?@(s\.whatsapp\.net|c\.us)$/.exec(raw);
    if (m) return `${m[1]}@s.whatsapp.net`;
    if (isPhoneJid(senderJid)) return senderJid;
    const mapped = contactAliasCache[senderJid];
    if (mapped && isPhoneJid(mapped)) return mapped;
    const byLidFile = resolveByLidFile(senderJid);
    if (byLidFile && isPhoneJid(byLidFile)) {
        setContactAlias(senderJid, byLidFile, 'lid_file');
        return byLidFile;
    }
    const byName = findPhoneJidByName(pushName);
    if (byName) {
        setContactAlias(senderJid, byName, 'name_match');
        return byName;
    }
    return senderJid;
}
function mergeConversation(targetId, sourceId) {
    if (targetId === sourceId) return;
    const source = conversationState[sourceId];
    if (!source) return;
    const target = conversationState[targetId];
    if (!target) {
        conversationState[targetId] = { ...source, routeJid: source.routeJid || sourceId };
        saveChat(targetId);
        try { db.prepare('DELETE FROM conversations WHERE id=?').run(sourceId); } catch(e) {}
        delete conversationState[sourceId];
        return;
    }
    const mergedHistory = Array.isArray(target.history) && Array.isArray(source.history)
        ? [...target.history, ...source.history]
        : (target.history || source.history || []);
    target.history = mergedHistory.slice(-2000);
    target.tags = Array.from(new Set([...(target.tags || []), ...(source.tags || [])]));
    if (!target.notes && source.notes) target.notes = source.notes;
    target.lastActivityTimestamp = Math.max(Number(target.lastActivityTimestamp || 0), Number(source.lastActivityTimestamp || 0));
    target.pausedByHuman = !!(target.pausedByHuman || source.pausedByHuman);
    target.status = (target.status === 'active' || source.status === 'active') ? 'active' : 'archived';
    target.routeJid = target.routeJid || source.routeJid || sourceId;
    const targetPending = Number(target.slaPendingSince || 0);
    const sourcePending = Number(source.slaPendingSince || 0);
    if (targetPending > 0 && sourcePending > 0) {
        target.slaPendingSince = Math.min(targetPending, sourcePending);
    } else {
        target.slaPendingSince = Math.max(targetPending, sourcePending, 0);
    }
    target.slaStatus = normalizeChatSlaStatus(
        getChatSlaSeverityRank(normalizeChatSlaStatus(target.slaStatus)) >= getChatSlaSeverityRank(normalizeChatSlaStatus(source.slaStatus))
            ? target.slaStatus
            : source.slaStatus
    );
    target.slaUpdatedAt = Math.max(Number(target.slaUpdatedAt || 0), Number(source.slaUpdatedAt || 0), Date.now());
    saveChat(targetId);
    try { db.prepare('DELETE FROM conversations WHERE id=?').run(sourceId); } catch(e) {}
    delete conversationState[sourceId];
}
function migrateConversationsToCanonicalIds() {
    const ids = Object.keys(conversationState);
    ids.forEach((id) => {
        if (isPhoneJid(id)) return;
        const c = conversationState[id];
        const canonical = resolveCanonicalContactId(id, c?.name);
        if (canonical && canonical !== id && isPhoneJid(canonical)) {
            mergeConversation(canonical, id);
        }
    });
}
migrateConversationsToCanonicalIds();
reevaluateAllConversationsSla({ emit: false, reason: 'bootstrap' });

// --- RADIO ENGINE ---
let radioState = { isPlaying: false, currentTrack: null, musicVolume: 50, adVolume: 80, adFrequency: 15, isShuffle: false, startTime: 0, serverDuration: 0, pausedPositionMs: 0, lastAdTime: 0 };
let radioTimer = null;
let radioRetryTimer = null;
let lastPlaybackErrorAt = 0;
let playNextInProgress = false;
let playNextQueued = false;
const radioAudioHealthCache = new Map();
const radioTransientPlaybackErrors = new Map();
const RADIO_TRANSIENT_PLAYBACK_REASONS = new Set([
    'music_stalled_watchdog',
    'resume_after_ad_failed',
    'buffering_timeout'
]);
if (fs.existsSync(RADIO_CACHE_FILE)) { try { Object.assign(radioState, JSON.parse(fs.readFileSync(RADIO_CACHE_FILE, 'utf-8'))); } catch(e){} }
const normalizedCachedTrack = normalizeIncomingRadioTrack(radioState.currentTrack);
if (radioState.currentTrack && !normalizedCachedTrack) {
    radioState.currentTrack = null;
    radioState.startTime = 0;
    radioState.serverDuration = 0;
    radioState.pausedPositionMs = 0;
    radioState.isPlaying = false;
} else if (normalizedCachedTrack) {
    radioState.currentTrack = normalizedCachedTrack;
}
if (!Number.isFinite(Number(radioState.pausedPositionMs))) radioState.pausedPositionMs = 0;
const persistedLastAdTime = getRadioSetting('lastAdTime', null);
if (Number.isFinite(persistedLastAdTime) && persistedLastAdTime > 0) {
    radioState.lastAdTime = persistedLastAdTime;
}
function clampRadioPositionMs(value) {
    const duration = Number(radioState.serverDuration || 0);
    const raw = Number(value || 0);
    if (!Number.isFinite(raw)) return 0;
    if (duration > 0) return Math.min(duration, Math.max(0, raw));
    return Math.max(0, raw);
}
function getRadioElapsedMs(now = Date.now()) {
    if (!radioState.currentTrack) return 0;
    if (radioState.isPlaying && radioState.startTime) return clampRadioPositionMs(now - radioState.startTime);
    return clampRadioPositionMs(radioState.pausedPositionMs || 0);
}
function resetRadioPlaybackClock(startTime = Date.now()) {
    radioState.startTime = startTime;
    radioState.pausedPositionMs = 0;
}
function pauseRadioPlayback() {
    radioState.pausedPositionMs = getRadioElapsedMs();
    radioState.isPlaying = false;
    if (radioTimer) clearTimeout(radioTimer);
    radioTimer = null;
}
function resumeRadioPlayback() {
    const elapsed = clampRadioPositionMs(radioState.pausedPositionMs || 0);
    radioState.startTime = Date.now() - elapsed;
    radioState.pausedPositionMs = elapsed;
    radioState.isPlaying = true;
    startRadioTimer(Math.max(1000, Number(radioState.serverDuration || 0) - elapsed));
}
function saveRadioSettings() { try { fs.writeFileSync(RADIO_CACHE_FILE, JSON.stringify(radioState)); } catch(e){} }
function startRadioTimer(durationMs) { if (radioTimer) clearTimeout(radioTimer); if (!durationMs || durationMs < 1000) durationMs = 180000; radioTimer = setTimeout(() => { if (radioState.isPlaying) playNextTrack(); }, durationMs); }
function scheduleRadioRetry() {
    if (radioRetryTimer) clearTimeout(radioRetryTimer);
    radioRetryTimer = setTimeout(() => { if (radioState.isPlaying) playNextTrack(); }, 5000);
}
function getCachePath(videoId) { return path.join(CACHE_DIR, `${videoId}.mp3`); }
function removeTrackByVideoId(videoId, reason = 'remove') {
    if (!videoId) return { removed: false };
    radioAudioHealthCache.delete(videoId);
    const row = db.prepare('SELECT * FROM playlist WHERE videoId=?').get(videoId);
    if (!row) return { removed: false };
    try { db.prepare('DELETE FROM playlist WHERE videoId=?').run(videoId); } catch(e) {}
    try {
        const p = getCachePath(videoId);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch(e) {}
    if (radioState.currentTrack && radioState.currentTrack.videoId === videoId) {
        radioState.currentTrack = null;
        radioState.startTime = 0;
        radioState.serverDuration = 0;
        radioState.pausedPositionMs = 0;
        saveRadioSettings();
        if (radioState.isPlaying) playNextTrack();
    }
    try { broadcast({ type: 'playlist_updated' }, true); } catch(e) {}
    return { removed: true, title: row.title || '', reason };
}
function isCacheFileOk(videoId) {
    try {
        const p = getCachePath(videoId);
        if (!fs.existsSync(p)) return false;
        if (fs.statSync(p).size < 1000) return false;
        return true;
    } catch(e) { return false; }
}
function getCacheFileMeta(videoId) {
    try {
        const p = getCachePath(videoId);
        if (!fs.existsSync(p)) return { ok: false, reason: 'missing' };
        const st = fs.statSync(p);
        if (!st || st.size < 1000) return { ok: false, reason: 'missing' };
        return { ok: true, path: p, size: st.size, mtimeMs: st.mtimeMs || 0 };
    } catch(e) { return { ok: false, reason: 'missing' }; }
}
function parseDbValue(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s === '-inf') return -1000;
    if (s === 'inf' || s === '+inf') return 1000;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
function probeLoudness(filePath, durationSec = 0) {
    return new Promise((resolve) => {
        const sampleSec = Math.max(5, Math.min(RADIO_SILENCE_SAMPLE_SEC, Number(durationSec) > 0 ? Math.ceil(Number(durationSec)) : RADIO_SILENCE_SAMPLE_SEC));
        const args = [
            '-hide_banner',
            '-nostats',
            '-v',
            'info',
            '-i',
            filePath,
            '-t',
            String(sampleSec),
            '-map',
            'a:0',
            '-af',
            'volumedetect',
            '-f',
            'null',
            '-'
        ];
        execFile(FFMPEG_LOCAL_PATH, args, {
            windowsHide: true,
            timeout: RADIO_SILENCE_PROBE_TIMEOUT_MS,
            maxBuffer: 1024 * 1024 * 8
        }, (err, stdout, stderr) => {
            const out = `${stdout || ''}\n${stderr || ''}`;
            const meanMatch = out.match(/mean_volume:\s*([^\s]+)\s*dB/i);
            const maxMatch = out.match(/max_volume:\s*([^\s]+)\s*dB/i);
            const meanDb = parseDbValue(meanMatch ? meanMatch[1] : null);
            const maxDb = parseDbValue(maxMatch ? maxMatch[1] : null);
            if (meanDb == null && maxDb == null) {
                return resolve({ ok: true, checked: false, reason: err ? 'probe_failed' : 'no_loudness_data' });
            }
            const silentByMean = meanDb != null && meanDb <= RADIO_SILENCE_MEAN_DB;
            const silentByMax = maxDb != null && maxDb <= RADIO_SILENCE_MAX_DB;
            const isSilent = silentByMean && (maxDb == null || silentByMax);
            return resolve({
                ok: !isSilent,
                checked: true,
                reason: isSilent ? 'silent_audio' : 'ok',
                meanDb,
                maxDb
            });
        });
    });
}
async function validateTrackAudio(track) {
    if (!track || !track.videoId) return { ok: false, reason: 'invalid_track' };
    const meta = getCacheFileMeta(track.videoId);
    if (!meta.ok) return { ok: false, reason: meta.reason || 'missing' };
    const cached = radioAudioHealthCache.get(track.videoId);
    const now = Date.now();
    if (cached
        && cached.size === meta.size
        && cached.mtimeMs === meta.mtimeMs
        && (now - cached.checkedAt) <= RADIO_SILENCE_CACHE_TTL_MS) {
        return { ok: cached.ok, reason: cached.reason, meanDb: cached.meanDb, maxDb: cached.maxDb, fromCache: true };
    }
    const probe = await probeLoudness(meta.path, track.duration_sec || 0);
    const result = (!probe.checked && probe.ok)
        ? { ok: true, reason: probe.reason || 'unchecked', meanDb: null, maxDb: null }
        : { ok: !!probe.ok, reason: probe.reason || (probe.ok ? 'ok' : 'invalid_audio'), meanDb: probe.meanDb ?? null, maxDb: probe.maxDb ?? null };
    radioAudioHealthCache.set(track.videoId, {
        ok: result.ok,
        reason: result.reason,
        meanDb: result.meanDb,
        maxDb: result.maxDb,
        size: meta.size,
        mtimeMs: meta.mtimeMs,
        checkedAt: now
    });
    return result;
}
function resolveTrackPlaybackGain(validation) {
    if (!RADIO_NORMALIZE_ENABLED) {
        return { gain: 1, gainDb: 0, mode: 'disabled' };
    }
    if (!validation || !validation.ok) {
        return { gain: 1, gainDb: 0, mode: 'invalid' };
    }
    const meanDb = Number.isFinite(validation.meanDb) ? Number(validation.meanDb) : null;
    const maxDb = Number.isFinite(validation.maxDb) ? Number(validation.maxDb) : null;
    if (meanDb == null && maxDb == null) {
        return { gain: 1, gainDb: 0, mode: 'no_data' };
    }

    let gainDb = meanDb == null ? 0 : (RADIO_NORMALIZE_TARGET_MEAN_DB - meanDb);
    if (maxDb != null) {
        const headroomLimit = RADIO_NORMALIZE_HEADROOM_DB - maxDb;
        gainDb = Math.min(gainDb, headroomLimit);
    }
    gainDb = Math.min(RADIO_NORMALIZE_MAX_BOOST_DB, Math.max(-RADIO_NORMALIZE_MAX_CUT_DB, gainDb));
    if (!Number.isFinite(gainDb) || Math.abs(gainDb) < 0.15) {
        gainDb = 0;
    }

    let gain = Math.pow(10, gainDb / 20);
    if (!Number.isFinite(gain) || gain <= 0) gain = 1;
    gain = Math.min(2.5, Math.max(0.25, gain));
    return {
        gain,
        gainDb,
        mode: gainDb === 0 ? 'neutral' : 'applied'
    };
}
function markTrackError(track, reason = 'error') {
    if (!track || !track.videoId) return;
    radioAudioHealthCache.delete(track.videoId);
    let nextCount = 1;
    try {
        const row = db.prepare('SELECT error_count FROM playlist WHERE videoId=?').get(track.videoId);
        nextCount = (row?.error_count || 0) + 1;
        db.prepare('UPDATE playlist SET status=?, error_reason=?, last_error_at=?, error_count=? WHERE videoId=?')
          .run('error', reason, Date.now(), nextCount, track.videoId);
    } catch(e) {}
    if (nextCount >= MAX_TRACK_ERROR_RETRIES) {
        removeTrackByVideoId(track.videoId, 'max_errors');
        try { broadcast({ type: 'radio_track_removed', videoId: track.videoId, title: track.title || '', reason: 'max_errors' }, true); } catch(e) {}
    } else {
        try { broadcast({ type: 'radio_track_error', videoId: track.videoId, title: track.title || '', reason }, true); } catch(e) {}
    }
}
function markTrackPending(track, reason = 'missing') {
    if (!track || !track.videoId) return;
    radioAudioHealthCache.delete(track.videoId);
    try { db.prepare('UPDATE playlist SET status=?, error_reason=NULL, last_error_at=NULL, error_count=0 WHERE videoId=?').run('pending', track.videoId); } catch(e) {}
    processDownloadQueue();
    try { broadcast({ type: 'radio_track_error', videoId: track.videoId, title: track.title || '', reason }, true); } catch(e) {}
}
function pickNextTrack(list) {
    if (!list.length) return null;
    if (radioState.isShuffle) return list[Math.floor(Math.random() * list.length)];
    const currentId = radioState.currentTrack ? radioState.currentTrack.id : 0;
    return list.find(t => t.id > currentId) || list[0];
}
async function playNextTrack() {
    if (playNextInProgress) {
        playNextQueued = true;
        return;
    }
    playNextInProgress = true;
    try {
        if (radioRetryTimer) clearTimeout(radioRetryTimer);
        const allReady = db.prepare("SELECT * FROM playlist WHERE status='ready'").all();
        if (allReady.length === 0) {
            const pendingCount = db.prepare("SELECT COUNT(*) as c FROM playlist WHERE status='pending'").get()?.c || 0;
            const hasPending = pendingCount > 0;
            radioState.currentTrack = null;
            radioState.startTime = 0;
            radioState.serverDuration = 0;
            radioState.pausedPositionMs = 0;
            if (!hasPending) {
                radioState.isPlaying = false;
            }
            saveRadioSettings();
            broadcast({ type: 'radio_sync_update', state: radioState }, true);
            if (hasPending) {
                processDownloadQueue();
                if (radioState.isPlaying) scheduleRadioRetry();
            }
            return;
        }
        const playable = [];
        allReady.forEach(t => {
            if (isCacheFileOk(t.videoId)) playable.push(t);
            else markTrackPending(t, 'missing');
        });
        if (playable.length === 0) {
            radioState.currentTrack = null;
            radioState.startTime = 0;
            radioState.serverDuration = 0;
            radioState.pausedPositionMs = 0;
            saveRadioSettings();
            broadcast({ type: 'radio_sync_update', state: radioState }, true);
            if (radioState.isPlaying) scheduleRadioRetry();
            return;
        }
        const candidates = [...playable];
        while (candidates.length > 0) {
            const next = pickNextTrack(candidates);
            if (!next) break;
            const idx = candidates.findIndex(t => t.id === next.id);
            if (idx >= 0) candidates.splice(idx, 1);
            const validation = await validateTrackAudio(next);
            if (!validation.ok) {
                const reason = validation.reason || 'invalid_audio';
                if (reason === 'missing') markTrackPending(next, reason);
                else markTrackError(next, reason);
                console.warn(`[radio] track skipped ${next.videoId}: ${reason}`);
                continue;
            }
            let durationSec = Math.max(0, Number(next.duration_sec || 0));
            const shouldProbeDuration = (!Number.isFinite(durationSec) || durationSec <= 0 || isRecoveredDurationPlaceholder(next));
            if (shouldProbeDuration) {
                const probedDuration = await probeAudioDurationSec(getCachePath(next.videoId));
                if (Number.isFinite(probedDuration) && probedDuration > 0) {
                    durationSec = probedDuration;
                    try {
                        db.prepare('UPDATE playlist SET duration_sec=?, duration=? WHERE id=?')
                          .run(durationSec, formatDurationMMSS(durationSec), next.id);
                        next.duration_sec = durationSec;
                        next.duration = formatDurationMMSS(durationSec);
                    } catch (_) {}
                }
            }
            if (!Number.isFinite(durationSec) || durationSec <= 0) durationSec = 180;
            const playbackGain = resolveTrackPlaybackGain(validation);
            radioState.currentTrack = {
                ...next,
                playbackGain: playbackGain.gain,
                playbackGainDb: playbackGain.gainDb,
                playbackGainMode: playbackGain.mode
            };
            radioTransientPlaybackErrors.delete(String(next.videoId));
            resetRadioPlaybackClock(Date.now());
            radioState.serverDuration = durationSec * 1000;
            radioState.isPlaying = true;
            saveRadioSettings();
            broadcast({ type: 'radio_sync_update', state: radioState }, true);
            startRadioTimer(radioState.serverDuration);
            return;
        }
        radioState.currentTrack = null;
        radioState.startTime = 0;
        radioState.serverDuration = 0;
        radioState.pausedPositionMs = 0;
        saveRadioSettings();
        broadcast({ type: 'radio_sync_update', state: radioState }, true);
        playNextQueued = true;
    } catch (e) {
        console.error('[radio] playNextTrack error', e.message);
        if (radioState.isPlaying) scheduleRadioRetry();
    } finally {
        playNextInProgress = false;
        if (playNextQueued) {
            playNextQueued = false;
            setTimeout(() => { if (radioState.isPlaying) playNextTrack(); }, 100);
        }
    }
}
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(YTDLP_PATH)) return reject(new Error("yt-dlp.exe não encontrado"));
        const auth = resolveYtDlpAuthArgs();
        logYtDlpAuthModeOnce(auth);
        const finalArgs = [...auth.args, ...args];
        finalArgs.push('--ffmpeg-location', FFMPEG_LOCAL_PATH);
        execFile(YTDLP_PATH, finalArgs, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
            if (err) reject(enrichYtDlpError(err, stderr, auth));
            else resolve(stdout);
        });
    });
}

let ytDlpAuthModeLogged = false;
let ytDlpAuthConfigWarned = false;

function normalizeYtDlpCookiesMode(raw) {
    const mode = String(raw || 'off').trim().toLowerCase();
    if (mode === 'browser' || mode === 'file' || mode === 'off') return mode;
    return 'off';
}

function normalizeYtDlpCookiesBrowser(raw) {
    const browser = String(raw || 'chrome').trim().toLowerCase();
    if (browser === 'chrome' || browser === 'edge' || browser === 'firefox') return browser;
    return 'chrome';
}

function resolveYtDlpAuthArgs() {
    const mode = normalizeYtDlpCookiesMode(process.env.YTDLP_COOKIES_MODE || 'off');
    if (mode === 'browser') {
        const browser = normalizeYtDlpCookiesBrowser(process.env.YTDLP_COOKIES_BROWSER || 'chrome');
        const profile = String(process.env.YTDLP_COOKIES_PROFILE || '').trim();
        const browserSpec = profile ? `${browser}:${profile}` : browser;
        return {
            mode: 'browser',
            browser,
            profile,
            args: ['--cookies-from-browser', browserSpec]
        };
    }
    if (mode === 'file') {
        const file = String(process.env.YTDLP_COOKIES_FILE || '').trim();
        if (file && fs.existsSync(file)) {
            return {
                mode: 'file',
                file,
                args: ['--cookies', file]
            };
        }
        if (!ytDlpAuthConfigWarned) {
            ytDlpAuthConfigWarned = true;
            console.warn('[radio] YTDLP_COOKIES_MODE=file, mas YTDLP_COOKIES_FILE nao foi encontrado. Seguindo sem cookies.');
        }
    }
    return { mode: 'off', args: [] };
}

function logYtDlpAuthModeOnce(auth) {
    if (ytDlpAuthModeLogged) return;
    ytDlpAuthModeLogged = true;
    if (auth?.mode === 'browser') {
        const profileLabel = auth.profile ? `:${auth.profile}` : '';
        console.log(`[radio] yt-dlp auth mode=browser (${auth.browser}${profileLabel})`);
        return;
    }
    if (auth?.mode === 'file') {
        console.log('[radio] yt-dlp auth mode=file');
        return;
    }
    console.log('[radio] yt-dlp auth mode=off');
}

function isYtDlpAuthRequiredMessage(message) {
    const msg = String(message || '').toLowerCase();
    return msg.includes("sign in to confirm you're not a bot")
        || msg.includes('use --cookies-from-browser')
        || msg.includes('private video')
        || msg.includes('members-only')
        || msg.includes('login required');
}

function enrichYtDlpError(err, stderr, auth) {
    const baseMessage = String(stderr || err?.message || 'yt-dlp error');
    if (!isYtDlpAuthRequiredMessage(baseMessage)) {
        if (err instanceof Error) {
            err.message = baseMessage;
            return err;
        }
        return new Error(baseMessage);
    }
    const hint = auth?.mode === 'off'
        ? 'youtube_auth_required: habilite YTDLP_COOKIES_MODE=browser e mantenha login ativo no Chrome.'
        : 'youtube_auth_required: cookies invalidos/expirados. Refaça login no Chrome da academia.';
    const wrapped = new Error(`${baseMessage}\n${hint}`);
    wrapped.code = 'YOUTUBE_AUTH_REQUIRED';
    return wrapped;
}

function getYtDlpJsRuntimeArgs() {
    const runtime = (process.env.YTDLP_JS_RUNTIMES || 'node').trim();
    return runtime ? ['--js-runtimes', runtime] : [];
}

function spawnYtDlpWithProgress(args, onProgress) {
    return new Promise((resolve, reject) => {
        const proc = spawn(YTDLP_PATH, args, { windowsHide: true });
        let stderr = '';
        proc.stdout.setEncoding('utf8');
        proc.stderr.setEncoding('utf8');
        proc.stdout.on('data', (chunk) => {
            const lines = chunk.split(/\r?\n/);
            for (const line of lines) {
                if (!line.startsWith('download:')) continue;
                const payload = line.replace('download:', '').trim();
                const parts = payload.split('|');
                const rawPercent = (parts[0] || '').replace('%', '').trim();
                const percent = Number(rawPercent);
                if (onProgress && Number.isFinite(percent)) {
                    onProgress({ percent, eta: parts[1] || '', speed: parts[2] || '' });
                }
            }
        });
        proc.stderr.on('data', (chunk) => { stderr += chunk; });
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve({ stderr });
            else reject(new Error(stderr || `yt-dlp exit ${code}`));
        });
    });
}

function shouldRetryYtDlpWithAndroid(message) {
    const msg = (message || '').toLowerCase();
    return msg.includes('http error 403')
        || msg.includes('sabr')
        || msg.includes('no supported javascript runtime')
        || msg.includes('po token');
}

function runYtDlpDownload(videoId, onProgress) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(YTDLP_PATH)) return reject(new Error("yt-dlp.exe não encontrado"));
        const auth = resolveYtDlpAuthArgs();
        logYtDlpAuthModeOnce(auth);
        const baseArgs = [
            ...auth.args,
            `https://www.youtube.com/watch?v=${videoId}`,
            '-x',
            '--audio-format',
            'mp3',
            '-o',
            path.join(CACHE_DIR, '%(id)s.%(ext)s'),
            '--no-check-certificates',
            '--prefer-free-formats',
            '--newline',
            '--progress-template',
            'download:%(progress._percent_str)s|%(progress.eta)s|%(progress.speed)s',
            '--ffmpeg-location',
            FFMPEG_LOCAL_PATH
        ];
        const jsRuntimeArgs = getYtDlpJsRuntimeArgs();
        const primaryExtractorArgs = (process.env.YTDLP_EXTRACTOR_ARGS || 'youtube:player_client=default').trim();
        const primaryArgs = [
            ...baseArgs,
            ...jsRuntimeArgs,
            '--extractor-args',
            primaryExtractorArgs
        ];

        spawnYtDlpWithProgress(primaryArgs, onProgress)
            .then(resolve)
            .catch(async (err) => {
                if (!shouldRetryYtDlpWithAndroid(err?.message)) return reject(enrichYtDlpError(err, err?.message, auth));
                try {
                    const fallbackExtractorArgs = (process.env.YTDLP_FALLBACK_EXTRACTOR_ARGS || 'youtube:player_client=android').trim();
                    const fallbackFormat = (process.env.YTDLP_FALLBACK_FORMAT || '18/best[height<=360]/best').trim();
                    console.warn(`[radio] yt-dlp retry ${videoId} with android fallback`);
                    const fallbackArgs = [
                        ...baseArgs,
                        ...jsRuntimeArgs,
                        '--extractor-args',
                        fallbackExtractorArgs,
                        '-f',
                        fallbackFormat
                    ];
                    const out = await spawnYtDlpWithProgress(fallbackArgs, onProgress);
                    return resolve(out);
                } catch (fallbackErr) {
                    return reject(enrichYtDlpError(fallbackErr, fallbackErr?.message, auth));
                }
            });
    });
}

async function checkCacheLimit() { try { const f=await readdir(CACHE_DIR); let t=0; const s=[]; for(const i of f){const p=path.join(CACHE_DIR,i);const st=await stat(p);t+=st.size;s.push({p,t:st.mtime.getTime(),z:st.size});} if(t>MAX_CACHE_SIZE_BYTES){s.sort((a,b)=>a.t-b.t);for(const i of s){if(t<=MAX_CACHE_SIZE_BYTES*0.9)break;await unlink(i.p);t-=i.z;}} } catch(e){} }
async function addToPlaylist(input) { try { let searchArg = input; if (!input.startsWith('http')) searchArg = `ytsearch1:${input}`; const stdout = await runYtDlp([searchArg, '--dump-single-json', '--flat-playlist', '--no-check-certificates', '--yes-playlist']); const info = JSON.parse(stdout); let dataToProcess = info; if (info.entries && searchArg.startsWith('ytsearch')) dataToProcess = info.entries[0]; const process = (e) => { if(e && e.id) addTrackToDB(e.id, e.title||'?', e.duration); }; if (info._type === 'playlist' && info.entries && !searchArg.startsWith('ytsearch')) { info.entries.forEach(process); processDownloadQueue(); return { success: true, type: 'playlist', count: info.entries.length }; } else { process(dataToProcess); processDownloadQueue(); return { success: true, type: 'single', title: dataToProcess.title }; } } catch (e) { return { success: false }; } }
function addTrackToDB(v,t,d) {
    if(!db.prepare('SELECT id FROM playlist WHERE videoId=?').get(v)) {
        let dr=d;
        if(typeof d==='number'){
            const m=Math.floor(d/60),s=Math.floor(d%60);
            dr=`${m}:${s.toString().padStart(2,'0')}`;
        }
        db.prepare('INSERT INTO playlist (videoId, title, duration, duration_sec, added_at, status, error_reason, last_error_at) VALUES (?,?,?,?,?,?,NULL,NULL)')
          .run(v,t,dr||'?:??', d||0, Date.now(),'pending');
    }
}
let isDownloading = false;
let currentDownload = null;
let lastProgressSentAt = 0;
async function processDownloadQueue() {
    if (isDownloading) return;
    const n = db.prepare("SELECT * FROM playlist WHERE status='pending' ORDER BY id ASC LIMIT 1").get();
    if (!n) return;
    isDownloading = true;
    currentDownload = n.videoId;
    const filePath = path.join(CACHE_DIR, `${n.videoId}.mp3`);
    try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
            broadcast({ type: 'radio_download_progress', videoId: n.videoId, percent: 0, status: 'start' }, true);
            await runYtDlpDownload(n.videoId, (info) => {
                const now = Date.now();
                if (now - lastProgressSentAt < 700 && info.percent < 100) return;
                lastProgressSentAt = now;
                broadcast({ type: 'radio_download_progress', videoId: n.videoId, percent: info.percent, eta: info.eta, speed: info.speed, status: 'downloading' }, true);
            });
            checkCacheLimit();
        }
        if (fs.existsSync(filePath)) {
            radioAudioHealthCache.delete(n.videoId);
            const realDurationSec = await probeAudioDurationSec(filePath);
            if (Number.isFinite(realDurationSec) && realDurationSec > 0) {
                db.prepare('UPDATE playlist SET duration_sec=?, duration=?, status=?, error_reason=NULL, last_error_at=NULL, error_count=0 WHERE id=?')
                  .run(realDurationSec, formatDurationMMSS(realDurationSec), 'ready', n.id);
            } else {
                db.prepare('UPDATE playlist SET status=?, error_reason=NULL, last_error_at=NULL, error_count=0 WHERE id=?')
                  .run('ready', n.id);
            }
            broadcast({ type: 'radio_download_progress', videoId: n.videoId, percent: 100, status: 'done' }, true);
            broadcast({ type: 'playlist_updated' }, true);
            broadcast({ type: 'radio_track_recovered', videoId: n.videoId, title: n.title || '' }, true);
            if (radioState.isPlaying && !radioState.currentTrack) {
                playNextTrack();
            }
        } else {
            throw new Error("0 bytes");
        }
    } catch (e) {
        console.error('[radio] download error', n.videoId, e.message);
        if (e?.code === 'YOUTUBE_AUTH_REQUIRED') {
            console.error('[radio] youtube auth required para download. Verifique login/cookies do Chrome da academia.');
        }
        broadcast({ type: 'radio_download_error', videoId: n.videoId, title: n.title || '', error: e.message }, true);
        const reason = e?.code === 'YOUTUBE_AUTH_REQUIRED' ? 'youtube_auth_required' : (e.message || 'download_error');
        markTrackError(n, reason);
    } finally {
        isDownloading = false;
        currentDownload = null;
        processDownloadQueue();
    }
}

async function convertAndSaveAudio(buffer) { const ts=Date.now(); const i=path.join(__dirname, `t_${ts}.ogg`); const o=path.join(__dirname, `t_${ts}.mp3`); await writeFile(i, buffer); return new Promise((r,j)=>{ ffmpeg(i).toFormat('mp3').on('end',async()=>{try{await unlink(i)}catch{} r(o)}).on('error',async()=>{try{await unlink(i)}catch{} j()}).save(o) }); }

// --- SERVIDOR ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const upload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, ADS_DIR), filename: (req, f, cb) => cb(null, f.originalname.replace(/[^a-zA-Z0-9.]/g, '_')) }) });
const chatImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CHAT_IMAGE_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const mime = normalizeChatImageMime(file?.mimetype || '');
        if (!CHAT_IMAGE_ALLOWED_MIME.has(mime)) {
            const err = new Error('invalid_file_type');
            err.code = 'INVALID_FILE_TYPE';
            return cb(err);
        }
        return cb(null, true);
    }
});
const chatStickerUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CHAT_STICKER_MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        const mime = normalizeChatStickerMime(file?.mimetype || '');
        if (CHAT_STICKER_ALLOWED_MIME.has(mime)) return cb(null, true);
        const ext = path.extname(String(file?.originalname || '')).toLowerCase();
        if (ext === '.webp') return cb(null, true);
        const err = new Error('invalid_sticker_type');
        err.code = 'INVALID_STICKER_TYPE';
        return cb(err);
    }
});
let lastQrRaw = '';
let lastQrAt = 0;
let lastPairingCode = '';
let lastPairingAt = 0;

if (AUDIT_RUNTIME) {
    app.use((req, res, next) => {
        if (req.url.startsWith('/media') || req.url.startsWith('/ads') || req.url.startsWith('/cache')) {
            auditLog(`asset ${req.method} ${req.url}`);
        }
        return next();
    });
}

app.use(express.json({limit:'50mb'}));
app.use('/updates', express.static(UPDATES_DIR));
registerSystemAdminRoutes({
    app,
    db,
    fs,
    requireAdmin,
    getLastQrRaw: () => lastQrRaw,
    getLastQrAt: () => lastQrAt,
    getLastPairingCode: () => lastPairingCode,
    getLastPairingAt: () => lastPairingAt,
    setLastPairingCode: (value) => { lastPairingCode = value; },
    setLastPairingAt: (value) => { lastPairingAt = value; },
    getSock: () => sock,
    getWhatsappConnected: () => whatsappConnected,
    getStartingSock: () => startingSock,
    getReconnectTimer: () => reconnectTimer,
    getReconnectAttempts: () => reconnectAttempts,
    getWhatsappLastError: () => whatsappLastError,
    getWhatsappLastErrorCode: () => whatsappLastErrorCode,
    getSystemConfig,
    resolveUpdatesManifestUrl,
    maskSystemConfig,
    isCommercialProfile: IS_COMMERCIAL_PROFILE,
    appProfile: APP_PROFILE,
    appVersion: APP_VERSION,
    pendingRestoreDbFile: PENDING_RESTORE_DB_FILE,
    dataRootDir: DATA_ROOT_DIR,
    dbFile: DB_FILE,
    backupDir: BACKUP_DIR,
    updatesDir: UPDATES_DIR,
    normalizeSystemConfigInput,
    setSystemConfig,
    logAdminAction,
    sanitizePublicText,
    hashPassword,
    isStrongPassword,
    getSystemUpdateState,
    checkForSystemUpdate,
    setSystemUpdateState,
    createDatabaseBackup,
    downloadFileOverHttp,
    restoreDatabaseBackup,
    ensureDir,
    getOperationalHealthSnapshot,
    getOpsAlertsConfig,
    normalizeOpsAlertsConfigInput,
    setOpsAlertsConfig
});

const APP_PANEL_BASE_URL = String(process.env.APP_PANEL_BASE_URL || '').trim();
registerPanelHostSetup({
    app,
    express,
    fs,
    rootDir: __dirname,
    updatesDir: UPDATES_DIR,
    appPanelBaseUrl: APP_PANEL_BASE_URL
});
function probeAudioDurationSec(filePath) {
    return new Promise((resolve) => {
        execFile(FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', filePath], {
            windowsHide: true,
            timeout: Math.max(2000, Math.floor(RADIO_SILENCE_PROBE_TIMEOUT_MS / 2)),
            maxBuffer: 1024 * 1024 * 2
        }, (err, stdout) => {
            if (err) return resolve(null);
            try {
                const parsed = JSON.parse(stdout || '{}');
                const raw = Number(parsed?.format?.duration || 0);
                if (!Number.isFinite(raw) || raw <= 0) return resolve(null);
                return resolve(Math.max(1, Math.round(raw)));
            } catch (_) {
                return resolve(null);
            }
        });
    });
}
function formatDurationMMSS(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
}

registerCoreSecurityRoutes({
    app,
    db,
    rootDir: ROOT_DIR,
    publicAssetsDir: PUBLIC_ASSETS_DIR,
    publicMediaFileMap: PUBLIC_MEDIA_FILE_MAP,
    conversationState,
    appVersion: APP_VERSION,
    appProfile: APP_PROFILE,
    requirePanelAuth,
    rateLimitLogin,
    verifyPassword,
    hashPassword,
    createSession,
    setSessionCookie,
    sessionTtlMs: SESSION_TTL_MS,
    getSessionFromReq,
    parseCookieHeader,
    sessionCookie: SESSION_COOKIE,
    hashToken,
    clearSessionCookie,
    resolvePublicMediaPath,
    sendSafeStaticFile
});

registerChatAdminRoutes({
    app,
    fs,
    chatMediaDir: CHAT_MEDIA_DIR,
    requirePanelAuth,
    requireAdmin,
    sendSafeStaticFile,
    isPathInside,
    sanitizePublicText,
    conversationState,
    getSock: () => sock,
    getSendTarget,
    clearPendingHumanHandoff,
    broadcastHumanHandoffStatus,
    appendHistoryEntry,
    saveChat,
    broadcast,
    scheduleBotResume,
    chatImageUpload,
    chatStickerUpload,
    saveChatImageBuffer,
    saveChatStickerBuffer,
    buildChatImagePublicUrl,
    buildChatImageHistoryMarker,
    buildChatStickerHistoryMarker,
    acknowledgeConversationAttention,
    getAiContextPreviewForConversation: buildAiContextPreviewForConversation,
    registerAiFeedbackForConversation,
    listAiFeedbackEvents
});

// --- ATTENDANCE (PONTO) ---
function getAttendanceCatalogRows({ type = '', activeOnly = false } = {}) {
    const where = [];
    const params = [];
    if (type) {
        where.push('type=?');
        params.push(normalizeAttendanceActivityType(type));
    }
    if (activeOnly) where.push('active=1');
    const sql = `
        SELECT id, type, name, default_value, active, sort_order, created_at, updated_at
        FROM attendance_activity_catalog
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY type ASC, sort_order ASC, name ASC
    `;
    return db.prepare(sql).all(...params);
}

registerAttendanceAdminRoutes({
    app,
    db,
    requirePanelAuth,
    requireAdmin,
    SCA_SYNC_ENABLED,
    SCA_SYNC_TOKEN,
    ATTENDANCE_ENABLED,
    getAttendanceGeoPolicy,
    getBotPhoneDigits,
    ATTENDANCE_REMINDER_ENABLED,
    ATTENDANCE_REMINDER_BEFORE_MIN,
    ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED,
    ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN,
    ATTENDANCE_EXIT_PRE_REMINDER_ENABLED,
    ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN,
    ATTENDANCE_EXIT_REMINDER_ENABLED,
    ATTENDANCE_EXIT_REMINDER_AFTER_MIN,
    ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN,
    ATTENDANCE_ENTRY_WINDOW_AFTER_MIN,
    ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN,
    ATTENDANCE_EXIT_MANUAL_GRACE_AFTER_END_MIN,
    ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED,
    ATTENDANCE_CONSECUTIVE_GAP_MIN,
    attendanceDebugLast,
    setAttendanceGeoPolicy,
    normalizeGeoFallbackMode,
    logAdminAction,
    cleanupExpiredAttendanceGeoPending,
    getAttendanceCatalogRows,
    normalizeAttendanceActivityType,
    sanitizePublicText,
    ensureAttendanceCatalogItem,
    getAttendanceClassTemplates,
    syncAttendanceClassTemplatesFromContext,
    broadcast,
    normalizePhoneDigits,
    extractPhoneDigitsFromJid,
    toWhatsappJid,
    resolveAttendanceEmployeeRoleCatalog,
    ATTENDANCE_DEFAULT_EMPLOYEE_ROLE,
    normalizeAttendanceTemplateIds,
    isAttendanceTeacherRole,
    validateAttendanceTemplateIdsActive,
    isKnownWhatsappForAttendance,
    applyAttendanceTemplatesToEmployee,
    ATTENDANCE_TEMPLATE_SOURCE_CONTEXT,
    ATTENDANCE_TEMPLATE_SOURCE_MANUAL,
    listEmployeeVacations,
    createVacation,
    deactivateVacation,
    parseDateKeyInput,
    dateKeyFromTs,
    upsertAttendanceAbsenceJustification,
    parseAttendanceActivityTypeStrict,
    parseHHMMToMinutes,
    resolveAttendancePunchContext,
    createAttendanceEvent,
    computeAttendanceReport,
    formatCurrencyBRL,
    WEEKDAY_LABELS,
    upsertScaAccessBatch,
    getScaSyncStatus
});

function parseTimeInputMs(v, fallback = null) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
    const s = (v || '').toString().trim();
    if (!s) return fallback;
    if (/^\d+$/.test(s)) return Number(s);
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : fallback;
}

function localDayBounds(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    const start = d.getTime();
    const end = start + 24 * 60 * 60 * 1000 - 1;
    return { start, end };
}

function parseHHMMMinuteSafe(value, fallback = 0) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) return fallback;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
    return (hh * 60) + mm;
}

function localMinuteOfDay(ms = Date.now()) {
    const d = new Date(ms);
    return (d.getHours() * 60) + d.getMinutes();
}

function localMinuteTimestamp(ms, minuteOfDay) {
    const safeMinute = Math.max(0, Math.min((23 * 60) + 59, Math.floor(Number(minuteOfDay) || 0)));
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    d.setMinutes(safeMinute, 0, 0);
    return d.getTime();
}

function nextDailyWindowStartAt(ms, startMinute) {
    const safeStart = Math.max(0, Math.min((23 * 60) + 59, Math.floor(Number(startMinute) || 0)));
    const nowMinute = localMinuteOfDay(ms);
    if (nowMinute < safeStart) return localMinuteTimestamp(ms, safeStart);
    const tomorrowStart = localMinuteTimestamp(ms, 0) + (24 * 60 * 60 * 1000);
    return tomorrowStart + (safeStart * 60 * 1000);
}

function normalizeCampaignMode(v) {
    const mode = (v || 'per_day').toString().trim().toLowerCase();
    return mode === 'hourly' ? 'hourly' : 'per_day';
}

function normalizeCampaignPayload(payload, opts = {}) {
    const partial = !!opts.partial;
    const now = Date.now();
    const out = {};

    if (!partial || payload.name !== undefined) {
        const name = (payload.name || '').toString().trim();
        if (!name || name.length < 2 || name.length > 90) return { error: 'invalid_name' };
        out.name = name;
    }

    if (!partial || payload.advertiser !== undefined) {
        out.advertiser = (payload.advertiser || '').toString().trim().slice(0, 90);
    }

    if (!partial || payload.file !== undefined) {
        const file = (payload.file || '').toString().trim();
        if (!file || !file.toLowerCase().endsWith('.mp3')) return { error: 'invalid_file' };
        const abs = path.join(ADS_DIR, file);
        if (!fs.existsSync(abs)) return { error: 'file_not_found' };
        out.file = file;
    }

    const mode = normalizeCampaignMode(payload.mode);
    if (!partial || payload.mode !== undefined) out.mode = mode;

    if (!partial || payload.runs_per_day !== undefined) {
        let runs = Number(payload.runs_per_day);
        if (!Number.isFinite(runs)) runs = 3;
        runs = Math.max(1, Math.min(48, Math.floor(runs)));
        out.runs_per_day = runs;
    }

    if (!partial || payload.interval_hours !== undefined) {
        let interval = Number(payload.interval_hours);
        if (!Number.isFinite(interval)) interval = 1;
        interval = Math.max(0.5, Math.min(24, interval));
        out.interval_hours = interval;
    }

    if (!partial || payload.priority !== undefined) {
        let pr = Number(payload.priority);
        if (!Number.isFinite(pr)) pr = 0;
        out.priority = Math.max(-10, Math.min(10, Math.floor(pr)));
    }

    if (!partial || payload.notes !== undefined) {
        out.notes = (payload.notes || '').toString().trim().slice(0, 500);
    }

    if (!partial || payload.is_active !== undefined) {
        out.is_active = payload.is_active ? 1 : 0;
    }

    const startAt = parseTimeInputMs(payload.start_at, partial ? undefined : now);
    const endAt = parseTimeInputMs(payload.end_at, partial ? undefined : now + 30 * 24 * 60 * 60 * 1000);
    if (!partial || payload.start_at !== undefined) {
        if (!Number.isFinite(startAt)) return { error: 'invalid_start_at' };
        out.start_at = startAt;
    }
    if (!partial || payload.end_at !== undefined) {
        if (!Number.isFinite(endAt)) return { error: 'invalid_end_at' };
        out.end_at = endAt;
    }
    if (out.start_at !== undefined && out.end_at !== undefined && out.end_at <= out.start_at) {
        return { error: 'invalid_period' };
    }

    return { value: out };
}

function getCampaignRuntime(campaign, now = Date.now()) {
    const active = !!campaign.is_active;
    const inWindow = now >= campaign.start_at && now <= campaign.end_at;
    const fileOk = fs.existsSync(path.join(ADS_DIR, campaign.file || ''));
    const commercialGuard = !!campaign._commercial_guard;
    const commercialLinked = !!campaign._commercial_linked;
    const allowedStartMinuteRaw = Number(campaign._allowed_start_minute);
    const allowedEndMinuteRaw = Number(campaign._allowed_end_minute);
    const hasDailyWindow = Number.isFinite(allowedStartMinuteRaw) && Number.isFinite(allowedEndMinuteRaw) && allowedEndMinuteRaw > allowedStartMinuteRaw;
    const allowedStartMinute = hasDailyWindow ? Math.max(0, Math.min((23 * 60) + 58, Math.floor(allowedStartMinuteRaw))) : 0;
    const allowedEndMinute = hasDailyWindow ? Math.max(allowedStartMinute + 1, Math.min((23 * 60) + 59, Math.floor(allowedEndMinuteRaw))) : ((23 * 60) + 59);
    const nowMinute = localMinuteOfDay(now);
    const inDailyWindow = nowMinute >= allowedStartMinute && nowMinute <= allowedEndMinute;
    const windowStartAtToday = localMinuteTimestamp(now, allowedStartMinute);
    const windowEndAtToday = localMinuteTimestamp(now, allowedEndMinute) + 59999;
    const mode = normalizeCampaignMode(campaign.mode);
    const state = {
        id: campaign.id,
        active,
        in_window: inWindow,
        file_ok: fileOk,
        commercial_guard: commercialGuard,
        commercial_linked: commercialLinked,
        daily_window_start_minute: allowedStartMinute,
        daily_window_end_minute: allowedEndMinute,
        in_daily_window: inDailyWindow,
        blocked_reason: '',
        due: false,
        next_due_at: null,
        last_played_at: null,
        count_today: 0,
        remaining_today: null,
        min_gap_ms: null
    };

    const lastPlayedRow = db.prepare("SELECT MAX(played_at) AS t FROM ad_campaign_runs WHERE campaign_id=? AND status='played'").get(campaign.id);
    state.last_played_at = lastPlayedRow?.t || null;

    if (commercialGuard && !commercialLinked) {
        state.blocked_reason = 'orphan_campaign';
        return state;
    }

    if (!active || !inWindow || !fileOk) return state;

    if (!inDailyWindow) {
        state.next_due_at = nextDailyWindowStartAt(now, allowedStartMinute);
        return state;
    }

    if (mode === 'hourly') {
        const intervalMs = Math.max(0.5, Number(campaign.interval_hours) || 1) * 60 * 60 * 1000;
        state.min_gap_ms = intervalMs;
        if (!state.last_played_at) {
            state.next_due_at = Math.max(campaign.start_at, windowStartAtToday);
            state.due = now >= state.next_due_at;
            return state;
        }
        state.next_due_at = Math.max(campaign.start_at, state.last_played_at + intervalMs);
        if (state.next_due_at > windowEndAtToday) {
            state.due = false;
            state.next_due_at = nextDailyWindowStartAt(windowEndAtToday + 60000, allowedStartMinute);
            return state;
        }
        state.due = now >= state.next_due_at;
        return state;
    }

    const runsPerDay = Math.max(1, Math.floor(Number(campaign.runs_per_day) || 1));
    const { start, end } = localDayBounds(now);
    const todayRow = db.prepare("SELECT COUNT(1) AS c, MAX(played_at) AS last_today FROM ad_campaign_runs WHERE campaign_id=? AND status='played' AND played_at BETWEEN ? AND ?")
        .get(campaign.id, start, end);
    const countToday = Number(todayRow?.c || 0);
    const lastToday = Number(todayRow?.last_today || 0) || null;
    const windowMs = Math.max(60000, (allowedEndMinute - allowedStartMinute) * 60 * 1000);
    const minGapMs = Math.max(60000, Math.floor(windowMs / runsPerDay));
    state.count_today = countToday;
    state.remaining_today = Math.max(0, runsPerDay - countToday);
    state.min_gap_ms = minGapMs;

    if (countToday >= runsPerDay) {
        state.due = false;
        state.next_due_at = nextDailyWindowStartAt(windowEndAtToday + 60000, allowedStartMinute);
        return state;
    }

    if (!lastToday) {
        state.next_due_at = Math.max(start, windowStartAtToday);
        state.due = now >= state.next_due_at;
        return state;
    }

    state.next_due_at = lastToday + minGapMs;
    if (state.next_due_at > windowEndAtToday) {
        state.due = false;
        state.next_due_at = nextDailyWindowStartAt(windowEndAtToday + 60000, allowedStartMinute);
        return state;
    }
    state.due = now >= state.next_due_at;
    return state;
}

function getCampaignsWithRuntime(now = Date.now()) {
    const rows = db.prepare("SELECT * FROM ad_campaigns ORDER BY priority DESC, id ASC").all();
    const linkedRows = db.prepare('SELECT campaign_id, allowed_hours_start, allowed_hours_end FROM radio_ads WHERE campaign_id IS NOT NULL').all();
    const linkedCampaignIds = new Set(
        linkedRows
            .map((row) => Number(row.campaign_id || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
    );
    const allowedWindowByCampaign = new Map();
    linkedRows.forEach((row) => {
        const id = Number(row.campaign_id || 0);
        if (!Number.isFinite(id) || id <= 0 || allowedWindowByCampaign.has(id)) return;
        const startMinute = parseHHMMMinuteSafe(row.allowed_hours_start, 0);
        const endMinute = parseHHMMMinuteSafe(row.allowed_hours_end, (23 * 60) + 59);
        allowedWindowByCampaign.set(id, {
            startMinute,
            endMinute: endMinute > startMinute ? endMinute : Math.min((23 * 60) + 59, startMinute + 1)
        });
    });
    const hasCommercialLinks = linkedCampaignIds.size > 0;
    return rows.map(c => {
        const campaignId = Number(c.id || 0);
        const allowedWindow = allowedWindowByCampaign.get(campaignId);
        const runtime = getCampaignRuntime({
            ...c,
            _commercial_guard: hasCommercialLinks,
            _commercial_linked: linkedCampaignIds.has(campaignId),
            _allowed_start_minute: allowedWindow ? allowedWindow.startMinute : 0,
            _allowed_end_minute: allowedWindow ? allowedWindow.endMinute : ((23 * 60) + 59)
        }, now);
        return {
            ...c,
            mode: normalizeCampaignMode(c.mode),
            runtime
        };
    });
}

function pickNextDueCampaign(now = Date.now()) {
    const campaigns = getCampaignsWithRuntime(now).filter(c => c.runtime?.due && !c.runtime?.blocked_reason);
    if (!campaigns.length) return null;
    campaigns.sort((a, b) => {
        const pa = Number(a.priority || 0);
        const pb = Number(b.priority || 0);
        if (pa !== pb) return pb - pa;
        const oa = now - Number(a.runtime?.next_due_at || now);
        const ob = now - Number(b.runtime?.next_due_at || now);
        if (oa !== ob) return ob - oa;
        return a.id - b.id;
    });
    return campaigns[0];
}

function pickNextUpcomingCampaign(now = Date.now()) {
    const campaigns = getCampaignsWithRuntime(now)
        .filter(c =>
            c.runtime?.active &&
            c.runtime?.in_window &&
            c.runtime?.file_ok &&
            !c.runtime?.blocked_reason &&
            Number.isFinite(Number(c.runtime?.next_due_at || 0)) &&
            Number(c.runtime?.next_due_at || 0) > 0
        );
    if (!campaigns.length) return null;
    campaigns.sort((a, b) => {
        const na = Number(a.runtime?.next_due_at || 0);
        const nb = Number(b.runtime?.next_due_at || 0);
        if (na !== nb) return na - nb;
        const pa = Number(a.priority || 0);
        const pb = Number(b.priority || 0);
        if (pa !== pb) return pb - pa;
        return a.id - b.id;
    });
    return campaigns[0];
}

function getReservedCampaignFiles(now = Date.now()) {
    const rows = getCampaignsWithRuntime(now)
        .filter(c => c.runtime?.active && c.runtime?.in_window && c.runtime?.file_ok && !c.runtime?.blocked_reason)
        .map(c => (c.file || '').toString().trim())
        .filter(Boolean);
    return Array.from(new Set(rows));
}

function storeAdsHistory(event, data, username) {
    if (!event) return;
    const payload = data && typeof data === 'object' ? data : {};
    const file = payload.file || null;
    const reason = payload.reason || null;
    const now = Date.now();
    try {
        const row = db.prepare('INSERT INTO ads_history (event, data_json, file, reason, username, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(event, JSON.stringify(payload), file, reason, username || '', now);
        return {
            id: Number(row?.lastInsertRowid || 0),
            event,
            at: now,
            data: payload
        };
    } catch (e) { console.error('[ads] history insert error', e.message); }
    return null;
}

function auditListRoutes() {
    if (!AUDIT_RUNTIME || !app._router || !app._router.stack) return;
    const routes = [];
    app._router.stack.forEach((layer) => {
        if (layer.route && layer.route.path) {
            const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
            routes.push(`${methods} ${layer.route.path}`);
        }
    });
    if (routes.length) auditLog(`routes: ${routes.join(' | ')}`);
}

function requirePanelAuth(req, res) {
    const sessionUser = getSessionFromReq(req);
    if (sessionUser) return sessionUser;
    res.status(401).json({ error: 'unauthorized' });
    return null;
}

function requireAdmin(req, res) {
    const user = requirePanelAuth(req, res);
    if (!user) return null;
    if (user.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return null; }
    return user;
}

function getKnowledgePublished() {
    if (!fs.existsSync(KNOWLEDGE_PUBLISHED_FILE)) return { avisos: '' };
    try { return JSON.parse(fs.readFileSync(KNOWLEDGE_PUBLISHED_FILE, 'utf-8')); } catch { return { avisos: '' }; }
}

function setKnowledgePublished(content, author) {
    const payload = { avisos: content.avisos || '', author: author || 'admin', published_at: Date.now() };
    fs.writeFileSync(KNOWLEDGE_PUBLISHED_FILE, JSON.stringify(payload, null, 2));
    try { broadcast({ type: 'knowledge_published_updated', published: payload }); } catch (e) {}
}

registerKnowledgeAdminRoutes({
    app,
    db,
    fs,
    baseContextFile: BASE_CONTEXT_FILE,
    requirePanelAuth,
    requireAdmin,
    getKnowledgePublished,
    setKnowledgePublished,
    getBaseContext: () => baseContextCache,
    getAIContextSnapshot,
    setBaseContext: (nextValue) => { baseContextCache = nextValue; },
    syncAttendanceClassTemplatesFromContext,
    broadcast
});

// --- WEBSOCKET ---
wss.on('connection', (ws, req) => {
    ws.isLogged = false;
    const sessionUser = getSessionFromReq(req);
    if (sessionUser) {
        ws.isLogged = true;
        ws.username = sessionUser.username;
        ws.isAdmin = (sessionUser.role === 'admin');
        ws.fullname = sessionUser.fullname;
        ws.avatar = sessionUser.avatar;
        ws.send(JSON.stringify({ type: 'login_success', username: ws.username, isAdmin: ws.isAdmin, fullname: ws.fullname, avatar: ws.avatar }));
        if (ws.isAdmin) {
            const health = getOperationalHealthSnapshot();
            ws.send(JSON.stringify({ type: 'system_health_update', health }));
        }
    }
    ws.on('message', async (msg) => {
        try {
            const data = JSON.parse(msg);
            if (AUDIT_RUNTIME && data && data.type) auditLog(`ws message type=${data.type}`);
            if (data.type === 'login') {
                ws.send(JSON.stringify({ type: 'login_error', error: 'session_required' }));
                return;
            }
            if (data.type === 'session_check') {
                if (ws.isLogged) {
                    ws.send(JSON.stringify({ type: 'login_success', username: ws.username, isAdmin: ws.isAdmin, fullname: ws.fullname, avatar: ws.avatar }));
                    if (ws.isAdmin) {
                        ws.send(JSON.stringify({ type: 'system_health_update', health: getOperationalHealthSnapshot() }));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'login_error' }));
                }
                return;
            }
            if(!ws.isLogged) return;

            if (data.type === 'update_profile') {
                try {
                    const row = db.prepare('SELECT password FROM panel_users WHERE username=?').get(ws.username);
                    const nextPass = (data.password && data.password.trim().length > 0) ? hashPassword(data.password) : (row ? row.password : '');
                    db.prepare('UPDATE panel_users SET fullname = ?, avatar = ?, password = ? WHERE username = ?').run(data.fullname, data.avatar, nextPass, ws.username);
                    ws.fullname = data.fullname;
                    ws.avatar = data.avatar;
                    ws.send(JSON.stringify({ type: 'profile_updated_success' }));
                } catch(e){}
            }
            if (data.type === 'request_initial_lists') { 
                const chats = Object.entries(conversationState).map(([id, s]) => ({
                    id,
                    name: s.name,
                    lastMessage: s.history.slice(-1)[0],
                    timestamp: s.lastActivityTimestamp,
                    tags: s.tags,
                    notes: s.notes,
                    status: s.status,
                    pausedByHuman: s.pausedByHuman,
                    pendingHuman: !!s.pendingHumanHandoff,
                    slaStatus: normalizeChatSlaStatus(s.slaStatus),
                    slaPendingSince: Number(s.slaPendingSince || 0)
                })).sort((a, b) => b.timestamp - a.timestamp); 
                ws.send(JSON.stringify({ type: 'active_chat_list', chats })); 
            }
            if (data.type === 'request_chat_history') { const u = conversationState[data.contactId]; if(u) ws.send(JSON.stringify({ type: 'chat_history_response', from: data.contactId, history: u.history, tags: u.tags, notes: u.notes, isPaused: !!u.pausedByHuman, pendingHuman: !!u.pendingHumanHandoff })); }
            if (data.type === 'request_chat_meta') { const u = conversationState[data.contactId]; if (u) ws.send(JSON.stringify({ type: 'chat_meta_response', from: data.contactId, tags: u.tags, notes: u.notes, isPaused: !!u.pausedByHuman, pendingHuman: !!u.pendingHumanHandoff })); }
            if (data.type === 'update_contact_data') { const u=conversationState[data.contactId]; if(u){ u.tags=data.tags; u.notes=data.notes; saveChat(data.contactId); broadcast({type:'contact_data_updated', contactId:data.contactId, tags:u.tags, notes:u.notes}); } }
            if (data.type === 'admin_reply') {
                const u = conversationState[data.to];
                if (u) {
                    if (u.pendingHumanHandoff) {
                        clearPendingHumanHandoff(u);
                        broadcastHumanHandoffStatus({ sender: data.to, user: u, pending: false, reason: 'cancelled' });
                    }
                    u.pausedByHuman = true;
                    u.status = 'active';
                    const sn = ws.fullname || ws.username;
                    const txt = `*${sn}:* ${data.text}`;
                    const now = Date.now();
                    await sock.sendMessage(getSendTarget(data.to), { text: txt });
                    appendHistoryEntry(u.history, sn, data.text, now);
                    saveChat(data.to);
                    acknowledgeConversationAttention(data.to, { actor: ws.username || '', reason: 'admin_reply_ws' });
                    broadcast({ type: 'admin_reply_success', from: data.to, text: data.text, senderName: sn, isPaused: true, timestamp: now });
                    scheduleBotResume(data.to);
                }
            }
            if (data.type === 'resume_bot') { const u=conversationState[data.to]; if(u){ u.pausedByHuman=false; saveChat(data.to); broadcast({type:'bot_resumed', from:data.to}); } }
            if (data.type === 'end_chat') { 
                const u = conversationState[data.to]; if (u) { u.status = 'archived'; saveChat(data.to); broadcast({ type: 'chat_archived_update', id: data.to }); }
            }
            
            if (ws.isAdmin) {
                if (data.type === 'request_stats') { const rows = db.prepare('SELECT tags, last_activity FROM conversations').all(); let stats = { total: 0, aulaExp: 0, matriculados: 0, hoje: 0 }; rows.forEach(r => { stats.total++; if (r.tags.includes('Aula Exp')) stats.aulaExp++; if (r.tags.includes('Matriculado')) stats.matriculados++; if (new Date(r.last_activity).toLocaleDateString() === new Date().toLocaleDateString()) stats.hoje++; }); ws.send(JSON.stringify({ type: 'dashboard_stats', stats })); }
                if (data.type === 'request_csv_export') { const rows = db.prepare('SELECT * FROM conversations').all(); let csv = "\uFEFFNome;ID;Tags;Notas;UltimaMensagem;Data\n"; rows.forEach(r => { const h = JSON.parse(r.history||'[]'); const last=h.length?h[h.length-1]:""; csv += `${r.name};${r.id};${r.tags};${r.notes.replace(/\n/g,' ')};${last};${new Date(r.last_activity).toLocaleString()}\n`; }); ws.send(JSON.stringify({ type: 'csv_export_data', csv })); }
                if (data.type === 'admin_get_users') {
                    if (!ws.isAdmin) return;
                    ws.send(JSON.stringify({ type: 'admin_user_list', users: db.prepare('SELECT username, role, fullname FROM panel_users').all() }));
                }
                if (data.type === 'admin_add_user') {
                    if (!ws.isAdmin) return;
                    try {
                        const newUser = (data.newUser || '').toString().toLowerCase().trim();
                        const newPass = (data.newPass || '').toString();
                        const newRole = (data.newRole || 'user').toString();
                        const newFullname = (data.newFullname || '').toString().trim() || 'Atendente';
                        if (newUser.length < 3 || !isStrongPassword(newPass)) {
                            ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'add', message: 'Senha fraca (min 8, letra e numero)' }));
                            return;
                        }
                        const exists = db.prepare('SELECT username FROM panel_users WHERE username=?').get(newUser);
                        if (exists) {
                            ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'add', message: 'Usuario ja existe' }));
                            return;
                        }
                        const hashed = hashPassword(newPass);
                        db.prepare('INSERT INTO panel_users (username, password, role, fullname) VALUES (?, ?, ?, ?)')
                          .run(newUser, hashed, newRole, newFullname);
                        logAdminAction('user.create', ws.username, newUser, { role: newRole, fullname: newFullname }, ws._socket?.remoteAddress);
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: true, action: 'add' }));
                        ws.send(JSON.stringify({ type: 'admin_user_list', users: db.prepare('SELECT username, role, fullname FROM panel_users').all() }));
                    } catch (e) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'add', message: 'Erro ao criar' }));
                    }
                }
                if (data.type === 'admin_delete_user') {
                    if (!ws.isAdmin) return;
                    const target = (data.userToDelete || '').toString().toLowerCase().trim();
                    if (!target) return;
                    if (target === (ws.username || '').toString().toLowerCase()) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'delete', message: 'Nao pode remover seu proprio usuario' }));
                        return;
                    }
                    if (target === NOME_DO_USUARIO_PAINEL.toLowerCase()) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'delete', message: 'Nao pode remover o admin principal' }));
                        return;
                    }
                    db.prepare('DELETE FROM panel_users WHERE username = ?').run(target);
                    logAdminAction('user.delete', ws.username, target, {}, ws._socket?.remoteAddress);
                    ws.send(JSON.stringify({ type: 'admin_action_result', ok: true, action: 'delete' }));
                    ws.send(JSON.stringify({ type: 'admin_user_list', users: db.prepare('SELECT username, role, fullname FROM panel_users').all() }));
                }
                if (data.type === 'admin_reset_password') {
                    if (!ws.isAdmin) return;
                    const target = (data.userToReset || '').toString().toLowerCase().trim();
                    const newPass = (data.newPass || '').toString();
                    if (!target || !isStrongPassword(newPass)) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'reset', message: 'Senha fraca (min 8, letra e numero)' }));
                        return;
                    }
                    if (target === NOME_DO_USUARIO_PAINEL.toLowerCase() && target !== (ws.username || '').toString().toLowerCase()) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'reset', message: 'Somente o admin principal pode resetar sua senha' }));
                        return;
                    }
                    const row = db.prepare('SELECT username FROM panel_users WHERE username=?').get(target);
                    if (!row) {
                        ws.send(JSON.stringify({ type: 'admin_action_result', ok: false, action: 'reset', message: 'Usuario nao encontrado' }));
                        return;
                    }
                    const hashed = hashPassword(newPass);
                    db.prepare('UPDATE panel_users SET password=? WHERE username=?').run(hashed, target);
                    logAdminAction('user.reset_password', ws.username, target, {}, ws._socket?.remoteAddress);
                    ws.send(JSON.stringify({ type: 'admin_action_result', ok: true, action: 'reset' }));
                }
            }
        } catch (e) { console.error('WS Error:', e); }
    });
});

function broadcast(msg, isPublic = false) { wss.clients.forEach(c => { if (c.readyState === c.OPEN) { if (isPublic || c.isLogged) c.send(JSON.stringify(msg)); } }); }

let baseContextWatchTimer = null;
fs.watchFile(BASE_CONTEXT_FILE, { interval: 1000 }, () => {
    if (baseContextWatchTimer) clearTimeout(baseContextWatchTimer);
    baseContextWatchTimer = setTimeout(() => {
        const before = baseContextCache;
        loadBaseContext();
        let templateSummary = null;
        try {
            templateSummary = syncAttendanceClassTemplatesFromContext({ actor: 'system', mode: 'auto' });
        } catch (e) {
            console.error('[attendance] templates auto-sync error:', e?.message || e);
        }
        if (baseContextCache !== before) {
            broadcast({ type: 'knowledge_base_updated', base_context: baseContextCache, updated_at: Date.now() });
        }
        if (templateSummary) {
            broadcast({ type: 'attendance_templates_updated', updated_at: templateSummary.updated_at || Date.now(), summary: templateSummary });
        }
    }, 200);
});
function scheduleBotResume(contactId) {
    const u = conversationState[contactId];
    if (!u) return;
    if (u.inactivityTimer) clearTimeout(u.inactivityTimer);
    u.inactivityTimer = setTimeout(async () => {
        try {
            if (!u.pausedByHuman) return;
            u.pausedByHuman = false;
            const m = "Hime de volta! Posso ajudar em algo mais?";
            const now = Date.now();
            if (sock) await sock.sendMessage(getSendTarget(contactId), { text: m });
            appendHistoryEntry(u.history, 'Hime', m, now);
            saveChat(contactId);
            broadcast({ type: 'bot_resumed', from: contactId, timestamp: now });
        } catch (resumeErr) {
            console.error('[chat] erro ao retomar bot automaticamente:', resumeErr?.message || resumeErr);
        }
    }, 30 * 60000);
}

// --- 8. BAILEYS ---
let sock;
let whatsappConnected = false;
let startingSock = false;
let reconnectAttempts = 0;
let reconnectTimer = null;
let whatsappLastError = '';
let whatsappLastErrorCode = 0;
function resetWhatsappAuthSession() {
    try {
        ensureDir(AUTH_SESSION_DIR);
        const entries = fs.readdirSync(AUTH_SESSION_DIR);
        if (!entries.length) return false;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(BACKUP_DIR, `whatsapp_auth_loggedout_${stamp}`);
        ensureDir(backupDir);
        for (const name of entries) {
            const from = path.join(AUTH_SESSION_DIR, name);
            const to = path.join(backupDir, name);
            fs.renameSync(from, to);
        }
        console.log(`[baileys] sessao invalida arquivada em: ${backupDir}`);
        return true;
    } catch (e) {
        console.error(`[baileys] falha ao resetar sessao invalida: ${e?.message || e}`);
        return false;
    }
}
function scheduleReconnect() {
    if (reconnectTimer) return;
    whatsappLastError = whatsappLastError || 'reconnecting';
    const delay = Math.min(15000, 1500 + (reconnectAttempts * 1500));
    reconnectAttempts += 1;
    console.log(`[baileys] reconectando em ${Math.round(delay / 1000)}s (tentativa ${reconnectAttempts})`);
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startBot();
    }, delay);
}
async function startBot() {
    if (startingSock) return;
    startingSock = true;
    whatsappConnected = false;
    whatsappLastError = '';
    whatsappLastErrorCode = 0;
    await ensureBaileysLoaded();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_SESSION_DIR);
    let waVersion;
    try {
        const latest = await fetchLatestBaileysVersion();
        waVersion = latest?.version;
        if (Array.isArray(waVersion)) console.log(`[baileys] usando versao WA ${waVersion.join('.')}`);
    } catch (e) {
        console.log('[baileys] nao foi possivel obter versao WA mais recente, usando fallback');
    }
    const currentSock = makeWASocket({ logger: pino({ level: 'silent' }), printQRInTerminal: false, auth: state, browser: ['HimeFit', 'Chrome', '10.0'], connectTimeoutMs: 60000, syncFullHistory: false, version: waVersion });
    sock = currentSock;
    
    if (!server.listening) server.listen(PORT, () => {
        console.log(`[start] HimeFit Ultimate 6.5: ${PORT}`);
        auditListRoutes();
        if (AUDIT_RUNTIME) {
            const cwd = process.cwd();
            const mods = Object.keys(require.cache || {}).filter(p => p.startsWith(cwd));
            auditLog(`modules_loaded: ${mods.length}`);
            mods.slice(0, 50).forEach(m => auditLog(`module ${m}`));
            if (mods.length > 50) auditLog(`module ... (${mods.length - 50} more)`);
        }
    });
    currentSock.ev.on('creds.update', saveCreds);
    if (!state?.creds?.registered) {
        const phone = String(process.env.PAIRING_PHONE || '').replace(/\D/g, '');
        if (phone && phone.length >= 10) {
            setTimeout(async () => {
                try {
                    const code = await currentSock.requestPairingCode(phone);
                    lastPairingCode = code || '';
                    lastPairingAt = Date.now();
                    console.log(`[baileys] codigo de pareamento (${phone}): ${lastPairingCode}`);
                } catch (e) {
                    console.log(`[baileys] falha ao gerar codigo de pareamento: ${e?.message || 'erro'}`);
                }
            }, 1200);
        }
    }
    currentSock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQrRaw = qr;
            lastQrAt = Date.now();
            console.log('[baileys] QR recebido, escaneie para conectar');
            console.log(`[baileys] fallback QR URL: https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(qr)}`);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            sock = currentSock;
            whatsappConnected = true;
            startingSock = false;
            reconnectAttempts = 0;
            whatsappLastError = '';
            whatsappLastErrorCode = 0;
            lastQrRaw = '';
            lastQrAt = 0;
            console.log('[ok] BOT ONLINE');
            startAttendanceReminderLoop();
            return;
        }
        if (connection === 'close') {
            if (sock === currentSock) sock = null;
            whatsappConnected = false;
            startingSock = false;
            const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.statusCode || 0;
            const reasonName = Object.keys(DisconnectReason).find(k => DisconnectReason[k] === statusCode) || 'unknown';
            whatsappLastErrorCode = Number(statusCode || 0);
            whatsappLastError = reasonName || 'connection_closed';
            console.log(`[baileys] conexao fechada. code=${statusCode} reason=${reasonName}`);
            const needsRelogin = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 405;
            if (needsRelogin) {
                console.log('[baileys] sessao invalida/deslogada. Refaça o pareamento (QR).');
                if (resetWhatsappAuthSession()) {
                    lastQrRaw = '';
                    lastQrAt = 0;
                    lastPairingCode = '';
                    lastPairingAt = 0;
                }
            }
            scheduleReconnect();
        }
    });

    sock.ev.on('messaging-history.set', ({ chats, contacts }) => {
        if (!LEGACY_CHAT_ENABLED) return;
        console.log(`[sync] recebidas ${chats.length} conversas do historico`);
        let updated = 0; const contactMap = {}; contacts.forEach(c => { contactMap[c.id] = c.name || c.notify; });
        const nameToPhone = {};
        const now = Date.now(); const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
        chats.forEach(chat => {
            const id = chat.id;
            if (id.includes('@g.us') || id.includes('status') || id.includes('broadcast') || id.includes('newsletter')) return;
            const name = contactMap[id] || id.split('@')[0];
            if (isPhoneJid(id)) {
                const nn = normalizeName(name);
                if (nn) nameToPhone[nn] = id;
            }
            const time = chat.conversationTimestamp ? (typeof chat.conversationTimestamp === 'number' ? chat.conversationTimestamp * 1000 : chat.conversationTimestamp.low * 1000) : Date.now();
            const newStatus = (now - time) < ONE_WEEK ? 'active' : 'archived';
            if (!conversationState[id]) { conversationState[id] = { history: ["Sistema: Histórico recuperado."], name: name, tags: [], notes: "", lastActivityTimestamp: time, pausedByHuman: false, pendingHumanHandoff: null, status: newStatus, routeJid: id, slaPendingSince: 0, slaStatus: 'ok', slaUpdatedAt: Date.now(), messageBuffer: [], typingTimer: null }; saveChat(id); updated++; }
            else { const u = conversationState[id]; if(time > u.lastActivityTimestamp) { u.lastActivityTimestamp = time; if(newStatus === 'active') u.status = 'active'; } u.routeJid = u.routeJid || id; saveChat(id); updated++; }
        });
        chats.forEach(chat => {
            const id = chat.id;
            if (!id || isPhoneJid(id) || !id.includes('@')) return;
            const name = contactMap[id] || id.split('@')[0];
            const phoneId = nameToPhone[normalizeName(name)];
            if (phoneId) setContactAlias(id, phoneId, 'history_sync');
        });
        if (updated > 0) { console.log(`[sync] ${updated} chats sincronizados`); broadcast({ type: 'request_initial_lists' }); }
    });
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!LEGACY_CHAT_ENABLED && !ATTENDANCE_ENABLED) return;
        if (type !== 'notify') return; const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const senderRaw = msg.key.remoteJid;
        if (senderRaw === 'status@broadcast' || senderRaw.includes('@broadcast') || senderRaw.includes('@newsletter') || senderRaw.includes('@g.us')) return;
        const sender = resolveCanonicalContactId(senderRaw, msg.pushName);
        if (sender !== senderRaw && isPhoneJid(sender)) {
            setContactAlias(senderRaw, sender, 'upsert_resolve');
        }

        const wrappedMessage = unwrapIncomingMessage(msg.message);
        let text = wrappedMessage.conversation || wrappedMessage.extendedTextMessage?.text || wrappedMessage.imageMessage?.caption;
        const attendanceInteractiveCommand = extractAttendanceInteractiveCommand(wrappedMessage);
        if (!text && attendanceInteractiveCommand) {
            text = attendanceInteractiveCommand === 'entry' ? 'entrada' : 'saida';
        }
        const isAudio = !!wrappedMessage.audioMessage;
        const incomingLocation = extractIncomingLocation(msg.message);
        const incomingImage = extractIncomingImage(msg.message);
        const incomingSticker = extractIncomingSticker(msg.message);
        if (!text && !isAudio && !incomingLocation && !incomingImage && !incomingSticker) return;
        console.log(`[msg] ${sender.split('@')[0]}`);
        const msgTsRaw = msg.messageTimestamp;
        const msgTimestampMs = typeof msgTsRaw === 'number'
            ? (msgTsRaw > 9999999999 ? msgTsRaw : (msgTsRaw * 1000))
            : (msgTsRaw?.low ? Number(msgTsRaw.low) * 1000 : Date.now());

        if (!conversationState[sender]) conversationState[sender] = { history: [], messageBuffer: [], typingTimer: null, pausedByHuman: false, pendingHumanHandoff: null, name: msg.pushName || sender.split('@')[0], lastActivityTimestamp: Date.now(), tags: [], notes: "", status: 'active', routeJid: senderRaw, slaPendingSince: 0, slaStatus: 'ok', slaUpdatedAt: Date.now() };
        const user = conversationState[sender]; user.lastActivityTimestamp = Date.now(); user.status = 'active'; user.routeJid = senderRaw;

        let isAttendanceContact = false;
        let skipStandardUserEcho = false;
        if (ATTENDANCE_ENABLED) {
            const commandPreview = detectAttendanceCommand(text || '');
            const attendance = await handleAttendanceIncomingMessage(sender, senderRaw, text, msgTimestampMs, incomingLocation);
            attendanceDebugLast = {
                at: Date.now(),
                sender,
                senderRaw,
                text: String(text || '').slice(0, 250),
                command: attendance.command || commandPreview || null,
                matched: !!attendance.matched,
                consumed: !!attendance.consumed,
                employeeId: attendance.employeeId || null,
                reason: attendance.reason || '',
                geoStatus: attendance.geoStatus || '',
                geoDistanceM: Number.isFinite(Number(attendance.geoDistanceM)) ? Number(attendance.geoDistanceM) : null
            };
            console.log('[attendance]', attendanceDebugLast);
            isAttendanceContact = !!attendance.matched;
            if (attendance.matched && attendance.consumed) {
                const panelText = String(
                    attendance.panelText
                    || (attendance.command === 'entry' ? 'entrada registrada' : attendance.command === 'exit' ? 'saida registrada' : 'acao processada')
                ).trim();
                if (panelText) {
                    appendHistoryEntry(user.history, 'Sistema Ponto', `${panelText}.`, msgTimestampMs);
                    saveChat(sender);
                    broadcast({
                        type: 'user_reply',
                        from: sender,
                        text: `[PONTO] ${panelText}`,
                        name: user.name,
                        status: 'active',
                        pausedByHuman: user.pausedByHuman,
                        timestamp: msgTimestampMs
                    });
                }
                return;
            }
        }
        if (!isAttendanceContact) {
            markConversationInboundForSla(sender, msgTimestampMs);
        }

        if (incomingImage) {
            const incomingCaption = sanitizePublicText(incomingImage.caption || '', 1024);
            try {
                const mediaBuffer = await timeoutPromise(downloadMediaMessage(msg, 'buffer', {}), 15000, 'Timeout');
                const saved = await saveChatImageBuffer(mediaBuffer, incomingImage.mime, 'in');
                const now = Date.now();
                const media = {
                    url: buildChatImagePublicUrl(saved.filename, now),
                    caption: incomingCaption,
                    mime: saved.mime,
                    size: saved.size,
                    ts: now,
                    width: incomingImage.width || undefined,
                    height: incomingImage.height || undefined
                };
                const marker = buildChatImageHistoryMarker(media);
                appendHistoryEntry(user.history, 'Usuario', marker, now);
                saveChat(sender);
                broadcast({
                    type: 'user_reply',
                    from: sender,
                    text: marker,
                    name: user.name,
                    status: 'active',
                    pausedByHuman: user.pausedByHuman,
                    timestamp: now,
                    kind: 'image',
                    media
                });
                skipStandardUserEcho = true;
            } catch (imgErr) {
                console.error('[chat-image] incoming image error:', imgErr?.message || imgErr);
                const placeholder = '[Imagem recebida, mas nao foi possivel processar no painel]';
                const now = Date.now();
                appendHistoryEntry(user.history, 'Usuario', placeholder, now);
                saveChat(sender);
                broadcast({
                    type: 'user_reply',
                    from: sender,
                    text: placeholder,
                    name: user.name,
                    status: 'active',
                    pausedByHuman: user.pausedByHuman,
                    timestamp: now
                });
            }

            if (!incomingCaption) {
                return;
            }
            text = incomingCaption;
        }

        if (incomingSticker) {
            try {
                const stickerBuffer = await timeoutPromise(downloadMediaMessage(msg, 'buffer', {}), 15000, 'Timeout');
                const saved = await saveChatStickerBuffer(stickerBuffer, incomingSticker.mime || 'image/webp', 'in_stk');
                const now = Date.now();
                const media = {
                    url: buildChatImagePublicUrl(saved.filename, now),
                    mime: saved.mime,
                    size: saved.size,
                    ts: now
                };
                const marker = buildChatStickerHistoryMarker(media);
                appendHistoryEntry(user.history, 'Usuario', marker, now);
                saveChat(sender);
                broadcast({
                    type: 'user_reply',
                    from: sender,
                    text: marker,
                    name: user.name,
                    status: 'active',
                    pausedByHuman: user.pausedByHuman,
                    timestamp: now,
                    kind: 'sticker',
                    media
                });
            } catch (stkErr) {
                console.error('[chat-sticker] incoming sticker error:', stkErr?.message || stkErr);
                const placeholder = '[Figurinha recebida, mas nao foi possivel processar no painel]';
                const now = Date.now();
                appendHistoryEntry(user.history, 'Usuario', placeholder, now);
                saveChat(sender);
                broadcast({
                    type: 'user_reply',
                    from: sender,
                    text: placeholder,
                    name: user.name,
                    status: 'active',
                    pausedByHuman: user.pausedByHuman,
                    timestamp: now
                });
            }
            return;
        }

        if (text && !user.pausedByHuman) {
            const rawPendingHuman = user.pendingHumanHandoff;
            const pendingHuman = getPendingHumanHandoff(user);
            if (rawPendingHuman && !pendingHuman) {
                console.log('[human] confirmation_expired', {
                    sender,
                    normalizedText: rawPendingHuman.normalizedText || '',
                    matchedRule: rawPendingHuman.matchedRule || ''
                });
                broadcastHumanHandoffStatus({
                    sender,
                    user,
                    pending: false,
                    reason: 'expired'
                });
            }
            let skipHumanIntentDetection = false;
            if (pendingHuman) {
                const confirmation = isHumanHandoffConfirmation(text);
                if (confirmation === 'yes') {
                    console.log('[human] confirmation_yes', {
                        sender,
                        normalizedText: pendingHuman.normalizedText || '',
                        matchedRule: pendingHuman.matchedRule || ''
                    });
                    await executeHumanHandoff({
                        sender,
                        user,
                        text: pendingHuman.originalText || text,
                        triggerMode: 'confirmed',
                        matchedRule: pendingHuman.matchedRule || '',
                        eventTimestamp: msgTimestampMs
                    });
                    broadcastHumanHandoffStatus({
                        sender,
                        user,
                        pending: false,
                        reason: 'confirmed'
                    });
                    return;
                }
                if (confirmation === 'no') {
                    console.log('[human] confirmation_no', {
                        sender,
                        normalizedText: pendingHuman.normalizedText || '',
                        matchedRule: pendingHuman.matchedRule || ''
                    });
                    clearPendingHumanHandoff(user);
                    broadcastHumanHandoffStatus({
                        sender,
                        user,
                        pending: false,
                        reason: 'declined'
                    });
                    if (shouldReuseHumanOriginalText(pendingHuman.originalText)) {
                        text = pendingHuman.originalText;
                        skipHumanIntentDetection = true;
                        skipStandardUserEcho = true;
                    } else {
                        const declineReply = 'Certo, sigo por aqui. Me diga como posso te ajudar.';
                        const replyTs = Date.now();
                        appendHistoryEntry(user.history, 'Usuario', text, msgTimestampMs);
                        appendHistoryEntry(user.history, 'Hime', declineReply, replyTs);
                        saveChat(sender);
                        broadcast({ type: 'user_reply', from: sender, text, name: user.name, status: 'active', pausedByHuman: user.pausedByHuman, timestamp: msgTimestampMs });
                        broadcast({ type: 'bot_reply', from: sender, text: declineReply, timestamp: replyTs });
                        if (sock) await sock.sendMessage(getSendTarget(sender), { text: declineReply });
                        return;
                    }
                } else {
                    clearPendingHumanHandoff(user);
                    broadcastHumanHandoffStatus({
                        sender,
                        user,
                        pending: false,
                        reason: 'cancelled'
                    });
                }
            }

            if (!skipHumanIntentDetection) {
                const humanIntent = detectHumanHandoffIntent(text);
                if (humanIntent.type === 'explicit') {
                    console.log('[human] explicit_request', {
                        sender,
                        normalizedText: humanIntent.normalizedText || '',
                        matchedRule: humanIntent.matchedRule || ''
                    });
                    await executeHumanHandoff({
                        sender,
                        user,
                        text,
                        triggerMode: 'explicit',
                        matchedRule: humanIntent.matchedRule || '',
                        eventTimestamp: msgTimestampMs
                    });
                    return;
                }
                if (humanIntent.type === 'ambiguous') {
                    console.log('[human] ambiguous_request', {
                        sender,
                        normalizedText: humanIntent.normalizedText || '',
                        matchedRule: humanIntent.matchedRule || ''
                    });
                    openPendingHumanHandoff(user, text, humanIntent);
                    broadcastHumanHandoffStatus({
                        sender,
                        user,
                        pending: true,
                        reason: 'ambiguous',
                        expiresAt: user.pendingHumanHandoff?.expiresAt || 0
                    });
                    const confirmReply = 'Se voce quiser falar com um atendente humano, responda SIM. Se preferir continuar comigo, responda NAO.';
                    const replyTs = Date.now();
                    appendHistoryEntry(user.history, 'Usuario', text, msgTimestampMs);
                    appendHistoryEntry(user.history, 'Hime', confirmReply, replyTs);
                    saveChat(sender);
                    broadcast({ type: 'user_reply', from: sender, text, name: user.name, status: 'active', pausedByHuman: user.pausedByHuman, timestamp: msgTimestampMs });
                    broadcast({ type: 'bot_reply', from: sender, text: confirmReply, timestamp: replyTs });
                    if (sock) await sock.sendMessage(getSendTarget(sender), { text: confirmReply });
                    return;
                }
            }
        }

        if (!isAudio) {
            if (!skipStandardUserEcho) {
                appendHistoryEntry(user.history, 'Usuario', text, msgTimestampMs);
                saveChat(sender);
                broadcast({ type: 'user_reply', from: sender, text, name: user.name, status: 'active', pausedByHuman: user.pausedByHuman, timestamp: msgTimestampMs });
            }
            if (user.pausedByHuman || isAttendanceContact) return;
        } else {
            if (isAttendanceContact) {
                const placeholder = '[Audio recebido - colaborador]';
                appendHistoryEntry(user.history, 'Usuario', placeholder, msgTimestampMs);
                saveChat(sender);
                broadcast({ type: 'user_reply', from: sender, text: placeholder, name: user.name, status: 'active', pausedByHuman: user.pausedByHuman, timestamp: msgTimestampMs });
                return;
            }
            user.messageBuffer.push({type:'audio', msg});
        }

        if (user.typingTimer) clearTimeout(user.typingTimer);
        user.typingTimer = setTimeout(async () => {
            try {
                let input = text;
                if (user.messageBuffer.length > 0) {
                    try {
                        const buf = await timeoutPromise(downloadMediaMessage(user.messageBuffer[0].msg, 'buffer', {}), 10000, "Timeout");
                        const p = await convertAndSaveAudio(buf);
                        input = await transcreverAudioIA(p);
                        try { await unlink(p); } catch (e) {}
                        const msgText = `[Audio Transcrito]: ${input}`;
                        appendHistoryEntry(user.history, 'Usuario', msgText, msgTimestampMs);
                        saveChat(sender);
                        broadcast({ type: 'user_reply', from: sender, text: msgText, name: user.name, status: 'active', pausedByHuman: user.pausedByHuman, timestamp: msgTimestampMs });
                    } catch (e) {
                        console.error("Erro audio:", e);
                    }
                    user.messageBuffer = [];
                }
                if (input && GATILHOS_AULA_EXPERIMENTAL.some(g => input.toLowerCase().includes(g))) {
                    if (!user.tags.includes('Aula Exp.')) {
                        user.tags.push('Aula Exp.');
                        saveChat(sender);
                        broadcast({ type: 'request_initial_lists' });
                    }
                }
                if (user.pausedByHuman) return;
                const scaContextSnippet = buildScaContextSnippetForSender(sender, user.routeJid || senderRaw || '');
                const respRaw = await gerarRespostaIA(
                    input || "...",
                    user.history,
                    scaContextSnippet ? { sca: scaContextSnippet } : null
                );
                const resp = sanitizeAssistantReply(respRaw);
                if (resp) {
                    const replyTs = Date.now();
                    await sock.sendMessage(getSendTarget(sender), { text: resp });
                    appendHistoryEntry(user.history, 'Hime', resp, replyTs);
                    saveChat(sender);
                    broadcast({ type: 'bot_reply', from: sender, text: resp, timestamp: replyTs });
                } else if (respRaw) {
                    const fallback = "Perfeito. Posso te ajudar com planos, horarios, aula experimental ou matricula.";
                    const replyTs = Date.now();
                    console.warn('[ia] blocked leaked assistant reply');
                    await sock.sendMessage(getSendTarget(sender), { text: fallback });
                    appendHistoryEntry(user.history, 'Hime', fallback, replyTs);
                    saveChat(sender);
                    broadcast({ type: 'bot_reply', from: sender, text: fallback, timestamp: replyTs });
                }
            } catch (timerErr) {
                console.error('[chat] erro no timer de digitacao:', timerErr?.message || timerErr);
            }
        }, 10000);
    });
}
startOperationalHealthMonitoring();
startRuntimeServices({
    startChatMediaCleanupLoop,
    disableWhatsapp: DISABLE_WHATSAPP,
    server,
    port: PORT,
    auditListRoutes,
    startBot
});

