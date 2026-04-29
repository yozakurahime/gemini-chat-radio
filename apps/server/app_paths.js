const path = require('path');

function normalizeTenantSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 64);
}

function cookieSuffixFromTenantSlug(slug) {
    return String(slug || '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function resolveAppPaths(rootDir, env = process.env, platform = process.platform) {
    const ROOT_DIR = path.resolve(rootDir || __dirname);
    const IS_WINDOWS = platform === 'win32';
    const APP_PROFILE = String(env.HIMEFIT_PROFILE || 'owner').trim().toLowerCase();
    const IS_COMMERCIAL_PROFILE = APP_PROFILE === 'commercial';
    const RAW_TENANT_SLUG = String(env.HIMEFIT_TENANT_SLUG || '').trim();
    const TENANT_SLUG = normalizeTenantSlug(RAW_TENANT_SLUG);
    const IS_TENANT_MODE = Boolean(TENANT_SLUG);
    const TENANT_NAME = String(env.HIMEFIT_TENANT_NAME || TENANT_SLUG || '').trim();
    const TENANT_COOKIE_SUFFIX = cookieSuffixFromTenantSlug(TENANT_SLUG);
    const PANEL_SESSION_COOKIE = TENANT_COOKIE_SUFFIX
        ? `panel_session_${TENANT_COOKIE_SUFFIX}`
        : 'panel_session';
    const FALLBACK_PROGRAM_DATA_DIR = IS_WINDOWS
        ? 'C:\\ProgramData'
        : path.join(ROOT_DIR, '.programdata');
    const OWNER_DATA_ROOT = IS_WINDOWS
        ? path.join(env.ProgramData || FALLBACK_PROGRAM_DATA_DIR, 'Himefit-owner')
        : path.join(FALLBACK_PROGRAM_DATA_DIR, 'Himefit-owner');
    const TENANTS_ROOT_DIR = env.HIMEFIT_TENANTS_ROOT
        ? path.resolve(env.HIMEFIT_TENANTS_ROOT)
        : path.join(ROOT_DIR, 'runtime', 'tenants');
    const DEFAULT_TENANT_DATA_ROOT = IS_TENANT_MODE
        ? path.join(TENANTS_ROOT_DIR, TENANT_SLUG)
        : '';
    const DATA_ROOT_DIR = env.HIMEFIT_DATA_ROOT
        ? path.resolve(env.HIMEFIT_DATA_ROOT)
        : (IS_TENANT_MODE
            ? DEFAULT_TENANT_DATA_ROOT
            : (IS_COMMERCIAL_PROFILE
            ? path.join(env.ProgramData || FALLBACK_PROGRAM_DATA_DIR, 'Himefit')
            : OWNER_DATA_ROOT));
    const DATA_DIR = path.join(DATA_ROOT_DIR, 'data');
    const STORAGE_DIR = path.join(DATA_ROOT_DIR, 'storage');
    const BACKUP_DIR = path.join(DATA_ROOT_DIR, 'backups');
    const UPDATES_DIR = path.join(DATA_ROOT_DIR, 'updates');
    const LOGS_DIR = path.join(STORAGE_DIR, 'logs');
    const ADS_DIR = path.join(STORAGE_DIR, 'ads_mp3');
    const CHAT_MEDIA_DIR = path.join(STORAGE_DIR, 'chat_media_private');
    const AUTH_SESSION_DIR = IS_TENANT_MODE
        ? path.join(DATA_ROOT_DIR, 'auth', 'session')
        : path.join(STORAGE_DIR, 'himefit_auth_session');
    const CACHE_DIR = path.join(STORAGE_DIR, 'radio_cache');
    const RADIO_CACHE_FILE = path.join(STORAGE_DIR, 'radio_cache.json');
    const KNOWLEDGE_DIR = IS_TENANT_MODE
        ? path.join(DATA_ROOT_DIR, 'knowledge')
        : path.join(DATA_DIR, 'knowledge');
    const KNOWLEDGE_PUBLISHED_FILE = path.join(KNOWLEDGE_DIR, 'published.json');
    const BASE_CONTEXT_FILE = IS_TENANT_MODE
        ? path.join(KNOWLEDGE_DIR, 'base_context.md')
        : path.join(DATA_DIR, 'contexto_academia.txt');
    const BASE_CONTEXT_TEMPLATE_FILE = path.join(ROOT_DIR, 'contexto_academia.txt');
    const RADIO_TRASH_DIR = path.join(STORAGE_DIR, '_radio_trash');
    const DB_FILE = path.join(DATA_DIR, 'himefit.db');
    const PENDING_RESTORE_DB_FILE = path.join(DATA_DIR, 'himefit.restore.pending.db');
    const LEGACY_OWNER_ROOT = ROOT_DIR;
    const LEGACY_OWNER_CHAT_MEDIA_DIR = path.resolve(ROOT_DIR, '..', 'chat_media_private');

    return {
        ROOT_DIR,
        IS_WINDOWS,
        APP_PROFILE,
        IS_COMMERCIAL_PROFILE,
        TENANT_SLUG,
        TENANT_NAME,
        IS_TENANT_MODE,
        TENANTS_ROOT_DIR,
        PANEL_SESSION_COOKIE,
        FALLBACK_PROGRAM_DATA_DIR,
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
    };
}

module.exports = { resolveAppPaths };
