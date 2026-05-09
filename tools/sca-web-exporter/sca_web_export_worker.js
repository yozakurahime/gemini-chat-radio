const fs = require('fs');
const path = require('path');
const os = require('os');
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
const PERSISTENT_PROFILE_ENABLED = String(process.env.SCA_WEB_PERSISTENT_PROFILE || '1').trim() !== '0';
const WEB_SYNC_ENABLED = String(process.env.SCA_WEB_SYNC_ENABLED || '1').trim() !== '0';
const WEB_SYNC_API_URL = String(process.env.SCA_WEB_SYNC_API_URL || 'https://www.academiaoxigenio.com/admin/sca/students/sync/batch').trim();
const WEB_SYNC_TOKEN = String(process.env.SCA_WEB_SYNC_TOKEN || process.env.SCA_SYNC_TOKEN || '').trim();
const WEB_SYNC_SOURCE = String(process.env.SCA_WEB_SYNC_SOURCE || 'sca_web_export').trim();
const WEB_SYNC_BATCH_SIZE = Math.max(20, Math.min(2000, Number(process.env.SCA_WEB_SYNC_BATCH_SIZE || 300)));
const DIAG_ENABLED = String(process.env.SCA_WEB_DIAG_ENABLED || '1').trim() !== '0';
const DIAG_API_URL = String(process.env.SCA_WEB_DIAG_API_URL || 'https://www.academiaoxigenio.com/admin/sca/connector/diagnostic').trim();
const DIAG_TOKEN = String(process.env.SCA_WEB_DIAG_TOKEN || WEB_SYNC_TOKEN || process.env.SCA_SYNC_TOKEN || '').trim();
const DIAG_CONNECTOR = String(process.env.SCA_WEB_DIAG_CONNECTOR || 'sca-web-exporter').trim() || 'sca-web-exporter';

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

function truncateText(value, max = 800) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (text.length <= max) return text;
    return text.slice(0, max);
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

function normalizePhoneDigits(phoneRaw) {
    const digits = String(phoneRaw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
}

function normalizeText(value, maxLen = 200) {
    const text = decodeHtmlEntities(String(value === undefined || value === null ? '' : value)).trim();
    if (!text) return '';
    return text.slice(0, maxLen);
}

function sanitizeCpf(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.slice(0, 14);
}

function toStudentRow(row) {
    const pick = (...keys) => {
        for (const key of keys) {
            if (row[key] === undefined || row[key] === null) continue;
            const text = normalizeText(row[key]);
            if (text) return text;
        }
        return '';
    };
    return {
        full_name: pick('Nome-Completo', 'Nome Completo', 'Nome', 'Aluno'),
        email: pick('E-mail', 'Email'),
        phone_1: normalizePhoneDigits(pick('Telefone-1', 'Telefone 1', 'Telefone')),
        phone_2: normalizePhoneDigits(pick('Telefone-2', 'Telefone 2', 'Celular')),
        address: pick('Endereco', 'Endereço', 'Logradouro'),
        number: pick('Numero', 'Número'),
        complement: pick('Complemento'),
        neighborhood: pick('Bairro'),
        cep: pick('Cep', 'CEP'),
        city: pick('Cidade'),
        state: pick('Estado', 'UF'),
        cpf: sanitizeCpf(pick('CPF')),
        plan: pick('Plano', 'Modalidade')
    };
}

async function postStudentsBatch(rows, connector = {}) {
    const response = await fetch(WEB_SYNC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-SCA-TOKEN': WEB_SYNC_TOKEN
        },
        body: JSON.stringify({
            source: WEB_SYNC_SOURCE,
            rows,
            connector
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || `http_${response.status}`);
    }
    return data;
}

async function syncStudentsToServer(students, connector = {}) {
    if (!WEB_SYNC_ENABLED) {
        log('Envio para servidor desativado (SCA_WEB_SYNC_ENABLED=0).');
        return;
    }
    if (!WEB_SYNC_TOKEN) {
        log('SCA_WEB_SYNC_TOKEN ausente; pulando envio para servidor.');
        return;
    }
    if (!students.length) {
        log('Nenhuma linha valida de aluno para enviar.');
        return;
    }
    let sent = 0;
    let inserted = 0;
    let updated = 0;
    for (let i = 0; i < students.length; i += WEB_SYNC_BATCH_SIZE) {
        const chunk = students.slice(i, i + WEB_SYNC_BATCH_SIZE);
        const result = await postStudentsBatch(chunk, connector);
        sent += chunk.length;
        inserted += Number(result.inserted_count || 0);
        updated += Number(result.updated_count || 0);
        log(`Lote alunos enviado: ${chunk.length} | inserted=${result.inserted_count || 0} updated=${result.updated_count || 0}`);
    }
    log(`Envio concluido: enviados=${sent} inserted=${inserted} updated=${updated}`);
}

async function sendDiagnostic(level, event, message, extra = {}) {
    if (!DIAG_ENABLED || !DIAG_TOKEN) return;
    try {
        await fetch(DIAG_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-SCA-TOKEN': DIAG_TOKEN
            },
            body: JSON.stringify({
                connector: DIAG_CONNECTOR,
                level: String(level || 'info'),
                event: String(event || 'runtime_event'),
                message: truncateText(message || '', 1500),
                host: os.hostname(),
                pid: process.pid,
                at: Date.now(),
                meta: extra && typeof extra === 'object' ? extra : {}
            })
        });
    } catch (_) {}
}

function buildLaunchBaseOptions(headless) {
    const options = {
        headless: !!headless
    };
    if (BROWSER_EXECUTABLE_PATH) {
        options.executablePath = BROWSER_EXECUTABLE_PATH;
    } else if (BROWSER_CHANNEL) {
        options.channel = BROWSER_CHANNEL;
    }
    return options;
}

async function launchBrowserWithFallback() {
    const variants = [];
    if (PERSISTENT_PROFILE_ENABLED) {
        variants.push({ kind: 'persistent', headless: HEADLESS, label: `persistent-${HEADLESS ? 'headless' : 'headed'}` });
        if (HEADLESS) {
            variants.push({ kind: 'persistent', headless: false, label: 'persistent-headed-fallback' });
        }
    }
    variants.push({ kind: 'ephemeral', headless: HEADLESS, label: `ephemeral-${HEADLESS ? 'headless' : 'headed'}` });
    if (HEADLESS) {
        variants.push({ kind: 'ephemeral', headless: false, label: 'ephemeral-headed-fallback' });
    }

    let lastError = null;
    for (const variant of variants) {
        try {
            const baseOpts = buildLaunchBaseOptions(variant.headless);
            if (variant.kind === 'persistent') {
                const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
                    ...baseOpts,
                    acceptDownloads: true,
                    viewport: { width: 1600, height: 900 }
                });
                log(`Navegador iniciado em modo ${variant.label}.`);
                return { context, browser: null, mode: variant.label };
            }

            const browser = await chromium.launch(baseOpts);
            const context = await browser.newContext({
                acceptDownloads: true,
                viewport: { width: 1600, height: 900 }
            });
            log(`Navegador iniciado em modo ${variant.label}.`);
            return { context, browser, mode: variant.label };
        } catch (error) {
            lastError = error;
            log(`Falha ao iniciar navegador (${variant.label}): ${error?.message || error}`);
        }
    }
    throw lastError || new Error('browser_launch_failed');
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

async function triggerScaPostbackByToken(page, tokens) {
    const normalized = (Array.isArray(tokens) ? tokens : [])
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean);
    if (!normalized.length) return '';
    const hit = await page.evaluate((tokenList) => {
        const nodes = Array.from(document.querySelectorAll('a[href], button[onclick], span[onclick], div[onclick], li[onclick]'));
        const getMeta = (el) => {
            const attrs = [
                el.getAttribute('href') || '',
                el.getAttribute('onclick') || '',
                el.id || '',
                el.className || '',
                el.getAttribute('title') || '',
                el.getAttribute('aria-label') || '',
                el.textContent || ''
            ].join(' ').toLowerCase();
            return attrs;
        };
        for (const el of nodes) {
            const meta = getMeta(el);
            if (!tokenList.some((token) => meta.includes(token))) continue;
            try {
                const href = String(el.getAttribute('href') || '');
                if (href.toLowerCase().startsWith('javascript:')) {
                    // eslint-disable-next-line no-eval
                    eval(href.slice('javascript:'.length));
                } else if (typeof el.click === 'function') {
                    el.click();
                }
                return meta.slice(0, 180);
            } catch (_) {}
        }
        return '';
    }, normalized);
    return String(hit || '').trim();
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

    const clickedDownload = await tryClick(page, downloadTriggerSelectors)
        || await tryClickByText(page, ['Download', 'Baixar'])
        || await triggerScaPostbackByToken(page, ['download', 'baixar', 'btnDown', 'sbDown', 'exportacao', 'exportação']);
    if (!clickedDownload) {
        throw new Error('Nao foi possivel clicar no botao de download. Configure SCA_WEB_DOWNLOAD_TRIGGER_SELECTOR no .env.');
    }
    await sleep(CLICK_DELAY_MS);

    const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT_MS });
    const clickedExport = await tryClick(page, exportActionSelectors)
        || await tryClickByText(page, [EXPORT_ACTION_TEXT, 'Exportar', 'Export'])
        || await triggerScaPostbackByToken(page, ['sbEx', 'btnEx', 'export']);
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
    const jsonRows = XLSX.utils.sheet_to_json(normalizedSheet, { raw: false, defval: '' });
    const students = jsonRows.map(toStudentRow).filter((row) => row.full_name || row.phone_1 || row.cpf || row.email);
    return { csvPath: outPath, students };
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
    let browser = null;
    const startedAt = Date.now();
    try {
        const launched = await launchBrowserWithFallback();
        context = launched.context;
        browser = launched.browser || null;
        await sendDiagnostic('info', 'browser_started', `Navegador iniciado em ${launched.mode}.`, { mode: launched.mode });
        const page = context.pages()[0] || await context.newPage();
        page.setDefaultTimeout(TIMEOUT_MS);

        await page.goto(ALUNOS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        const didLogin = await ensureLoggedIn(page);
        if (didLogin) {
            await page.goto(ALUNOS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
        }

        const rawPath = await openAlunosAndDownload(page);
        log(`Arquivo baixado: ${rawPath}`);
        await sendDiagnostic('info', 'download_ok', 'Arquivo exportado no SCA com sucesso.', {
            file_name: path.basename(rawPath)
        });

        if (CONVERT_TO_CSV) {
            const converted = convertWorkbookToCsv(rawPath);
            log(`Arquivo convertido para CSV: ${converted.csvPath}`);
            await syncStudentsToServer(converted.students, {
                source: 'sca_web_exporter',
                file_name: path.basename(rawPath),
                generated_csv: path.basename(converted.csvPath),
                exported_at: Date.now()
            });
            await sendDiagnostic('info', 'sync_ok', 'CSV convertido e sincronizado com o servidor.', {
                csv_file: path.basename(converted.csvPath),
                students_count: converted.students.length
            });
        }

        if (!KEEP_RAW_FILES) {
            try {
                fs.unlinkSync(rawPath);
                log(`Arquivo bruto removido: ${rawPath}`);
            } catch (_) {}
        }

        log('Exportacao SCA finalizada com sucesso.');
        await sendDiagnostic('info', 'run_ok', 'Execucao concluida sem erros.', {
            duration_ms: Date.now() - startedAt
        });
    } finally {
        if (context) {
            await context.close().catch(() => {});
        }
        if (browser) {
            await browser.close().catch(() => {});
        }
    }
}

run().catch((error) => {
    log(`Erro no SCA web export: ${error?.message || error}`);
    sendDiagnostic('error', 'run_error', `Erro no SCA web export: ${error?.message || error}`, {
        stack: truncateText(error?.stack || '', 3000)
    }).catch(() => {});
    process.exitCode = 1;
});
