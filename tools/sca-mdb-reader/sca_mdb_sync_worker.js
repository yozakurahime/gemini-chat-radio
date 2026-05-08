const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const PROGRAM_ROOT = path.resolve(__dirname);
const ENV_FILE = path.join(PROGRAM_ROOT, '.env');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const lineRaw of lines) {
        const line = String(lineRaw || '').trim();
        if (!line || line.startsWith('#')) continue;
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        if (!key || process.env[key] !== undefined) continue;
        let value = line.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

loadEnvFile(ENV_FILE);

const LOG_FILE = process.env.SCA_DB_SYNC_LOG_FILE
    ? path.resolve(process.env.SCA_DB_SYNC_LOG_FILE)
    : path.join(PROGRAM_ROOT, 'logs', 'sca-db-sync.log');
const CURSOR_FILE = process.env.SCA_DB_SYNC_CURSOR_FILE
    ? path.resolve(process.env.SCA_DB_SYNC_CURSOR_FILE)
    : path.join(PROGRAM_ROOT, 'runtime', 'sca_db_sync_cursor.json');
const PROFILE_FILE = process.env.SCA_DB_PROFILE_FILE
    ? path.resolve(process.env.SCA_DB_PROFILE_FILE)
    : path.join(PROGRAM_ROOT, 'config', 'sca_db_profile.json');

const DB_DIR = process.env.SCA_DB_DIR ? path.resolve(process.env.SCA_DB_DIR) : 'C:\\SistemaSCA';
const DB_FILE_OVERRIDE = process.env.SCA_DB_FILE ? path.resolve(process.env.SCA_DB_FILE) : '';
const DB_ODBC_DRIVER = String(process.env.SCA_DB_ODBC_DRIVER || '').trim();
const DB_CONNECTION_STRING = String(process.env.SCA_DB_CONNECTION_STRING || '').trim();
const API_URL = process.env.SCA_SYNC_API_URL || 'https://www.academiaoxigenio.com/admin/sca/sync/batch';
const SOURCE = process.env.SCA_SYNC_SOURCE || 'sca_db';
const TOKEN = String(process.env.SCA_SYNC_TOKEN || '').trim();
const ENABLED = process.env.SCA_SYNC_ENABLED !== '0';
const BATCH_SIZE = Math.max(10, Math.min(2000, Number(process.env.SCA_SYNC_BATCH_SIZE || 500)));
const FETCH_WINDOW = Math.max(BATCH_SIZE, Math.min(100000, Number(process.env.SCA_DB_FETCH_WINDOW || 10000)));
const LOG_ROTATE_BYTES = Math.max(256 * 1024, Number(process.env.SCA_SYNC_LOG_ROTATE_BYTES || (5 * 1024 * 1024)));
const SOURCE_HINTS = ['sca', 'acesso', 'catraca', 'controle', 'movimento', 'evento', 'access', 'academia'];

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
            const ext = path.extname(full).toLowerCase();
            if (ext !== '.mdb' && ext !== '.accdb') continue;
            try {
                const stat = fs.statSync(full);
                const fileName = path.basename(full).toLowerCase();
                let score = Number(stat.mtimeMs || 0);
                for (const hint of SOURCE_HINTS) {
                    if (fileName.includes(hint)) score += 250_000;
                }
                score += Math.min(Number(stat.size || 0), 500 * 1024 * 1024) / 512;
                out.push({
                    engine: 'access',
                    file: full,
                    mtimeMs: Number(stat.mtimeMs || 0),
                    size: Number(stat.size || 0),
                    score
                });
            } catch (_) {}
        }
    }
    out.sort((a, b) => b.score - a.score);
    return out;
}

function runPowerShellJson(script, envExtra = {}, executable = 'powershell.exe') {
    const ps = spawnSync(
        executable,
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

function buildPowerShellCandidates() {
    const out = ['powershell.exe'];
    try {
        if (process.platform === 'win32' && process.arch === 'x64') {
            const wow64 = path.join(process.env.WINDIR || 'C:\\Windows', 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            if (fs.existsSync(wow64)) out.push(wow64);
        }
    } catch (_) {}
    return [...new Set(out)];
}

function runPowerShellJsonAny(script, envExtra = {}) {
    const candidates = buildPowerShellCandidates();
    let lastError = null;
    for (const candidate of candidates) {
        try {
            return runPowerShellJson(script, envExtra, candidate);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('powershell_exec_failed');
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
    const data = runPowerShellJsonAny(script);
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
    return runPowerShellJsonAny(script, {
        SCA_ODBC_CONN: connectionString,
        SCA_ODBC_MODE: mode,
        SCA_ODBC_QUERY: query
    });
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
    for (const hints of Object.values(requiredCols)) {
        if (!findBestByHints(cols, hints)) return -1;
        score += 250;
    }
    for (const hints of Object.values(optionalCols)) {
        if (findBestByHints(cols, hints)) score += 20;
    }
    return score;
}

function discoverProfile(schema, dbFile) {
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
    if (!best || bestScore < 0) throw new Error('Nao foi possivel descobrir automaticamente a tabela de eventos no .mdb.');
    const cols = Array.isArray(best.columns) ? best.columns.map((c) => String(c.name || '')) : [];
    const lowerToOriginal = new Map(cols.map((c) => [c.toLowerCase(), c]));
    const pick = (hints) => {
        const found = findBestByHints([...lowerToOriginal.keys()], hints);
        return found ? lowerToOriginal.get(found) || '' : '';
    };
    return {
        version: 1,
        generated_at: Date.now(),
        engine: 'access',
        db_file: dbFile,
        table: String(best.name || ''),
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
}

function normalizeIdentifier(ident) {
    const value = String(ident || '').trim();
    if (!value) return '';
    return `[${value.replace(/]/g, ']]')}]`;
}

function buildSelectSql(profile) {
    const table = normalizeIdentifier(profile.table);
    const cols = profile.columns || {};
    const colExpr = (name, alias) => {
        const col = String(cols[name] || '').trim();
        if (!col) return `NULL AS ${alias}`;
        return `${normalizeIdentifier(col)} AS ${alias}`;
    };
    const orderByKey = cols.source_marker ? normalizeIdentifier(cols.source_marker) : normalizeIdentifier(cols.event_at);
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
    return `SELECT TOP ${FETCH_WINDOW} ${projection} FROM ${table} ORDER BY ${orderByKey} DESC`;
}

function buildOdbcConnectionCandidates(dbFile, drivers) {
    if (DB_CONNECTION_STRING) return [DB_CONNECTION_STRING];
    const preferred = DB_ODBC_DRIVER || 'Microsoft Access Driver (*.mdb, *.accdb)';
    const accessDrivers = drivers.filter((d) => /access|ace|mdb|accdb/i.test(String(d || '')));
    const list = [preferred, ...accessDrivers];
    const unique = [...new Set(list.filter(Boolean))];
    return unique.map((driver) => `Driver={${driver}};Dbq=${dbFile};Uid=;Pwd=;`);
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
    if (!ENABLED) {
        log('SCA MDB reader desativado (SCA_SYNC_ENABLED=0).');
        return;
    }
    if (!TOKEN) throw new Error('SCA_SYNC_TOKEN ausente.');
    if (!DB_FILE_OVERRIDE && (!DB_DIR || !fs.existsSync(DB_DIR))) {
        throw new Error(`Diretorio SCA_DB_DIR invalido: ${DB_DIR || '<vazio>'}`);
    }

    let selectedFile = DB_FILE_OVERRIDE;
    if (!selectedFile) {
        const candidates = listDbCandidates(DB_DIR);
        selectedFile = candidates[0]?.file || '';
    }
    if (!selectedFile || !fs.existsSync(selectedFile)) {
        throw new Error('Nenhum arquivo .mdb/.accdb detectado em SCA_DB_DIR.');
    }

    const drivers = getOdbcDrivers();
    const accessDrivers = drivers.filter((d) => /access|ace|mdb|accdb/i.test(String(d || '')));
    const connCandidates = buildOdbcConnectionCandidates(selectedFile, drivers);
    if (!connCandidates.length) throw new Error('Nenhum driver ODBC do Access foi encontrado.');
    if (!DB_CONNECTION_STRING && !accessDrivers.length) {
        throw new Error(`Nenhum driver ODBC Access instalado. Drivers detectados: ${drivers.length ? drivers.join(', ') : '(nenhum)'}`);
    }

    let conn = '';
    let schema = null;
    let lastConnError = '';
    for (const candidate of connCandidates) {
        try {
            const schemaData = runOdbc('schema', candidate);
            if (Array.isArray(schemaData?.tables) && schemaData.tables.length) {
                conn = candidate;
                schema = schemaData;
                break;
            }
        } catch (error) {
            lastConnError = String(error?.message || error);
        }
    }
    if (!conn) {
        throw new Error(`Falha ao conectar no .mdb via ODBC. Drivers detectados: ${drivers.length ? drivers.join(', ') : '(nenhum)'} | erro: ${lastConnError || 'desconhecido'}`);
    }

    let profile = readJsonFile(PROFILE_FILE, null);
    if (!profile || path.resolve(String(profile.db_file || '')) !== path.resolve(selectedFile) || !profile.columns?.event_at) {
        profile = discoverProfile(schema, selectedFile);
        writeJsonFile(PROFILE_FILE, profile);
        log(`Perfil de mapeamento gerado: ${PROFILE_FILE}`);
    }

    const sql = buildSelectSql(profile);
    const rawRows = runOdbc('query', conn, sql);
    const rows = Array.isArray(rawRows?.rows) ? rawRows.rows.slice().reverse() : [];

    const cursor = readJsonFile(CURSOR_FILE, {
        db_file: '',
        table: '',
        last_event_at: 0,
        last_source_marker: ''
    });

    const prevEventAt = Number(cursor?.last_event_at || 0);
    const prevMarker = normalizeMarker(cursor?.last_source_marker || '');

    let maxEventAt = prevEventAt;
    let maxMarker = prevMarker;
    let accepted = 0;
    let rejected = 0;
    let inserted = 0;
    let duplicated = 0;
    let failed = 0;
    const queue = [];

    const flushQueue = async () => {
        if (!queue.length) return;
        const connector = {
            source: SOURCE,
            engine_detected: 'access',
            db_file: selectedFile,
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

    for (const row of rows) {
        const externalId = String(row.external_id || '').trim();
        const name = String(row.name || '').trim();
        const phone = normalizePhoneDigits(row.phone || '');
        const eventType = normalizeEventType(row.event_type || '');
        const eventAt = parseEventAt(row.event_at);
        const status = String(row.status || '').trim();
        const plan = String(row.plan || '').trim();
        const gate = String(row.gate || '').trim();
        const sourceMarker = normalizeMarker(row.source_marker);

        if (!externalId && !phone) {
            rejected += 1;
            continue;
        }
        if (!Number.isFinite(eventAt) || eventAt <= 0) {
            rejected += 1;
            continue;
        }

        const isNewByTs = eventAt > prevEventAt;
        const isNewByMarker = eventAt === prevEventAt && compareMarkers(sourceMarker, prevMarker) > 0;
        if (!isNewByTs && !isNewByMarker) continue;

        const sourceEventId = hashSourceEvent([
            SOURCE,
            'access',
            path.basename(selectedFile),
            profile.table,
            sourceMarker,
            externalId,
            phone,
            eventType,
            String(eventAt),
            gate,
            status
        ]);

        queue.push({
            source_event_id: sourceEventId,
            external_id: externalId,
            name,
            phone,
            event_type: eventType,
            event_at: eventAt,
            status,
            plan,
            gate
        });
        accepted += 1;

        if (eventAt > maxEventAt || (eventAt === maxEventAt && compareMarkers(sourceMarker, maxMarker) > 0)) {
            maxEventAt = eventAt;
            maxMarker = sourceMarker;
        }
        if (queue.length >= BATCH_SIZE) await flushQueue();
    }

    await flushQueue();

    const connector = {
        source: SOURCE,
        engine_detected: 'access',
        db_file: selectedFile,
        last_scan_at: Date.now(),
        last_error: '',
        lag_sec: maxEventAt > 0 ? Math.max(0, Math.floor((Date.now() - maxEventAt) / 1000)) : 0,
        meta: {
            mode: 'db',
            table: profile.table,
            fetched_rows: rows.length,
            accepted,
            rejected
        }
    };

    if (accepted === 0) await postBatch([], connector);

    writeJsonFile(CURSOR_FILE, {
        db_file: selectedFile,
        table: profile.table,
        last_event_at: maxEventAt,
        last_source_marker: maxMarker,
        updated_at: Date.now()
    });

    log(`Resumo SCA MDB sync | table=${profile.table} fetched=${rows.length} accepted=${accepted} rejected=${rejected} inserted=${inserted} duplicated=${duplicated} failed=${failed}`);
}

run().catch((error) => {
    log(`Erro no SCA MDB sync: ${error?.message || error}`);
    process.exitCode = 1;
});
