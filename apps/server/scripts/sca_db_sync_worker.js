const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const LOG_FILE = process.env.SCA_DB_SYNC_LOG_FILE
    ? path.resolve(process.env.SCA_DB_SYNC_LOG_FILE)
    : path.join(ROOT_DIR, 'logs', 'sca-db-sync.log');
const CURSOR_FILE = process.env.SCA_DB_SYNC_CURSOR_FILE
    ? path.resolve(process.env.SCA_DB_SYNC_CURSOR_FILE)
    : path.join(ROOT_DIR, 'runtime', 'sca_db_sync_cursor.json');
const PROFILE_FILE = process.env.SCA_DB_PROFILE_FILE
    ? path.resolve(process.env.SCA_DB_PROFILE_FILE)
    : path.join(ROOT_DIR, 'tools', 'sca-sync', 'sca_db_profile.json');
const DB_DIR = process.env.SCA_DB_DIR ? path.resolve(process.env.SCA_DB_DIR) : 'C:\\SistemaSCA';
const DB_FILE_OVERRIDE = process.env.SCA_DB_FILE ? path.resolve(process.env.SCA_DB_FILE) : '';
const DB_ENGINE = String(process.env.SCA_DB_ENGINE || 'auto').toLowerCase().trim();
const DB_USER = String(process.env.SCA_DB_USER || '').trim();
const DB_PASSWORD = String(process.env.SCA_DB_PASSWORD || '').trim();
const DB_CONNECTION_STRING = String(process.env.SCA_DB_CONNECTION_STRING || '').trim();
const DB_ODBC_DRIVER = String(process.env.SCA_DB_ODBC_DRIVER || '').trim();
const API_URL = process.env.SCA_SYNC_API_URL || 'https://www.academiaoxigenio.com/admin/sca/sync/batch';
const SOURCE = process.env.SCA_SYNC_SOURCE || 'sca_db';
const TOKEN = String(process.env.SCA_SYNC_TOKEN || '').trim();
const ENABLED = process.env.SCA_SYNC_ENABLED === '1';
const MODE = String(process.env.SCA_SYNC_MODE || 'db').toLowerCase().trim();
const BATCH_SIZE = Math.max(10, Math.min(2000, Number(process.env.SCA_SYNC_BATCH_SIZE || 500)));
const FETCH_WINDOW = Math.max(BATCH_SIZE, Math.min(100000, Number(process.env.SCA_DB_FETCH_WINDOW || 10000)));
const LOG_ROTATE_BYTES = Math.max(256 * 1024, Number(process.env.SCA_SYNC_LOG_ROTATE_BYTES || (5 * 1024 * 1024)));
const SOURCE_HINTS = ['sca', 'acesso', 'catraca', 'controle', 'movimento', 'evento', 'access', 'gym', 'academia'];

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
        fs.renameSync(LOG_FILE, `${LOG_FILE}.${stamp}`);
    } catch (_) {}
}

function log(message) {
    ensureDir(LOG_FILE);
    rotateLogIfNeeded();
    const line = `[${new Date().toISOString()}] ${message}`;
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    console.log(line);
}

function readJsonFile(filePath, fallback = null) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function writeJsonFile(filePath, value) {
    ensureDir(filePath);
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
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
    if (!value) return 'access';
    if (['entrada', 'entry', 'in', 'entrou', 'acesso', 'acesso liberado', 'liberado'].includes(value)) return 'entry';
    if (['saida', 'exit', 'out', 'saiu'].includes(value)) return 'exit';
    if (['denied', 'negado', 'bloqueado', 'recusado'].includes(value)) return 'denied';
    if (['access', 'acesso permitido'].includes(value)) return 'access';
    return 'access';
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
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
    if (br) {
        const parsed = new Date(
            Number(br[3]),
            Number(br[2]) - 1,
            Number(br[1]),
            Number(br[4] || 0),
            Number(br[5] || 0),
            Number(br[6] || 0),
            0
        ).getTime();
        return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarker(value) {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';
    if (/^-?\d+$/.test(text)) return String(Number(text));
    return text;
}

function compareMarkers(a, b) {
    const av = normalizeMarker(a);
    const bv = normalizeMarker(b);
    if (!av && !bv) return 0;
    if (!av) return -1;
    if (!bv) return 1;
    const an = /^-?\d+$/.test(av) ? Number(av) : null;
    const bn = /^-?\d+$/.test(bv) ? Number(bv) : null;
    if (an !== null && bn !== null) return an - bn;
    return av.localeCompare(bv);
}

function hashSourceEvent(parts) {
    return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

function detectEngineFromFile(filePath) {
    const ext = path.extname(filePath || '').toLowerCase();
    if (ext === '.fdb') return 'firebird';
    if (ext === '.mdb' || ext === '.accdb') return 'access';
    if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') return 'sqlite';
    return '';
}

function scoreCandidate(filePath, stat, engine) {
    const fileName = path.basename(filePath).toLowerCase();
    let score = Number(stat?.mtimeMs || 0);
    if (engine === 'sqlite') score += 1_000_000;
    if (engine === 'firebird') score += 900_000;
    if (engine === 'access') score += 800_000;
    for (const hint of SOURCE_HINTS) {
        if (fileName.includes(hint)) score += 250_000;
    }
    const size = Number(stat?.size || 0);
    if (size > 0) score += Math.min(size, 500 * 1024 * 1024) / 512;
    return score;
}

function listDbCandidates(rootDir) {
    const out = [];
    const stack = [rootDir];
    const limit = 6000;
    while (stack.length && out.length < limit) {
        const current = stack.pop();
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (_) {
            continue;
        }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.isFile()) continue;
            const engine = detectEngineFromFile(full);
            if (!engine) continue;
            try {
                const stat = fs.statSync(full);
                out.push({
                    engine,
                    file: full,
                    mtimeMs: Number(stat.mtimeMs || 0),
                    size: Number(stat.size || 0),
                    score: scoreCandidate(full, stat, engine)
                });
            } catch (_) {}
        }
    }
    out.sort((a, b) => b.score - a.score);
    return out;
}

function pickDbCandidate(candidates, preferredEngine) {
    if (!candidates.length) return null;
    if (preferredEngine && preferredEngine !== 'auto') {
        const exact = candidates.find((row) => row.engine === preferredEngine);
        if (exact) return exact;
    }
    return candidates[0];
}

function runPowerShellJson(script, envExtra = {}) {
    const ps = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        {
            env: { ...process.env, ...envExtra },
            encoding: 'utf8',
            maxBuffer: 20 * 1024 * 1024
        }
    );
    if (ps.status !== 0) {
        const stderr = String(ps.stderr || '').trim() || String(ps.stdout || '').trim();
        throw new Error(stderr || `powershell_exit_${ps.status}`);
    }
    const text = String(ps.stdout || '').trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`powershell_json_parse_failed: ${error?.message || error}`);
    }
}

function getOdbcDrivers() {
    const script = `
$ErrorActionPreference = 'Stop'
$rows = @()
try {
  $odbcCmd = Get-Command Get-OdbcDriver -ErrorAction SilentlyContinue
  if ($odbcCmd) {
    $odbcRows = Get-OdbcDriver -ErrorAction SilentlyContinue
    foreach ($d in $odbcRows) {
      if ($d -and $d.Name) { $rows += [string]$d.Name }
    }
  }
} catch {}
$regPaths = @(
  'HKLM:\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers',
  'HKLM:\\SOFTWARE\\WOW6432Node\\ODBC\\ODBCINST.INI\\ODBC Drivers'
)
foreach ($regPath in $regPaths) {
  try {
    $item = Get-ItemProperty -Path $regPath -ErrorAction Stop
    foreach ($prop in $item.PSObject.Properties) {
      if ($prop.Name -match '^PS(.*)') { continue }
      if ([string]$prop.Value -match 'Installed') {
        $rows += [string]$prop.Name
      }
    }
  } catch {}
}
$rows = $rows | Where-Object { $_ } | Sort-Object -Unique
@{ drivers = $rows } | ConvertTo-Json -Compress -Depth 4
`;
    const data = runPowerShellJson(script);
    return Array.isArray(data?.drivers) ? data.drivers.map((v) => String(v || '').trim()).filter(Boolean) : [];
}

function runOdbc(mode, connectionString, query = '') {
    const script = `
$ErrorActionPreference = 'Stop'
$connString = $env:SCA_ODBC_CONN
$mode = $env:SCA_ODBC_MODE
$query = $env:SCA_ODBC_QUERY
$conn = New-Object System.Data.Odbc.OdbcConnection($connString)
$conn.Open()
try {
  if ($mode -eq 'schema') {
    $tablesRaw = $conn.GetSchema('Tables')
    $tableNames = @()
    foreach ($row in $tablesRaw.Rows) {
      $tType = [string]$row['TABLE_TYPE']
      $name = [string]$row['TABLE_NAME']
      if (-not $name) { continue }
      if ($tType -and $tType -notmatch 'TABLE|VIEW') { continue }
      if ($tableNames -notcontains $name) { $tableNames += $name }
    }
    $tables = @()
    foreach ($tableName in $tableNames) {
      $colsSchema = $conn.GetSchema('Columns', @($null, $null, $tableName, $null))
      $cols = @()
      foreach ($c in $colsSchema.Rows) {
        $cols += [ordered]@{
          name = [string]$c['COLUMN_NAME']
          type = [string]$c['TYPE_NAME']
        }
      }
      $tables += [ordered]@{ name = [string]$tableName; columns = $cols }
    }
    @{ tables = $tables } | ConvertTo-Json -Compress -Depth 8
  } elseif ($mode -eq 'query') {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $query
    $da = New-Object System.Data.Odbc.OdbcDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    [void]$da.Fill($dt)
    $rows = @()
    foreach ($r in $dt.Rows) {
      $obj = [ordered]@{}
      foreach ($col in $dt.Columns) {
        $name = [string]$col.ColumnName
        $value = $r[$col]
        if ($value -is [System.DBNull]) { $value = $null }
        $obj[$name] = $value
      }
      $rows += $obj
    }
    @{ rows = $rows } | ConvertTo-Json -Compress -Depth 8
  } else {
    @{ ok = $true } | ConvertTo-Json -Compress -Depth 4
  }
} finally {
  $conn.Close()
}
`;
    return runPowerShellJson(script, {
        SCA_ODBC_CONN: connectionString,
        SCA_ODBC_MODE: mode,
        SCA_ODBC_QUERY: query
    });
}

function buildOdbcConnectionCandidates(engine, dbFile, drivers) {
    if (DB_CONNECTION_STRING) return [DB_CONNECTION_STRING];
    const user = DB_USER || 'SYSDBA';
    const pass = DB_PASSWORD || 'masterkey';
    if (engine === 'access') {
        const preferred = DB_ODBC_DRIVER || 'Microsoft Access Driver (*.mdb, *.accdb)';
        const list = [preferred, ...drivers.filter((d) => /access|ace|mdb|accdb/i.test(String(d || '')))];
        const unique = [...new Set(list.filter(Boolean))];
        return unique.map((driver) => `Driver={${driver}};Dbq=${dbFile};Uid=${DB_USER};Pwd=${DB_PASSWORD};`);
    }
    if (engine === 'firebird') {
        const preferred = DB_ODBC_DRIVER || '';
        const firebirdDrivers = drivers.filter((d) => /firebird|interbase/i.test(d));
        const list = [...new Set([preferred, ...firebirdDrivers, 'Firebird/InterBase(r) driver'].filter(Boolean))];
        const candidates = [];
        for (const driver of list) {
            candidates.push(`Driver={${driver}};Dbname=${dbFile};Uid=${user};Pwd=${pass};`);
            candidates.push(`Driver={${driver}};Database=${dbFile};Uid=${user};Pwd=${pass};`);
        }
        return candidates;
    }
    return [];
}

function findBestByHints(candidates, hints) {
    let best = '';
    let bestScore = -1;
    for (const candidate of candidates) {
        const lower = String(candidate || '').toLowerCase();
        let score = 0;
        for (const hint of hints) {
            if (lower === hint) score += 1000;
            else if (lower.includes(hint)) score += 100;
        }
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best || '';
}

function scoreTable(table, requiredCols, optionalCols) {
    const name = String(table?.name || '').toLowerCase();
    const cols = Array.isArray(table?.columns) ? table.columns.map((c) => String(c?.name || '').toLowerCase()) : [];
    let score = 0;
    if (/acess|catraca|event|mov|log|registro/.test(name)) score += 200;
    for (const [logical, hints] of Object.entries(requiredCols)) {
        const has = findBestByHints(cols, hints);
        if (!has) return -1;
        score += logical === 'event_at' ? 300 : 200;
    }
    for (const hints of Object.values(optionalCols)) {
        if (findBestByHints(cols, hints)) score += 20;
    }
    return score;
}

function discoverProfile(schema, engine, dbFile) {
    const required = {
        event_at: ['event_at', 'data_hora', 'datahora', 'datetime', 'timestamp', 'dt_evento', 'data'],
        identity: ['external_id', 'matricula', 'matricula_id', 'id_aluno', 'aluno_id', 'phone', 'telefone', 'celular']
    };
    const optional = {
        event_type: ['event_type', 'tipo', 'evento', 'movimento', 'acao', 'direction'],
        external_id: ['external_id', 'matricula', 'id_aluno', 'aluno_id', 'codigo', 'cod_aluno'],
        name: ['name', 'nome', 'aluno', 'cliente'],
        phone: ['phone', 'telefone', 'celular', 'whatsapp', 'fone'],
        status: ['status', 'situacao', 'situacao_atual', 'resultado'],
        plan: ['plano', 'plan', 'modalidade'],
        gate: ['catraca', 'gate', 'equipamento', 'unidade', 'dispositivo'],
        source_marker: ['id', 'codigo', 'cod', 'seq', 'sequencia', 'registro', 'rowid']
    };
    const tables = Array.isArray(schema?.tables) ? schema.tables : [];
    let best = null;
    let bestScore = -1;
    for (const table of tables) {
        const score = scoreTable(table, required, optional);
        if (score > bestScore) {
            bestScore = score;
            best = table;
        }
    }
    if (!best || bestScore < 0) {
        throw new Error('Nao foi possivel descobrir tabela de eventos do SCA automaticamente.');
    }
    const cols = Array.isArray(best.columns) ? best.columns.map((c) => String(c.name || '')) : [];
    const lowerToOriginal = new Map(cols.map((c) => [c.toLowerCase(), c]));
    const pick = (hints) => {
        const found = findBestByHints([...lowerToOriginal.keys()], hints);
        return found ? lowerToOriginal.get(found) || '' : '';
    };
    const tableName = String(best.name || '');
    const profile = {
        version: 1,
        generated_at: Date.now(),
        engine,
        db_file: dbFile,
        table: tableName,
        columns: {
            external_id: pick(optional.external_id),
            name: pick(optional.name),
            phone: pick(optional.phone),
            event_type: pick(optional.event_type),
            event_at: pick(required.event_at),
            status: pick(optional.status),
            plan: pick(optional.plan),
            gate: pick(optional.gate),
            source_marker: pick(optional.source_marker)
        }
    };
    if (!profile.columns.event_at) {
        throw new Error('Nao foi possivel mapear coluna de data/hora do evento.');
    }
    return profile;
}

function normalizeIdentifier(engine, ident) {
    const value = String(ident || '').trim();
    if (!value) return '';
    if (engine === 'access') return '[' + value.replace(/]/g, ']]') + ']';
    if (engine === 'sqlite') return `"${value.replace(/"/g, '""')}"`;
    return value;
}

function buildSelectSql(engine, profile) {
    const table = normalizeIdentifier(engine, profile.table);
    const cols = profile.columns || {};
    const colExpr = (name, alias) => {
        const col = String(cols[name] || '').trim();
        if (!col) return `NULL AS ${alias}`;
        return `${normalizeIdentifier(engine, col)} AS ${alias}`;
    };
    const orderByKey = cols.source_marker ? normalizeIdentifier(engine, cols.source_marker) : normalizeIdentifier(engine, cols.event_at);
    const projection = [
        colExpr('external_id', 'external_id'),
        colExpr('name', 'name'),
        colExpr('phone', 'phone'),
        colExpr('event_type', 'event_type'),
        colExpr('event_at', 'event_at'),
        colExpr('status', 'status'),
        colExpr('plan', 'plan'),
        colExpr('gate', 'gate'),
        colExpr('source_marker', 'source_marker')
    ].join(', ');
    if (engine === 'access') {
        return `SELECT TOP ${FETCH_WINDOW} ${projection} FROM ${table} ORDER BY ${orderByKey} DESC`;
    }
    if (engine === 'firebird') {
        return `SELECT FIRST ${FETCH_WINDOW} ${projection} FROM ${table} ORDER BY ${orderByKey} DESC`;
    }
    return `SELECT ${projection} FROM ${table} ORDER BY ${orderByKey} DESC LIMIT ${FETCH_WINDOW}`;
}

class SQLiteAdapter {
    constructor(dbFile) {
        this.dbFile = dbFile;
        this.db = null;
    }

    open() {
        this.db = new Database(this.dbFile, { readonly: true, fileMustExist: true });
    }

    close() {
        if (this.db) this.db.close();
        this.db = null;
    }

    getSchema() {
        const rows = this.db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type IN ('table', 'view')
              AND name NOT LIKE 'sqlite_%'
            ORDER BY name ASC
        `).all();
        const tables = rows.map((row) => {
            const tableName = String(row.name || '');
            const cols = this.db.prepare(`PRAGMA table_info("${tableName.replace(/"/g, '""')}")`).all();
            return {
                name: tableName,
                columns: cols.map((c) => ({ name: String(c.name || ''), type: String(c.type || '') }))
            };
        });
        return { tables };
    }

    query(sql) {
        return this.db.prepare(sql).all();
    }
}

class OdbcAdapter {
    constructor(engine, dbFile) {
        this.engine = engine;
        this.dbFile = dbFile;
        this.connectionString = '';
        this.schemaCache = null;
    }

    open() {
        const drivers = getOdbcDrivers();
        const candidates = buildOdbcConnectionCandidates(this.engine, this.dbFile, drivers);
        if (this.engine === 'access' && !DB_CONNECTION_STRING) {
            const accessDrivers = drivers.filter((d) => /access|ace|mdb|accdb/i.test(String(d || '')));
            if (!accessDrivers.length) {
                throw new Error(`Nenhum driver ODBC Access instalado. Drivers detectados: ${drivers.length ? drivers.join(', ') : '(nenhum)'}`);
            }
        }
        if (!candidates.length) {
            throw new Error(`Nenhum connection string ODBC disponivel para engine=${this.engine}.`);
        }
        let lastError = '';
        for (const conn of candidates) {
            try {
                const schema = runOdbc('schema', conn);
                if (Array.isArray(schema?.tables) && schema.tables.length) {
                    this.connectionString = conn;
                    this.schemaCache = schema;
                    return;
                }
            } catch (error) {
                lastError = String(error?.message || error);
            }
        }
        throw new Error(`Falha ao conectar via ODBC (${this.engine}). Drivers detectados: ${drivers.length ? drivers.join(', ') : '(nenhum)'} | ${lastError || ''}`.trim());
    }

    close() {}

    getSchema() {
        if (this.schemaCache) return this.schemaCache;
        if (!this.connectionString) throw new Error('ODBC connection string nao inicializada.');
        this.schemaCache = runOdbc('schema', this.connectionString);
        return this.schemaCache;
    }

    query(sql) {
        if (!this.connectionString) throw new Error('ODBC connection string nao inicializada.');
        const data = runOdbc('query', this.connectionString, sql);
        return Array.isArray(data?.rows) ? data.rows : [];
    }
}

function createAdapter(engine, dbFile) {
    if (engine === 'sqlite') return new SQLiteAdapter(dbFile);
    if (engine === 'access' || engine === 'firebird') return new OdbcAdapter(engine, dbFile);
    throw new Error(`Engine nao suportada: ${engine}`);
}

function loadProfile(engine, dbFile) {
    const profile = readJsonFile(PROFILE_FILE, null);
    if (!profile || typeof profile !== 'object') return null;
    if (profile.engine && String(profile.engine).toLowerCase() !== String(engine).toLowerCase()) return null;
    if (profile.db_file && path.resolve(String(profile.db_file)) !== path.resolve(dbFile)) return null;
    if (!profile.table || !profile.columns || !profile.columns.event_at) return null;
    return profile;
}

function saveProfile(profile) {
    writeJsonFile(PROFILE_FILE, profile);
}

function normalizeEventRow(row, engine, dbFile, profile) {
    const externalId = String(row.external_id || '').trim();
    const name = String(row.name || '').trim();
    const phone = normalizePhoneDigits(row.phone || '');
    const eventType = normalizeEventType(row.event_type || '');
    const eventAt = parseEventAt(row.event_at);
    const status = String(row.status || '').trim();
    const plan = String(row.plan || '').trim();
    const gate = String(row.gate || '').trim();
    const sourceMarker = normalizeMarker(row.source_marker);
    if (!externalId && !phone) return { ok: false, error: 'external_id_or_phone_required' };
    if (!Number.isFinite(eventAt) || eventAt <= 0) return { ok: false, error: 'invalid_event_at' };
    const sourceEventId = hashSourceEvent([
        SOURCE,
        engine,
        path.basename(dbFile),
        profile.table,
        sourceMarker,
        externalId,
        phone,
        eventType,
        String(eventAt),
        gate,
        status
    ]);
    return {
        ok: true,
        event: {
            source_event_id: sourceEventId,
            external_id: externalId,
            name,
            phone,
            event_type: eventType,
            event_at: eventAt,
            status,
            plan,
            gate
        },
        marker: sourceMarker,
        eventAt
    };
}

async function postBatch(events, connector) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-SCA-TOKEN': TOKEN
        },
        body: JSON.stringify({
            source: SOURCE,
            events,
            connector
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const reason = data?.error || `http_${response.status}`;
        throw new Error(reason);
    }
    return data;
}

async function run() {
    if (!ENABLED || MODE !== 'db') {
        log('SCA DB sync desativado (SCA_SYNC_ENABLED != 1 ou SCA_SYNC_MODE != db).');
        return;
    }
    if (!TOKEN) throw new Error('SCA_SYNC_TOKEN ausente.');
    if (!DB_FILE_OVERRIDE && (!DB_DIR || !fs.existsSync(DB_DIR))) {
        throw new Error(`Diretorio SCA_DB_DIR invalido: ${DB_DIR || '<vazio>'}`);
    }

    let selected = null;
    if (DB_FILE_OVERRIDE) {
        if (!fs.existsSync(DB_FILE_OVERRIDE)) {
            throw new Error(`SCA_DB_FILE nao encontrado: ${DB_FILE_OVERRIDE}`);
        }
        selected = {
            file: DB_FILE_OVERRIDE,
            engine: detectEngineFromFile(DB_FILE_OVERRIDE)
        };
    } else {
        const candidates = listDbCandidates(DB_DIR);
        selected = pickDbCandidate(candidates, DB_ENGINE);
    }
    if (!selected || !selected.file || !selected.engine) {
        throw new Error('Nenhum banco SCA detectado em C:\\SistemaSCA (ou SCA_DB_DIR).');
    }
    if (DB_ENGINE !== 'auto' && DB_ENGINE !== selected.engine) {
        throw new Error(`Engine detectada (${selected.engine}) diferente de SCA_DB_ENGINE=${DB_ENGINE}.`);
    }

    const cursor = readJsonFile(CURSOR_FILE, {
        engine: '',
        db_file: '',
        last_event_at: 0,
        last_source_marker: ''
    });
    let lastEventAt = Number(cursor?.last_event_at || 0);
    let lastSourceMarker = normalizeMarker(cursor?.last_source_marker || '');

    const adapter = createAdapter(selected.engine, selected.file);
    adapter.open();
    try {
        const schema = adapter.getSchema();
        let profile = loadProfile(selected.engine, selected.file);
        if (!profile) {
            profile = discoverProfile(schema, selected.engine, selected.file);
            saveProfile(profile);
            log(`Perfil de mapeamento gerado automaticamente: ${PROFILE_FILE}`);
        }

        const sql = buildSelectSql(selected.engine, profile);
        const rawRows = adapter.query(sql);
        rawRows.reverse();

        let accepted = 0;
        let rejected = 0;
        let inserted = 0;
        let duplicated = 0;
        let failed = 0;
        let maxEventAt = lastEventAt;
        let maxMarker = lastSourceMarker;
        const queue = [];

        const flushQueue = async () => {
            if (!queue.length) return;
            const connector = {
                source: SOURCE,
                engine_detected: selected.engine,
                db_file: selected.file,
                last_scan_at: Date.now(),
                last_error: '',
                lag_sec: maxEventAt > 0 ? Math.max(0, Math.floor((Date.now() - maxEventAt) / 1000)) : 0,
                meta: {
                    mode: 'db',
                    table: profile.table,
                    batch_size: BATCH_SIZE
                }
            };
            const result = await postBatch(queue.splice(0, queue.length), connector);
            inserted += Number(result.inserted_count || 0);
            duplicated += Number(result.duplicated_count || 0);
            failed += Number(result.failed_count || 0);
        };

        for (const row of rawRows) {
            const normalized = normalizeEventRow(row, selected.engine, selected.file, profile);
            if (!normalized.ok) {
                rejected += 1;
                continue;
            }
            const isNewByTs = normalized.eventAt > lastEventAt;
            const isNewByMarker = normalized.eventAt === lastEventAt && compareMarkers(normalized.marker, lastSourceMarker) > 0;
            if (!isNewByTs && !isNewByMarker) continue;
            accepted += 1;
            queue.push(normalized.event);
            if (
                normalized.eventAt > maxEventAt ||
                (normalized.eventAt === maxEventAt && compareMarkers(normalized.marker, maxMarker) > 0)
            ) {
                maxEventAt = normalized.eventAt;
                maxMarker = normalized.marker;
            }
            if (queue.length >= BATCH_SIZE) {
                await flushQueue();
            }
        }

        await flushQueue();

        const connector = {
            source: SOURCE,
            engine_detected: selected.engine,
            db_file: selected.file,
            last_scan_at: Date.now(),
            last_error: '',
            lag_sec: maxEventAt > 0 ? Math.max(0, Math.floor((Date.now() - maxEventAt) / 1000)) : 0,
            meta: {
                mode: 'db',
                table: profile.table,
                fetched_rows: rawRows.length,
                accepted,
                rejected
            }
        };
        if (accepted === 0) {
            await postBatch([], connector);
        }

        writeJsonFile(CURSOR_FILE, {
            engine: selected.engine,
            db_file: selected.file,
            table: profile.table,
            last_event_at: maxEventAt,
            last_source_marker: maxMarker,
            updated_at: Date.now()
        });

        log(`Resumo sync SCA DB | engine=${selected.engine} table=${profile.table} fetched=${rawRows.length} accepted=${accepted} rejected=${rejected} inserted=${inserted} duplicated=${duplicated} failed=${failed}`);
    } catch (error) {
        const connectorError = {
            source: SOURCE,
            engine_detected: selected.engine,
            db_file: selected.file,
            last_scan_at: Date.now(),
            last_error: String(error?.message || error),
            lag_sec: lastEventAt > 0 ? Math.max(0, Math.floor((Date.now() - lastEventAt) / 1000)) : 0,
            meta: { mode: 'db' }
        };
        try {
            await postBatch([], connectorError);
        } catch (_) {}
        throw error;
    } finally {
        adapter.close();
    }
}

run().catch((error) => {
    log(`Erro no sync SCA DB: ${error?.message || error}`);
    process.exitCode = 1;
});
