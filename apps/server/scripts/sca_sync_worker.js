const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const LOG_FILE = process.env.SCA_SYNC_LOG_FILE
    ? path.resolve(process.env.SCA_SYNC_LOG_FILE)
    : path.join(ROOT_DIR, 'logs', 'sca-sync.log');
const CURSOR_FILE = process.env.SCA_SYNC_CURSOR_FILE
    ? path.resolve(process.env.SCA_SYNC_CURSOR_FILE)
    : path.join(ROOT_DIR, 'runtime', 'sca_sync_cursor.json');
const EXPORT_DIR = process.env.SCA_EXPORT_DIR ? path.resolve(process.env.SCA_EXPORT_DIR) : '';
const API_URL = process.env.SCA_SYNC_API_URL || `http://127.0.0.1:${process.env.PORT || 3001}/admin/sca/sync/batch`;
const SOURCE = process.env.SCA_SYNC_SOURCE || 'sca_csv';
const TOKEN = String(process.env.SCA_SYNC_TOKEN || '').trim();
const ENABLED = process.env.SCA_SYNC_ENABLED === '1';
const BATCH_SIZE = Math.max(10, Math.min(2000, Number(process.env.SCA_SYNC_BATCH_SIZE || 500)));
const LOG_ROTATE_BYTES = Math.max(256 * 1024, Number(process.env.SCA_SYNC_LOG_ROTATE_BYTES || (5 * 1024 * 1024)));

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
}

function rotateLogIfNeeded() {
    try {
        if (!fs.existsSync(LOG_FILE)) return;
        const stat = fs.statSync(LOG_FILE);
        if (!stat.isFile() || stat.size < LOG_ROTATE_BYTES) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotated = `${LOG_FILE}.${stamp}`;
        fs.renameSync(LOG_FILE, rotated);
    } catch (_) {}
}

function log(message) {
    ensureDir(LOG_FILE);
    rotateLogIfNeeded();
    const line = `[${new Date().toISOString()}] ${message}`;
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    console.log(line);
}

function loadCursor() {
    try {
        if (!fs.existsSync(CURSOR_FILE)) return { file: '', line: 0, updated_at: 0 };
        const raw = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
        return {
            file: String(raw.file || ''),
            line: Math.max(0, Number(raw.line || 0)),
            updated_at: Number(raw.updated_at || 0)
        };
    } catch (_) {
        return { file: '', line: 0, updated_at: 0 };
    }
}

function saveCursor(next) {
    ensureDir(CURSOR_FILE);
    const payload = {
        file: String(next.file || ''),
        line: Math.max(0, Number(next.line || 0)),
        updated_at: Date.now()
    };
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(payload, null, 2));
}

function normalizePhoneDigits(phoneRaw) {
    const digits = String(phoneRaw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
}

function normalizeEventType(raw) {
    const value = String(raw || '').toLowerCase().trim();
    if (!value) return '';
    if (['entrada', 'entry', 'in', 'entrou', 'acesso'].includes(value)) return 'entry';
    if (['saida', 'saída', 'exit', 'out', 'saiu'].includes(value)) return 'exit';
    if (['denied', 'negado', 'bloqueado', 'recusado'].includes(value)) return 'denied';
    if (['access'].includes(value)) return 'access';
    return '';
}

function parseEventAt(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
        return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
    }
    const value = String(raw || '').trim();
    if (!value) return null;
    if (/^\d+$/.test(value)) {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
    }
    const brMatch = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (brMatch) {
        const day = Number(brMatch[1]);
        const month = Number(brMatch[2]);
        const year = Number(brMatch[3]);
        const hh = Number(brMatch[4] || 0);
        const mm = Number(brMatch[5] || 0);
        const ss = Number(brMatch[6] || 0);
        const parsed = new Date(year, month - 1, day, hh, mm, ss, 0).getTime();
        return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvLine(line) {
    const out = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === ',' && !inQuotes) {
            out.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    out.push(current.trim());
    return out.map((v) => v.replace(/^\uFEFF/, '').trim());
}

function pickValue(row, keys) {
    for (const key of keys) {
        const value = row[key];
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return '';
}

function buildSourceEventId(event) {
    const base = [
        event.external_id,
        event.phone,
        event.event_type,
        event.event_at,
        event.gate,
        event.status,
        event.name
    ].join('|');
    return crypto.createHash('sha1').update(base).digest('hex');
}

function parseCsvFileRecords(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    if (!lines.length) return [];
    const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim().toLowerCase());
    const records = [];
    for (let i = 1; i < lines.length; i += 1) {
        const rawLine = lines[i];
        if (!String(rawLine || '').trim()) continue;
        const values = parseCsvLine(rawLine);
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = values[idx] ?? '';
        });
        records.push({ row, lineNumber: i + 1 });
    }
    return records;
}

function normalizeRecord(record) {
    const row = record.row || {};
    const externalId = pickValue(row, ['external_id', 'matricula', 'matrícula', 'student_id', 'aluno_id', 'id']);
    const name = pickValue(row, ['name', 'nome', 'aluno']);
    const phone = normalizePhoneDigits(pickValue(row, ['phone', 'telefone', 'celular', 'whatsapp']));
    const eventType = normalizeEventType(pickValue(row, ['event_type', 'eventtype', 'tipo', 'evento', 'movimento']));
    const eventAt = parseEventAt(pickValue(row, ['event_at', 'eventat', 'data_hora', 'datetime', 'timestamp', 'occurred_at']));
    const status = pickValue(row, ['status', 'situacao', 'situação']);
    const plan = pickValue(row, ['plan', 'plano']);
    const gate = pickValue(row, ['gate', 'catraca', 'unidade', 'equipamento']);
    if (!externalId && !phone) return { ok: false, error: 'external_id_or_phone_required' };
    if (!eventType) return { ok: false, error: 'invalid_event_type' };
    if (!Number.isFinite(eventAt) || eventAt <= 0) return { ok: false, error: 'invalid_event_at' };
    const event = {
        source_event_id: buildSourceEventId({
            external_id: externalId,
            phone,
            event_type: eventType,
            event_at: eventAt,
            gate,
            status,
            name
        }),
        external_id: externalId,
        name,
        phone,
        event_type: eventType,
        event_at: eventAt,
        status,
        plan,
        gate
    };
    return { ok: true, event };
}

async function postBatch(events) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-SCA-TOKEN': TOKEN
        },
        body: JSON.stringify({
            source: SOURCE,
            events
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const reason = data?.error || `http_${response.status}`;
        throw new Error(reason);
    }
    return data;
}

function listCsvFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter((item) => item.isFile())
        .map((item) => {
            const fullPath = path.join(dir, item.name);
            return {
                name: item.name,
                path: fullPath,
                stat: fs.statSync(fullPath)
            };
        })
        .filter((item) => /\.(csv|txt)$/i.test(item.name));
    entries.sort((a, b) => {
        const byMtime = Number(a.stat.mtimeMs || 0) - Number(b.stat.mtimeMs || 0);
        if (byMtime !== 0) return byMtime;
        return a.name.localeCompare(b.name);
    });
    return entries;
}

function shouldProcessFile(fileName, cursorFile, cursorFound) {
    if (!cursorFile) return true;
    if (cursorFound) return true;
    return fileName === cursorFile;
}

async function run() {
    if (!ENABLED) {
        log('SCA sync desativado (SCA_SYNC_ENABLED != 1).');
        return;
    }
    if (!TOKEN) {
        throw new Error('SCA_SYNC_TOKEN ausente.');
    }
    if (!EXPORT_DIR || !fs.existsSync(EXPORT_DIR)) {
        throw new Error(`Diretorio SCA_EXPORT_DIR invalido: ${EXPORT_DIR || '<vazio>'}`);
    }

    const cursor = loadCursor();
    let cursorFound = !cursor.file;
    const files = listCsvFiles(EXPORT_DIR);
    if (!files.length) {
        log(`Nenhum arquivo CSV/TXT encontrado em ${EXPORT_DIR}.`);
        return;
    }
    if (cursor.file && !files.some((item) => item.name === cursor.file)) {
        cursorFound = true;
    }

    let totalAccepted = 0;
    let totalRejected = 0;
    let totalInserted = 0;
    let totalDuplicated = 0;
    let totalFailed = 0;

    for (const file of files) {
        if (!shouldProcessFile(file.name, cursor.file, cursorFound)) continue;
        if (!cursorFound && file.name === cursor.file) cursorFound = true;

        const records = parseCsvFileRecords(file.path);
        const startLine = file.name === cursor.file ? Math.max(0, Number(cursor.line || 0)) : 0;
        if (startLine >= records.length) {
            saveCursor({ file: file.name, line: records.length });
            continue;
        }

        log(`Processando ${file.name} | registros=${records.length} | inicio=${startLine}`);
        let pending = [];
        let highestProcessedLine = startLine;

        const flushPending = async () => {
            if (!pending.length) return;
            const events = pending.map((item) => item.event);
            const maxLine = Math.max(...pending.map((item) => item.nextLine));
            const result = await postBatch(events);
            totalInserted += Number(result.inserted_count || 0);
            totalDuplicated += Number(result.duplicated_count || 0);
            totalFailed += Number(result.failed_count || 0);
            saveCursor({ file: file.name, line: maxLine });
            highestProcessedLine = Math.max(highestProcessedLine, maxLine);
            log(`Lote enviado ${events.length} eventos | inserted=${result.inserted_count || 0} duplicated=${result.duplicated_count || 0} failed=${result.failed_count || 0}`);
            pending = [];
        };

        for (let idx = startLine; idx < records.length; idx += 1) {
            const record = records[idx];
            const normalized = normalizeRecord(record);
            const nextLine = idx + 1;
            highestProcessedLine = Math.max(highestProcessedLine, nextLine);
            if (!normalized.ok) {
                totalRejected += 1;
                continue;
            }
            totalAccepted += 1;
            pending.push({ event: normalized.event, nextLine });
            if (pending.length >= BATCH_SIZE) {
                await flushPending();
            }
        }

        await flushPending();
        saveCursor({ file: file.name, line: records.length });
        log(`Arquivo concluido ${file.name} | cursor=${records.length}`);
    }

    log(`Resumo sync SCA | accepted=${totalAccepted} rejected=${totalRejected} inserted=${totalInserted} duplicated=${totalDuplicated} failed=${totalFailed}`);
}

run().catch((error) => {
    log(`Erro no sync SCA: ${error?.message || error}`);
    process.exitCode = 1;
});
