const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROOT = path.resolve(__dirname);
const LOG_FILE = path.resolve(process.env.SCA_WEB_LOG_FILE || path.join(ROOT, 'logs', 'sca-web-export.log'));
const DOWNLOAD_DIR = path.resolve(process.env.SCA_WEB_DOWNLOAD_DIR || path.join(ROOT, 'runtime', 'downloads'));
const EXPORT_DIR = path.resolve(process.env.SCA_WEB_EXPORT_DIR || path.join(ROOT, 'runtime', 'exports'));
const USER_DATA_DIR = path.resolve(process.env.SCA_WEB_USER_DATA_DIR || path.join(ROOT, 'runtime', 'browser-profile'));
const LOGIN_URL = String(process.env.SCA_WEB_LOGIN_URL || 'https://app.sistemasca.com/login').trim();
const ALUNOS_URL = String(process.env.SCA_WEB_ALUNOS_URL || 'https://app.sistemasca.com/administrativo/alunos').trim();
const USERNAME = String(process.env.SCA_WEB_USERNAME || '').trim();
const PASSWORD = String(process.env.SCA_WEB_PASSWORD || '').trim();
const ENABLED = String(process.env.SCA_WEB_ENABLED || '1').trim() !== '0';
const HEADLESS = String(process.env.SCA_WEB_HEADLESS || '1').trim() !== '0';
const TIMEOUT_MS = Math.max(15_000, Number(process.env.SCA_WEB_TIMEOUT_MS || 90_000));
const CLICK_DELAY_MS = Math.max(0, Number(process.env.SCA_WEB_CLICK_DELAY_MS || 500));
const KEEP_RAW_FILES = String(process.env.SCA_WEB_KEEP_RAW_FILES || '1').trim() !== '0';
const CONVERT_TO_CSV = String(process.env.SCA_WEB_CONVERT_TO_CSV || '1').trim() !== '0';
const FILE_PREFIX = String(process.env.SCA_WEB_FILE_PREFIX || 'sca-alunos').trim() || 'sca-alunos';
const LOG_ROTATE_BYTES = Math.max(256 * 1024, Number(process.env.SCA_WEB_LOG_ROTATE_BYTES || (5 * 1024 * 1024)));
const BROWSER_CHANNEL = String(process.env.SCA_WEB_BROWSER_CHANNEL || 'msedge').trim();
const BROWSER_EXECUTABLE_PATH = String(process.env.SCA_WEB_EXECUTABLE_PATH || '').trim();

const LOGIN_USER_SELECTOR = String(process.env.SCA_WEB_LOGIN_USER_SELECTOR || '').trim();
const LOGIN_PASSWORD_SELECTOR = String(process.env.SCA_WEB_LOGIN_PASSWORD_SELECTOR || '').trim();
const LOGIN_SUBMIT_SELECTOR = String(process.env.SCA_WEB_LOGIN_SUBMIT_SELECTOR || '').trim();
const DOWNLOAD_TRIGGER_SELECTOR = String(process.env.SCA_WEB_DOWNLOAD_TRIGGER_SELECTOR || '').trim();
const EXPORT_ACTION_SELECTOR = String(process.env.SCA_WEB_EXPORT_ACTION_SELECTOR || '').trim();
const EXPORT_ACTION_TEXT = String(process.env.SCA_WEB_EXPORT_ACTION_TEXT || 'Export').trim();

function ensureDir(target) {
    fs.mkdirSync(target, { recursive: true });
}

function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = fs.statSync(LOG_FILE);
        if (!stat.isFile() || stat.size < LOG_ROTATE_BYTES) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.renameSync(LOG_FILE, `${LOG_FILE}.${stamp}`);
    } catch (_) {}
}

function log(message) {
    ensureDir(path.dirname(LOG_FILE));
    rotateLogIfNeeded();
    const line = `[${new Date().toISOString()}] ${message}`;
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    console.log(line);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileName(input) {
    return String(input || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
}

function decodeHtmlEntities(text) {
    return String(text || '').replace(/&#(\d+);/g, (_, code) => {
        const n = Number(code);
        if (!Number.isFinite(n) || n <= 0) return _;
        try {
            return String.fromCodePoint(n);
        } catch (_) {
            return _;
        }
    });
}

function getStamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}-${hh}${mm}${ss}`;
}

async function tryFill(page, selectors, value) {
    for (const selector of selectors) {
        if (!selector) continue;
        try {
            const locator = page.locator(selector).first();
            await locator.waitFor({ state: 'visible', timeout: 3_500 });
            await locator.click({ timeout: 2_000 });
            await locator.fill(value, { timeout: 4_000 });
            return selector;
        } catch (_) {}
    }
    return '';
}

async function tryClick(page, selectors) {
    for (const selector of selectors) {
        if (!selector) continue;
        try {
            const locator = page.locator(selector).first();
            await locator.waitFor({ state: 'visible', timeout: 4_000 });
            await locator.click({ timeout: 4_000 });
            return selector;
        } catch (_) {}
    }
    return '';
}

async function tryClickByText(page, texts) {
    for (const text of texts) {
        if (!text) continue;
        const escaped = text.replace(/"/g, '\\"');
        const candidates = [
            `button:has-text("${escaped}")`,
            `[role="button"]:has-text("${escaped}")`,
            `a:has-text("${escaped}")`,
            `li:has-text("${escaped}")`,
            `span:has-text("${escaped}")`
        ];
        const clicked = await tryClick(page, candidates);
        if (clicked) return clicked;
    }
    return '';
}

async function ensureLoggedIn(page) {
    const isLoginUrl = String(page.url() || '').toLowerCase().includes('/login');
    let hasPasswordInput = false;
    try {
        hasPasswordInput = await page.locator('input[type="password"]').first().isVisible({ timeout: 2_000 });
    } catch (_) {}
    if (!isLoginUrl && !hasPasswordInput) return false;
    if (!USERNAME || !PASSWORD) {
        throw new Error('SCA_WEB_USERNAME/SCA_WEB_PASSWORD ausentes no .env.');
    }

    if (!isLoginUrl) {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    }

    const userSelectors = [
        LOGIN_USER_SELECTOR,
        'input[name="login"]',
        'input[name="email"]',
        'input[type="email"]',
        'input[type="text"]'
    ];
    const passSelectors = [
        LOGIN_PASSWORD_SELECTOR,
        'input[name="senha"]',
        'input[name="password"]',
        'input[type="password"]'
    ];
    const submitSelectors = [
        LOGIN_SUBMIT_SELECTOR,
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Entrar")',
        'button:has-text("Acessar")',
        'button:has-text("Login")'
    ];

    const userSel = await tryFill(page, userSelectors, USERNAME);
    const passSel = await tryFill(page, passSelectors, PASSWORD);
    if (!userSel || !passSel) {
        throw new Error('Nao foi possivel localizar os campos de login/senha automaticamente. Configure os seletores no .env.');
    }

    const submitSel = await tryClick(page, submitSelectors) || await tryClickByText(page, ['Entrar', 'Acessar', 'Login']);
    if (!submitSel) {
        throw new Error('Nao foi possivel localizar o botao de login automaticamente. Configure SCA_WEB_LOGIN_SUBMIT_SELECTOR.');
    }

    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
    await sleep(1_000);
    return true;
}

async function openAlunosAndDownload(page) {
    await page.goto(ALUNOS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
    await sleep(CLICK_DELAY_MS);

    const downloadTriggerSelectors = [
        DOWNLOAD_TRIGGER_SELECTOR,
        '[data-testid="download"]',
        'button[title*="Download"]',
        'button:has-text("Download")',
        '[role="button"]:has-text("Download")',
        'a:has-text("Download")'
    ];

    const exportActionSelectors = [
        EXPORT_ACTION_SELECTOR,
        'li:has-text("Export")',
        'button:has-text("Export")',
        '[role="menuitem"]:has-text("Export")',
        'a:has-text("Export")'
    ];

    const clickedDownload = await tryClick(page, downloadTriggerSelectors) || await tryClickByText(page, ['Download', 'Baixar']);
    if (!clickedDownload) {
        throw new Error('Nao foi possivel clicar no botao de download. Configure SCA_WEB_DOWNLOAD_TRIGGER_SELECTOR no .env.');
    }
    await sleep(CLICK_DELAY_MS);

    const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT_MS });
    const clickedExport = await tryClick(page, exportActionSelectors) || await tryClickByText(page, [EXPORT_ACTION_TEXT, 'Exportar', 'Export']);
    if (!clickedExport) {
        throw new Error('Nao foi possivel clicar na opcao de exportacao. Configure SCA_WEB_EXPORT_ACTION_SELECTOR no .env.');
    }

    const download = await downloadPromise;
    ensureDir(DOWNLOAD_DIR);
    const suggested = sanitizeFileName(download.suggestedFilename() || `${FILE_PREFIX}-${getStamp()}.xls`) || `${FILE_PREFIX}-${getStamp()}.xls`;
    const rawPath = path.join(DOWNLOAD_DIR, suggested);
    await download.saveAs(rawPath);
    return rawPath;
}

function convertWorkbookToCsv(sourceFile) {
    const workbook = XLSX.readFile(sourceFile, { cellDates: true, raw: false });
    if (!workbook.SheetNames.length) {
        throw new Error(`Arquivo exportado sem planilhas: ${sourceFile}`);
    }
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' })
        .map((row) => row.map((value) => {
            if (typeof value !== 'string') return value;
            return decodeHtmlEntities(value);
        }));
    const normalizedSheet = XLSX.utils.aoa_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(normalizedSheet, {
        FS: ',',
        RS: '\n',
        strip: false,
        blankrows: false
    });
    ensureDir(EXPORT_DIR);
    const outName = `${FILE_PREFIX}-${getStamp()}.csv`;
    const outPath = path.join(EXPORT_DIR, outName);
    fs.writeFileSync(outPath, csv, 'utf8');
    return outPath;
}

async function run() {
    if (!ENABLED) {
        log('SCA web exporter desativado (SCA_WEB_ENABLED=0).');
        return;
    }
    ensureDir(DOWNLOAD_DIR);
    ensureDir(EXPORT_DIR);
    ensureDir(USER_DATA_DIR);

    let context;
    try {
        const launchOpts = {
            headless: HEADLESS,
            acceptDownloads: true,
            viewport: { width: 1600, height: 900 }
        };
        if (BROWSER_EXECUTABLE_PATH) {
            launchOpts.executablePath = BROWSER_EXECUTABLE_PATH;
        } else if (BROWSER_CHANNEL) {
            launchOpts.channel = BROWSER_CHANNEL;
        }

        context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);
        const page = context.pages()[0] || await context.newPage();
        page.setDefaultTimeout(TIMEOUT_MS);

        await page.goto(ALUNOS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        const didLogin = await ensureLoggedIn(page);
        if (didLogin) {
            await page.goto(ALUNOS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        }

        const rawPath = await openAlunosAndDownload(page);
        log(`Arquivo baixado: ${rawPath}`);

        if (CONVERT_TO_CSV) {
            const csvPath = convertWorkbookToCsv(rawPath);
            log(`Arquivo convertido para CSV: ${csvPath}`);
        }

        if (!KEEP_RAW_FILES) {
            try {
                fs.unlinkSync(rawPath);
                log(`Arquivo bruto removido: ${rawPath}`);
            } catch (_) {}
        }

        log('Exportacao SCA finalizada com sucesso.');
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
    }
}

run().catch((error) => {
    log(`Erro no SCA web export: ${error?.message || error}`);
    process.exitCode = 1;
});
