function registerAttendanceAdminRoutes({
    app,
    db,
    requirePanelAuth,
    requireAdmin,
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
    WEEKDAY_LABELS
}) {
const SCA_ALLOWED_EVENT_TYPES = new Set(['entry', 'exit', 'access', 'denied']);

db.prepare(`
    CREATE TABLE IF NOT EXISTS sca_students_sync (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL DEFAULT 'sca_web_export',
        student_key TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone_1 TEXT NOT NULL DEFAULT '',
        phone_2 TEXT NOT NULL DEFAULT '',
        cpf TEXT NOT NULL DEFAULT '',
        plan TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        number TEXT NOT NULL DEFAULT '',
        complement TEXT NOT NULL DEFAULT '',
        neighborhood TEXT NOT NULL DEFAULT '',
        cep TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        raw_json TEXT NOT NULL DEFAULT '{}',
        first_seen_at INTEGER NOT NULL DEFAULT 0,
        last_seen_at INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
    )
`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_students_sync_last_seen ON sca_students_sync(last_seen_at DESC)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_students_sync_source ON sca_students_sync(source)').run();
db.prepare(`
    CREATE TABLE IF NOT EXISTS sca_connector_diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connector TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT 'info',
        event TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        host TEXT NOT NULL DEFAULT '',
        pid INTEGER NOT NULL DEFAULT 0,
        meta_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL DEFAULT 0
    )
`).run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_connector_diag_created_at ON sca_connector_diagnostics(created_at DESC)').run();
db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_connector_diag_connector ON sca_connector_diagnostics(connector)').run();

function formatLocalDateTime(value) {
    const ts = Number(value || 0);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    try {
        return new Date(ts).toLocaleString('pt-BR');
    } catch (_) {
        return String(ts);
    }
}

function normalizeOptionalNumberInput(value) {
    if (value === undefined || value === null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
}

function normalizeScaToken(value) {
    return String(value || '').trim();
}

function normalizeScaEventType(raw) {
    const value = String(raw || '').toLowerCase().trim();
    if (!value) return '';
    if (['entrada', 'entry', 'in', 'entrou', 'acesso'].includes(value)) return 'entry';
    if (['saida', 'saída', 'exit', 'out', 'saiu'].includes(value)) return 'exit';
    if (['denied', 'negado', 'bloqueado', 'recusado'].includes(value)) return 'denied';
    if (SCA_ALLOWED_EVENT_TYPES.has(value)) return value;
    return '';
}

function parseScaEventAt(raw) {
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

function normalizeScaStudentText(raw, maxLen = 180) {
    const value = sanitizePublicText(raw, maxLen);
    return value || '';
}

function normalizeScaStudentPhone(raw) {
    return normalizePhoneDigits(raw || '');
}

function normalizeScaStudentCpf(raw) {
    return String(raw || '').replace(/\D/g, '').slice(0, 14);
}

function normalizeScaStudentRow(rawRow, index = 0) {
    const row = rawRow && typeof rawRow === 'object' ? rawRow : {};
    const pick = (...keys) => {
        for (const key of keys) {
            const value = row[key];
            const text = normalizeScaStudentText(value, 220);
            if (text) return text;
        }
        return '';
    };
    const fullName = normalizeScaStudentText(
        pick('full_name', 'fullName', 'name', 'nome', 'Nome-Completo', 'Nome Completo'),
        160
    );
    const email = normalizeScaStudentText(pick('email', 'E-mail', 'Email'), 180).toLowerCase();
    const phone1 = normalizeScaStudentPhone(pick('phone_1', 'phone1', 'telefone_1', 'Telefone-1', 'Telefone 1', 'telefone'));
    const phone2 = normalizeScaStudentPhone(pick('phone_2', 'phone2', 'telefone_2', 'Telefone-2', 'Telefone 2', 'celular'));
    const cpf = normalizeScaStudentCpf(pick('cpf', 'CPF'));
    const plan = normalizeScaStudentText(pick('plan', 'plano', 'Plano', 'modalidade', 'Modalidade'), 120);
    const address = normalizeScaStudentText(pick('address', 'endereco', 'Endereço', 'Endereco', 'logradouro'), 180);
    const number = normalizeScaStudentText(pick('number', 'numero', 'Número', 'Numero'), 40);
    const complement = normalizeScaStudentText(pick('complement', 'complemento', 'Complemento'), 120);
    const neighborhood = normalizeScaStudentText(pick('neighborhood', 'bairro', 'Bairro'), 120);
    const cep = normalizeScaStudentText(pick('cep', 'CEP', 'Cep'), 20);
    const city = normalizeScaStudentText(pick('city', 'cidade', 'Cidade'), 120);
    const state = normalizeScaStudentText(pick('state', 'estado', 'Estado', 'uf', 'UF'), 10);

    if (!fullName && !phone1 && !cpf && !email) {
        return { ok: false, error: 'row_identity_required', index };
    }
    const studentKey = cpf || phone1 || `${fullName.toLowerCase()}|${email.toLowerCase()}`;
    return {
        ok: true,
        row: {
            student_key: studentKey,
            full_name: fullName,
            email,
            phone_1: phone1,
            phone_2: phone2,
            cpf,
            plan,
            address,
            number,
            complement,
            neighborhood,
            cep,
            city,
            state,
            raw: row
        }
    };
}

function normalizeScaConnectorInput(raw, fallbackSource = 'sca_db') {
    const row = raw && typeof raw === 'object' ? raw : null;
    if (!row) return null;
    const source = sanitizePublicText(row.source || fallbackSource || 'sca_db', 60) || 'sca_db';
    const engineDetected = sanitizePublicText(row.engine_detected || row.engine || '', 40);
    const dbFile = sanitizePublicText(row.db_file || row.dbFile || '', 320);
    const lastScanRaw = Number(row.last_scan_at ?? row.lastScanAt ?? 0);
    const lagRaw = Number(row.lag_sec ?? row.lagSec ?? 0);
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    return {
        source,
        engine_detected: engineDetected,
        db_file: dbFile,
        last_scan_at: Number.isFinite(lastScanRaw) && lastScanRaw > 0 ? Math.floor(lastScanRaw) : 0,
        last_error: sanitizePublicText(row.last_error || row.lastError || '', 240),
        lag_sec: Number.isFinite(lagRaw) && lagRaw >= 0 ? Math.floor(lagRaw) : 0,
        meta
    };
}

function authorizeScaSync(req, res) {
    res.status(410).json({ error: 'sca_import_disabled' });
    return false;
}

function computeValuePerClass({ scheduleType, rawValue, fallbackValue = 0 }) {
    if (scheduleType !== 'class') return 0;
    if (rawValue === null) return Math.max(0, Number(fallbackValue || 0));
    if (!Number.isFinite(rawValue) || rawValue < 0) return NaN;
    return Number(rawValue);
}

function resolveTemplateDurationMin(startTime, endTime) {
    const startMin = parseHHMMToMinutes(startTime);
    const endMinRaw = parseHHMMToMinutes(endTime);
    if (startMin === null || endMinRaw === null) return null;
    let endMin = endMinRaw;
    if (endMin <= startMin) endMin += (24 * 60);
    return Math.max(1, endMin - startMin);
}

function loadTemplateById(id) {
    return db.prepare(`
        SELECT t.*,
               c.type AS catalog_type,
               c.name AS catalog_name,
               c.default_value AS catalog_default_value,
               c.active AS catalog_active
        FROM attendance_class_templates t
        LEFT JOIN attendance_activity_catalog c ON c.id=t.activity_id
        WHERE t.id=?
    `).get(id);
}

app.get('/admin/attendance/status', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const geo = getAttendanceGeoPolicy();
    res.json({
        enabled: ATTENDANCE_ENABLED,
        bot_phone: getBotPhoneDigits() || '',
        reminder_enabled: ATTENDANCE_REMINDER_ENABLED,
        reminder_before_min: ATTENDANCE_REMINDER_BEFORE_MIN,
        absence_followup_enabled: ATTENDANCE_ABSENCE_FOLLOWUP_ENABLED,
        absence_followup_after_min: ATTENDANCE_ABSENCE_FOLLOWUP_AFTER_MIN,
        exit_pre_reminder_enabled: ATTENDANCE_EXIT_PRE_REMINDER_ENABLED,
        exit_pre_reminder_before_min: ATTENDANCE_EXIT_PRE_REMINDER_BEFORE_MIN,
        exit_reminder_enabled: ATTENDANCE_EXIT_REMINDER_ENABLED,
        exit_reminder_after_min: ATTENDANCE_EXIT_REMINDER_AFTER_MIN,
        strict_schedule_validation: true,
        entry_window_before_min: ATTENDANCE_ENTRY_WINDOW_BEFORE_MIN,
        entry_window_after_min: ATTENDANCE_ENTRY_WINDOW_AFTER_MIN,
        entry_window_before_block_end_min: ATTENDANCE_ENTRY_WINDOW_BEFORE_BLOCK_END_MIN,
        exit_manual_grace_after_end_min: ATTENDANCE_EXIT_MANUAL_GRACE_AFTER_END_MIN,
        exit_auto_close_enabled: ATTENDANCE_EXIT_AUTO_CLOSE_ENABLED,
        consecutive_gap_min: ATTENDANCE_CONSECUTIVE_GAP_MIN,
        geo
    });
});

app.get('/admin/attendance/debug-last', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    res.json({ ok: true, last: attendanceDebugLast });
});

app.post('/admin/sca/sync/batch', (req, res) => {
    if (!authorizeScaSync(req, res)) return;
    if (typeof upsertScaAccessBatch !== 'function') {
        return res.status(500).json({ error: 'sca_sync_unavailable' });
    }
    const source = sanitizePublicText(req.body?.source || 'sca_csv', 60) || 'sca_csv';
    const connector = normalizeScaConnectorInput(req.body?.connector, source);
    const payloadEvents = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!payloadEvents.length && !connector) return res.status(400).json({ error: 'invalid_events' });
    if (payloadEvents.length > 10000) return res.status(400).json({ error: 'events_limit_exceeded' });

    const normalizedEvents = [];
    const rejected = [];
    payloadEvents.forEach((rawEvent, index) => {
        const row = rawEvent && typeof rawEvent === 'object' ? rawEvent : null;
        if (!row) {
            rejected.push({ index, error: 'invalid_event_object' });
            return;
        }
        const sourceEventId = sanitizePublicText(row.source_event_id, 180);
        const externalId = sanitizePublicText(row.external_id || row.matricula || row['matrícula'] || row.student_id || row.aluno_id, 120);
        const name = sanitizePublicText(row.name || row.nome || '', 120);
        const phone = normalizePhoneDigits(row.phone || row.telefone || row.whatsapp || '');
        const eventType = normalizeScaEventType(row.event_type || row.eventType || row.tipo || row.event || row.movimento);
        const eventAt = parseScaEventAt(row.event_at || row.eventAt || row.datetime || row.data_hora || row.timestamp || row.occurred_at);
        const status = sanitizePublicText(row.status || row.situacao || row.situação || '', 40);
        const plan = sanitizePublicText(row.plan || row.plano || '', 80);
        const gate = sanitizePublicText(row.gate || row.catraca || row.unidade || row.equipamento || '', 80);
        if (!sourceEventId) {
            rejected.push({ index, error: 'source_event_id_required' });
            return;
        }
        if (!externalId && !phone) {
            rejected.push({ index, error: 'external_id_or_phone_required' });
            return;
        }
        if (!eventType) {
            rejected.push({ index, error: 'invalid_event_type' });
            return;
        }
        if (!Number.isFinite(eventAt) || eventAt <= 0) {
            rejected.push({ index, error: 'invalid_event_at' });
            return;
        }
        normalizedEvents.push({
            source_event_id: sourceEventId,
            external_id: externalId,
            name,
            phone,
            event_type: eventType,
            event_at: Number(eventAt),
            status,
            plan,
            gate,
            raw: row
        });
    });

    if (payloadEvents.length > 0 && !normalizedEvents.length) {
        return res.status(400).json({ error: 'no_valid_events', rejected });
    }
    const result = upsertScaAccessBatch({
        source,
        actor: 'sca_sync',
        events: normalizedEvents,
        connector
    });
    return res.json({
        ok: true,
        source,
        processed: payloadEvents.length,
        accepted: normalizedEvents.length,
        rejected_count: rejected.length,
        rejected,
        connector,
        ...result
    });
});

app.get('/admin/sca/sync/status', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    return res.status(410).json({ error: 'sca_import_disabled' });
});

app.get('/admin/sca/students/inactive', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const rawDays = Number(req.query?.days ?? 5);
    const days = Number.isFinite(rawDays) ? Math.max(1, Math.min(180, Math.floor(rawDays))) : 5;
    const rawLimit = Number(req.query?.limit ?? 200);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(1000, Math.floor(rawLimit))) : 200;
    const q = sanitizePublicText(req.query?.q || '', 120);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoffAt = now - (days * dayMs);
    const where = ['last_access_at > 0', 'last_access_at <= ?'];
    const params = [cutoffAt];
    if (q) {
        where.push('(name LIKE ? OR phone LIKE ? OR external_id LIKE ? OR plan LIKE ?)');
        const term = `%${q}%`;
        params.push(term, term, term, term);
    }
    params.push(limit);
    const rows = db.prepare(`
        SELECT id, external_id, name, phone, status, plan, last_access_at
        FROM sca_people
        WHERE ${where.join(' AND ')}
        ORDER BY last_access_at ASC, id ASC
        LIMIT ?
    `).all(...params);
    const items = rows.map((row) => {
        const lastAccessAt = Number(row.last_access_at || 0);
        const daysWithoutVisit = lastAccessAt > 0 ? Math.max(days, Math.floor((now - lastAccessAt) / dayMs)) : days;
        return {
            id: Number(row.id || 0),
            external_id: String(row.external_id || ''),
            name: String(row.name || ''),
            phone: String(row.phone || ''),
            status: String(row.status || ''),
            plan: String(row.plan || ''),
            last_access_at: lastAccessAt,
            days_without_visit: daysWithoutVisit
        };
    });
    return res.json({
        ok: true,
        days,
        cutoff_at: cutoffAt,
        generated_at: now,
        total: items.length,
        items
    });
});

app.post('/admin/sca/connector/diagnostic', (req, res) => {
    if (!authorizeScaSync(req, res)) return;
    const source = sanitizePublicText(req.body?.source || 'sca_connector', 60) || 'sca_connector';
    const connector = sanitizePublicText(req.body?.connector || source, 80) || source;
    const levelRaw = String(req.body?.level || 'info').toLowerCase().trim();
    const level = ['debug', 'info', 'warn', 'error'].includes(levelRaw) ? levelRaw : 'info';
    const event = sanitizePublicText(req.body?.event || 'runtime_event', 80) || 'runtime_event';
    const message = sanitizePublicText(req.body?.message || '', 2000);
    if (!message) return res.status(400).json({ error: 'message_required' });
    const host = sanitizePublicText(req.body?.host || '', 120);
    const pidRaw = Number(req.body?.pid || 0);
    const pid = Number.isFinite(pidRaw) && pidRaw > 0 ? Math.floor(pidRaw) : 0;
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
    const createdAtRaw = Number(req.body?.at || 0);
    const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? Math.floor(createdAtRaw) : Date.now();

    db.prepare(`
        INSERT INTO sca_connector_diagnostics (
            connector, source, level, event, message, host, pid, meta_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        connector,
        source,
        level,
        event,
        message,
        host,
        pid,
        JSON.stringify(meta),
        createdAt
    );

    return res.json({ ok: true });
});

app.get('/admin/sca/connector/diagnostic', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    return res.status(410).json({ error: 'sca_import_disabled' });
});

app.post('/admin/sca/students/sync/batch', (req, res) => {
    if (!authorizeScaSync(req, res)) return;
    const source = sanitizePublicText(req.body?.source || 'sca_web_export', 60) || 'sca_web_export';
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'invalid_rows' });
    if (rows.length > 10000) return res.status(400).json({ error: 'rows_limit_exceeded' });

    const now = Date.now();
    const normalized = [];
    const rejected = [];
    rows.forEach((row, index) => {
        const item = normalizeScaStudentRow(row, index);
        if (!item.ok) {
            rejected.push({ index, error: item.error });
            return;
        }
        normalized.push(item.row);
    });
    if (!normalized.length) {
        return res.status(400).json({ error: 'no_valid_rows', rejected });
    }

    const upsert = db.prepare(`
        INSERT INTO sca_students_sync (
            source, student_key, full_name, email, phone_1, phone_2, cpf, plan,
            address, number, complement, neighborhood, cep, city, state, raw_json,
            first_seen_at, last_seen_at, created_at, updated_at
        )
        VALUES (
            @source, @student_key, @full_name, @email, @phone_1, @phone_2, @cpf, @plan,
            @address, @number, @complement, @neighborhood, @cep, @city, @state, @raw_json,
            @first_seen_at, @last_seen_at, @created_at, @updated_at
        )
        ON CONFLICT(student_key) DO UPDATE SET
            source=excluded.source,
            full_name=excluded.full_name,
            email=excluded.email,
            phone_1=excluded.phone_1,
            phone_2=excluded.phone_2,
            cpf=excluded.cpf,
            plan=excluded.plan,
            address=excluded.address,
            number=excluded.number,
            complement=excluded.complement,
            neighborhood=excluded.neighborhood,
            cep=excluded.cep,
            city=excluded.city,
            state=excluded.state,
            raw_json=excluded.raw_json,
            last_seen_at=excluded.last_seen_at,
            updated_at=excluded.updated_at
    `);
    const exists = db.prepare('SELECT id FROM sca_students_sync WHERE student_key=? LIMIT 1');

    let insertedCount = 0;
    let updatedCount = 0;
    const tx = db.transaction(() => {
        normalized.forEach((row) => {
            const existed = !!exists.get(row.student_key);
            upsert.run({
                source,
                student_key: row.student_key,
                full_name: row.full_name,
                email: row.email,
                phone_1: row.phone_1,
                phone_2: row.phone_2,
                cpf: row.cpf,
                plan: row.plan,
                address: row.address,
                number: row.number,
                complement: row.complement,
                neighborhood: row.neighborhood,
                cep: row.cep,
                city: row.city,
                state: row.state,
                raw_json: JSON.stringify(row.raw || {}),
                first_seen_at: now,
                last_seen_at: now,
                created_at: now,
                updated_at: now
            });
            if (existed) updatedCount += 1;
            else insertedCount += 1;
        });
    });
    tx();

    return res.json({
        ok: true,
        source,
        processed: rows.length,
        accepted: normalized.length,
        rejected_count: rejected.length,
        rejected,
        inserted_count: insertedCount,
        updated_count: updatedCount
    });
});

app.get('/admin/sca/students/sync/status', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    return res.status(410).json({ error: 'sca_import_disabled' });
});

if (ATTENDANCE_ENABLED) {
app.get('/admin/attendance/geo-policy', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    res.json({ ok: true, policy: getAttendanceGeoPolicy() });
});

app.put('/admin/attendance/geo-policy', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const current = getAttendanceGeoPolicy();
    const enabled = req.body?.enabled === undefined ? current.enabled : !!req.body.enabled;
    const requireEntryLocation = req.body?.requireEntryLocation === undefined ? current.require_entry_location : !!req.body.requireEntryLocation;
    const requireExitLocation = req.body?.requireExitLocation === undefined ? current.require_exit_location : !!req.body.requireExitLocation;
    const academyLat = req.body?.academyLat === undefined ? current.academy_lat : Number(req.body.academyLat);
    const academyLng = req.body?.academyLng === undefined ? current.academy_lng : Number(req.body.academyLng);
    const radiusM = req.body?.radiusM === undefined ? current.radius_m : Number(req.body.radiusM);
    const fallbackMode = req.body?.fallbackMode === undefined ? current.fallback_mode : normalizeGeoFallbackMode(req.body.fallbackMode);
    const requestTtlSec = req.body?.requestTtlSec === undefined ? current.request_ttl_sec : Number(req.body.requestTtlSec);

    if (Number.isFinite(academyLat) && (academyLat < -90 || academyLat > 90)) return res.status(400).json({ error: 'invalid_geo_policy' });
    if (Number.isFinite(academyLng) && (academyLng < -180 || academyLng > 180)) return res.status(400).json({ error: 'invalid_geo_policy' });
    if (Number.isFinite(radiusM) && (radiusM < 30 || radiusM > 1000)) return res.status(400).json({ error: 'invalid_geo_policy' });
    if (Number.isFinite(requestTtlSec) && (requestTtlSec < 60 || requestTtlSec > 1800)) return res.status(400).json({ error: 'invalid_geo_policy' });

    const nextLat = Number.isFinite(academyLat) ? academyLat : null;
    const nextLng = Number.isFinite(academyLng) ? academyLng : null;
    if (enabled && requireEntryLocation && (!Number.isFinite(nextLat) || !Number.isFinite(nextLng))) {
        return res.status(400).json({ error: 'invalid_geo_policy' });
    }

    const policy = setAttendanceGeoPolicy({
        enabled,
        require_entry_location: requireEntryLocation,
        require_exit_location: requireExitLocation,
        academy_lat: nextLat,
        academy_lng: nextLng,
        radius_m: Number.isFinite(radiusM) ? radiusM : current.radius_m,
        fallback_mode: fallbackMode,
        request_ttl_sec: Number.isFinite(requestTtlSec) ? requestTtlSec : current.request_ttl_sec
    });

    logAdminAction('attendance.geo_policy.update', user.username, 'attendance_geo_policy', {
        enabled: policy.enabled,
        requireEntryLocation: policy.require_entry_location,
        requireExitLocation: policy.require_exit_location,
        academyLat: policy.academy_lat,
        academyLng: policy.academy_lng,
        radiusM: policy.radius_m,
        fallbackMode: policy.fallback_mode,
        requestTtlSec: policy.request_ttl_sec
    }, req.socket.remoteAddress);

    res.json({ ok: true, policy });
});

app.get('/admin/attendance/geo-pending', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    cleanupExpiredAttendanceGeoPending();
    const rows = db.prepare(`
        SELECT p.*, e.name AS employee_name
        FROM attendance_geo_pending p
        LEFT JOIN attendance_employees e ON e.id=p.employee_id
        WHERE p.status='pending'
        ORDER BY p.requested_at DESC
        LIMIT 200
    `).all();
    res.json({ ok: true, items: rows });
});

app.get('/admin/attendance/catalog', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const type = String(req.query.type || '').trim().toLowerCase();
    const activeRaw = String(req.query.active || '').trim().toLowerCase();
    const activeOnly = activeRaw === '1' || activeRaw === 'true';
    const rows = getAttendanceCatalogRows({ type, activeOnly });
    res.json({ items: rows });
});

app.post('/admin/attendance/catalog', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const type = normalizeAttendanceActivityType(req.body?.type);
    const name = sanitizePublicText(req.body?.name, 80);
    const defaultValue = Math.max(0, Number(req.body?.defaultValue || 0));
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body?.sortOrder) : 0;
    if (!name) return res.status(400).json({ error: 'invalid_name' });
    const item = ensureAttendanceCatalogItem(type, name, defaultValue, sortOrder);
    if (!item) return res.status(500).json({ error: 'catalog_create_failed' });
    db.prepare('UPDATE attendance_activity_catalog SET default_value=?, sort_order=?, active=1, updated_at=? WHERE id=?')
        .run(defaultValue, sortOrder, Date.now(), item.id);
    logAdminAction('attendance.catalog.create', user.username, String(item.id), { type, name, defaultValue, sortOrder }, req.socket.remoteAddress);
    const row = db.prepare('SELECT id, type, name, default_value, active, sort_order, created_at, updated_at FROM attendance_activity_catalog WHERE id=?').get(item.id);
    res.json({ ok: true, item: row });
});

app.put('/admin/attendance/catalog/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_activity_catalog WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const type = req.body?.type === undefined ? normalizeAttendanceActivityType(row.type) : normalizeAttendanceActivityType(req.body?.type);
    const name = req.body?.name === undefined ? String(row.name || '') : sanitizePublicText(req.body?.name, 80);
    const defaultValue = req.body?.defaultValue === undefined ? Math.max(0, Number(row.default_value || 0)) : Math.max(0, Number(req.body?.defaultValue || 0));
    const sortOrder = req.body?.sortOrder === undefined ? Number(row.sort_order || 0) : (Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body?.sortOrder) : 0);
    const active = req.body?.active === undefined ? Number(row.active || 0) : (req.body?.active ? 1 : 0);
    if (!name) return res.status(400).json({ error: 'invalid_name' });
    db.prepare('UPDATE attendance_activity_catalog SET type=?, name=?, default_value=?, sort_order=?, active=?, updated_at=? WHERE id=?')
        .run(type, name, defaultValue, sortOrder, active, Date.now(), id);
    logAdminAction('attendance.catalog.update', user.username, String(id), { type, name, defaultValue, sortOrder, active }, req.socket.remoteAddress);
    const out = db.prepare('SELECT id, type, name, default_value, active, sort_order, created_at, updated_at FROM attendance_activity_catalog WHERE id=?').get(id);
    res.json({ ok: true, item: out });
});

app.delete('/admin/attendance/catalog/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_activity_catalog WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('UPDATE attendance_activity_catalog SET active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    logAdminAction('attendance.catalog.deactivate', user.username, String(id), {}, req.socket.remoteAddress);
    res.json({ ok: true });
});

app.get('/admin/attendance/templates', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const activeRaw = String(req.query.activeOnly || req.query.active || '').trim().toLowerCase();
    const activeOnly = activeRaw === '1' || activeRaw === 'true';
    const source = String(req.query.source || '').trim().toLowerCase();
    const templates = getAttendanceClassTemplates({ activeOnly, source });
    res.json({ templates });
});

app.post('/admin/attendance/templates/sync-context', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const summary = syncAttendanceClassTemplatesFromContext({ actor: user.username, mode: 'manual' });
    try {
        broadcast({ type: 'attendance_templates_updated', updated_at: summary.updated_at || Date.now(), summary });
    } catch (e) {}
    res.json({ ok: true, summary });
});

app.post('/admin/attendance/templates', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const activityId = Number(req.body?.activityId || 0);
    const weekday = Number(req.body?.weekday);
    const startTime = String(req.body?.startTime || '');
    const endTime = String(req.body?.endTime || '');
    if (!Number.isFinite(activityId) || activityId <= 0) return res.status(400).json({ error: 'invalid_activity' });
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'invalid_weekday' });
    const durationMin = resolveTemplateDurationMin(startTime, endTime);
    if (!durationMin) return res.status(400).json({ error: 'invalid_time' });

    const activity = db.prepare('SELECT id, type, name, default_value, active FROM attendance_activity_catalog WHERE id=?').get(activityId);
    if (!activity || !activity.active) return res.status(400).json({ error: 'invalid_activity' });
    if (parseAttendanceActivityTypeStrict(activity.type) !== 'class') return res.status(400).json({ error: 'activity_type_mismatch' });

    const now = Date.now();
    const activityLabel = sanitizePublicText(activity.name || '', 80) || 'Aula';
    const sourceKey = `${activityId}|${weekday}|${startTime}|${endTime}|${ATTENDANCE_TEMPLATE_SOURCE_MANUAL}`;
    const existing = db.prepare('SELECT id, source FROM attendance_class_templates WHERE source_key=?').get(sourceKey);
    let id = null;
    if (existing?.id) {
        if (String(existing.source || '') !== ATTENDANCE_TEMPLATE_SOURCE_MANUAL) {
            return res.status(409).json({ error: 'template_conflict_source' });
        }
        db.prepare(`
            UPDATE attendance_class_templates
            SET activity_id=?, activity_label=?, weekday=?, start_time=?, end_time=?, duration_min=?, source=?, active=1, updated_at=?, last_seen_at=?
            WHERE id=?
        `).run(activityId, activityLabel, weekday, startTime, endTime, durationMin, ATTENDANCE_TEMPLATE_SOURCE_MANUAL, now, now, existing.id);
        id = Number(existing.id);
    } else {
        const inserted = db.prepare(`
            INSERT INTO attendance_class_templates
            (activity_id, activity_label, weekday, start_time, end_time, duration_min, source, source_key, active, created_at, updated_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(activityId, activityLabel, weekday, startTime, endTime, durationMin, ATTENDANCE_TEMPLATE_SOURCE_MANUAL, sourceKey, now, now, now);
        id = Number(inserted.lastInsertRowid || 0);
    }
    const item = loadTemplateById(id);
    logAdminAction('attendance.template.create', user.username, String(id), { activityId, weekday, startTime, endTime, durationMin }, req.socket.remoteAddress);
    try { broadcast({ type: 'attendance_templates_updated', updated_at: now }); } catch (e) {}
    res.json({ ok: true, item });
});

app.put('/admin/attendance/templates/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_class_templates WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (String(row.source || '') !== ATTENDANCE_TEMPLATE_SOURCE_MANUAL) return res.status(400).json({ error: 'template_source_readonly' });

    const activityId = req.body?.activityId === undefined ? Number(row.activity_id || 0) : Number(req.body?.activityId || 0);
    const weekday = req.body?.weekday === undefined ? Number(row.weekday) : Number(req.body?.weekday);
    const startTime = req.body?.startTime === undefined ? String(row.start_time || '') : String(req.body?.startTime || '');
    const endTime = req.body?.endTime === undefined ? String(row.end_time || '') : String(req.body?.endTime || '');
    const active = req.body?.active === undefined ? Number(row.active || 0) : (req.body?.active ? 1 : 0);
    if (!Number.isFinite(activityId) || activityId <= 0) return res.status(400).json({ error: 'invalid_activity' });
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'invalid_weekday' });
    const durationMin = resolveTemplateDurationMin(startTime, endTime);
    if (!durationMin) return res.status(400).json({ error: 'invalid_time' });

    const activity = db.prepare('SELECT id, type, name, default_value, active FROM attendance_activity_catalog WHERE id=?').get(activityId);
    if (!activity || !activity.active) return res.status(400).json({ error: 'invalid_activity' });
    if (parseAttendanceActivityTypeStrict(activity.type) !== 'class') return res.status(400).json({ error: 'activity_type_mismatch' });

    const activityLabel = sanitizePublicText(activity.name || '', 80) || 'Aula';
    const sourceKey = `${activityId}|${weekday}|${startTime}|${endTime}|${ATTENDANCE_TEMPLATE_SOURCE_MANUAL}`;
    const conflict = db.prepare('SELECT id FROM attendance_class_templates WHERE source_key=? AND id<>?').get(sourceKey, id);
    if (conflict?.id) return res.status(409).json({ error: 'template_conflict' });

    const now = Date.now();
    db.prepare(`
        UPDATE attendance_class_templates
        SET activity_id=?, activity_label=?, weekday=?, start_time=?, end_time=?, duration_min=?, source=?, source_key=?, active=?, updated_at=?, last_seen_at=?
        WHERE id=?
    `).run(activityId, activityLabel, weekday, startTime, endTime, durationMin, ATTENDANCE_TEMPLATE_SOURCE_MANUAL, sourceKey, active, now, now, id);
    const item = loadTemplateById(id);
    logAdminAction('attendance.template.update', user.username, String(id), { activityId, weekday, startTime, endTime, durationMin, active }, req.socket.remoteAddress);
    try { broadcast({ type: 'attendance_templates_updated', updated_at: now }); } catch (e) {}
    res.json({ ok: true, item });
});

app.delete('/admin/attendance/templates/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT id, source FROM attendance_class_templates WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (String(row.source || '') !== ATTENDANCE_TEMPLATE_SOURCE_MANUAL) return res.status(400).json({ error: 'template_source_readonly' });
    db.prepare('UPDATE attendance_class_templates SET active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    logAdminAction('attendance.template.deactivate', user.username, String(id), {}, req.socket.remoteAddress);
    try { broadcast({ type: 'attendance_templates_updated', updated_at: Date.now() }); } catch (e) {}
    res.json({ ok: true });
});

app.get('/admin/attendance/employees', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const rows = db.prepare(`
        SELECT e.*,
               (SELECT COUNT(1) FROM attendance_schedules s WHERE s.employee_id=e.id AND s.active=1) AS schedules_count
        FROM attendance_employees e
        ORDER BY e.active DESC, e.name ASC
    `).all();
    res.json({ employees: rows });
});

app.get('/admin/attendance/recent-contacts', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const limit = Math.max(1, Math.min(20, Number(req.query.limit || 5)));
    const rows = db.prepare('SELECT id, name, route_jid, last_activity FROM conversations ORDER BY last_activity DESC LIMIT 300').all();
    const out = [];
    const seen = new Set();
    for (const row of rows) {
        const phone = normalizePhoneDigits(extractPhoneDigitsFromJid(row.route_jid || row.id || ''));
        if (!phone || phone.length < 12) continue;
        if (seen.has(phone)) continue;
        seen.add(phone);
        out.push({
            phone,
            jid: toWhatsappJid(phone),
            name: String(row.name || '').trim() || phone,
            last_activity: Number(row.last_activity || 0)
        });
        if (out.length >= limit) break;
    }
    res.json({ contacts: out });
});

app.post('/admin/attendance/employees', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const name = sanitizePublicText(req.body?.name, 120);
    const notes = String(req.body?.notes || '').slice(0, 500);
    const phoneRaw = String(req.body?.phone || '');
    const phone = normalizePhoneDigits(phoneRaw);
    const roleCatalogItem = resolveAttendanceEmployeeRoleCatalog(req.body?.roleActivityId, req.body?.role);
    if (!roleCatalogItem) return res.status(400).json({ error: 'invalid_role_catalog' });
    const role = sanitizePublicText(roleCatalogItem.name, 80) || ATTENDANCE_DEFAULT_EMPLOYEE_ROLE;
    const roleCatalogId = Number(roleCatalogItem.id || 0) || null;
    if (req.body?.templateIds !== undefined && !Array.isArray(req.body?.templateIds)) return res.status(400).json({ error: 'invalid_template_ids' });
    const templateIds = normalizeAttendanceTemplateIds(req.body?.templateIds);
    if (templateIds.length && !isAttendanceTeacherRole(role)) return res.status(400).json({ error: 'not_teacher_for_class' });
    if (templateIds.length) {
        const check = validateAttendanceTemplateIdsActive(templateIds);
        if (check.error) return res.status(400).json({ error: check.error });
    }
    if (!name || phone.length < 12) return res.status(400).json({ error: 'invalid_payload' });
    const botPhone = getBotPhoneDigits();
    if (botPhone && (phone === botPhone || phone.endsWith(botPhone.slice(-11)))) {
        return res.status(400).json({ error: 'cannot_use_bot_own_number' });
    }
    const jid = toWhatsappJid(phone);
    const confirmed = isKnownWhatsappForAttendance(jid) ? 1 : 0;
    try {
        const now = Date.now();
        const r = db.prepare(`
            INSERT INTO attendance_employees (name, role, whatsapp_phone, whatsapp_jid, whatsapp_confirmed, notes, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(name, role, phone, jid, confirmed, notes, now, now);
        const employeeId = Number(r.lastInsertRowid);
        let templateSummary = null;
        if (templateIds.length) {
            const applied = applyAttendanceTemplatesToEmployee({
                employeeId,
                templateIds,
                replace: true,
                toleranceMin: 5,
                actor: user.username,
                endpoint: '/admin/attendance/employees'
            });
            if (applied.error) {
                db.prepare('DELETE FROM attendance_employees WHERE id=?').run(employeeId);
                return res.status(400).json({ error: applied.error });
            }
            templateSummary = applied;
        }
        logAdminAction('attendance.employee.create', user.username, String(employeeId), { name, role, roleCatalogId, phone, templateIdsCount: templateIds.length }, req.socket.remoteAddress);
        res.json({ ok: true, id: employeeId, confirmed: !!confirmed, templateSummary });
    } catch (e) {
        if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'phone_already_exists' });
        return res.status(500).json({ error: 'employee_create_failed' });
    }
});

app.put('/admin/attendance/employees/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_employees WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const name = sanitizePublicText(req.body?.name ?? row.name, 120);
    const roleCatalogItem = resolveAttendanceEmployeeRoleCatalog(
        req.body?.roleActivityId,
        req.body?.role === undefined ? row.role : req.body?.role
    );
    if (!roleCatalogItem) return res.status(400).json({ error: 'invalid_role_catalog' });
    const role = sanitizePublicText(roleCatalogItem.name, 80) || ATTENDANCE_DEFAULT_EMPLOYEE_ROLE;
    const roleCatalogId = Number(roleCatalogItem.id || 0) || null;
    const hasTemplateIds = Object.prototype.hasOwnProperty.call(req.body || {}, 'templateIds');
    if (hasTemplateIds && !Array.isArray(req.body?.templateIds)) return res.status(400).json({ error: 'invalid_template_ids' });
    const templateIds = hasTemplateIds ? normalizeAttendanceTemplateIds(req.body?.templateIds) : [];
    if (hasTemplateIds && templateIds.length && !isAttendanceTeacherRole(role)) return res.status(400).json({ error: 'not_teacher_for_class' });
    if (hasTemplateIds && templateIds.length) {
        const check = validateAttendanceTemplateIdsActive(templateIds);
        if (check.error) return res.status(400).json({ error: check.error });
    }
    const notes = String(req.body?.notes ?? row.notes ?? '').slice(0, 500);
    const phone = normalizePhoneDigits(req.body?.phone ?? row.whatsapp_phone);
    const active = req.body?.active === undefined ? row.active : (req.body?.active ? 1 : 0);
    if (!name || phone.length < 12) return res.status(400).json({ error: 'invalid_payload' });
    const botPhone = getBotPhoneDigits();
    if (botPhone && (phone === botPhone || phone.endsWith(botPhone.slice(-11)))) {
        return res.status(400).json({ error: 'cannot_use_bot_own_number' });
    }
    const jid = toWhatsappJid(phone);
    const confirmed = row.whatsapp_confirmed || isKnownWhatsappForAttendance(jid) ? 1 : 0;
    try {
        db.prepare(`
            UPDATE attendance_employees
            SET name=?, role=?, notes=?, whatsapp_phone=?, whatsapp_jid=?, whatsapp_confirmed=?, active=?, updated_at=?
            WHERE id=?
        `).run(name, role, notes, phone, jid, confirmed, active, Date.now(), id);
        let templateSummary = null;
        if (hasTemplateIds) {
            const applied = applyAttendanceTemplatesToEmployee({
                employeeId: id,
                templateIds,
                replace: true,
                toleranceMin: 5,
                actor: user.username,
                endpoint: '/admin/attendance/employees/:id'
            });
            if (applied.error) return res.status(400).json({ error: applied.error });
            templateSummary = applied;
        }
        logAdminAction('attendance.employee.update', user.username, String(id), { name, role, roleCatalogId, phone, active, templateIdsCount: hasTemplateIds ? templateIds.length : null }, req.socket.remoteAddress);
        res.json({ ok: true, templateSummary });
    } catch (e) {
        if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ error: 'phone_already_exists' });
        return res.status(500).json({ error: 'employee_update_failed' });
    }
});

app.get('/admin/attendance/employees/:id/templates', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const employee = db.prepare('SELECT id, name, role, active FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee) return res.status(404).json({ error: 'employee_not_found' });
    const selectedTemplateIds = db.prepare(`
        SELECT DISTINCT template_id
        FROM attendance_schedules
        WHERE employee_id=? AND active=1 AND source_type='template' AND template_id IS NOT NULL
        ORDER BY template_id ASC
    `).all(employeeId).map((r) => Number(r.template_id)).filter((n) => Number.isFinite(n) && n > 0);
    const templates = getAttendanceClassTemplates({ activeOnly: true });
    res.json({ employee, selectedTemplateIds, templates });
});

app.post('/admin/attendance/employees/:id/templates/apply', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    if (!Array.isArray(req.body?.templateIds)) return res.status(400).json({ error: 'invalid_template_ids' });
    const templateIds = normalizeAttendanceTemplateIds(req.body?.templateIds);
    const replace = !!req.body?.replace;
    const toleranceMin = Math.max(0, Math.min(180, Number(req.body?.toleranceMin || 5)));
    const applied = applyAttendanceTemplatesToEmployee({
        employeeId,
        templateIds,
        replace,
        toleranceMin,
        actor: user.username,
        endpoint: '/admin/attendance/employees/:id/templates/apply'
    });
    if (applied.error) return res.status(400).json({ error: applied.error });
    logAdminAction('attendance.employee.templates.apply', user.username, String(employeeId), {
        templateIds,
        replace,
        toleranceMin,
        inserted: applied.inserted,
        skipped: applied.skipped,
        deactivated: applied.deactivated
    }, req.socket.remoteAddress);
    res.json({ ok: true, ...applied });
});

app.delete('/admin/attendance/employees/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    db.prepare('UPDATE attendance_employees SET active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    logAdminAction('attendance.employee.deactivate', user.username, String(id), {}, req.socket.remoteAddress);
    res.json({ ok: true });
});

app.get('/admin/attendance/vacations', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const employeeId = Number(req.query.employeeId || 0);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const employee = db.prepare('SELECT id, name, role FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee) return res.status(404).json({ error: 'employee_not_found' });
    const items = listEmployeeVacations(employeeId);
    res.json({ ok: true, employee, items });
});

app.post('/admin/attendance/vacations', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const employeeId = Number(req.body?.employeeId || 0);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const employee = db.prepare('SELECT id, name FROM attendance_employees WHERE id=? AND active=1').get(employeeId);
    if (!employee) return res.status(400).json({ error: 'invalid_employee' });
    const created = createVacation({
        employeeId,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate,
        note: req.body?.note,
        createdBy: user.username
    });
    if (!created.ok) return res.status(400).json({ error: created.error || 'invalid_payload' });
    logAdminAction('attendance.vacation.create', user.username, String(created.item?.id || ''), {
        employeeId,
        startDate: created.item?.start_date,
        endDate: created.item?.end_date
    }, req.socket.remoteAddress);
    res.json({ ok: true, item: created.item });
});

app.delete('/admin/attendance/vacations/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_vacations WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const item = deactivateVacation(id);
    logAdminAction('attendance.vacation.deactivate', user.username, String(id), { employeeId: row.employee_id }, req.socket.remoteAddress);
    res.json({ ok: true, item });
});

app.get('/admin/attendance/justifications', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const employeeId = Number(req.query.employeeId || 0);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const from = parseDateKeyInput(req.query.from || dateKeyFromTs(Date.now()));
    const to = parseDateKeyInput(req.query.to || from);
    if (!from || !to || from > to) return res.status(400).json({ error: 'invalid_date_range' });
    const items = db.prepare(`
        SELECT *
        FROM attendance_absence_justifications
        WHERE employee_id=? AND date_key BETWEEN ? AND ?
        ORDER BY date_key DESC, id DESC
        LIMIT 300
    `).all(employeeId, from, to);
    res.json({ ok: true, items });
});

app.post('/admin/attendance/justifications', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const employeeId = Number(req.body?.employeeId || 0);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const employee = db.prepare('SELECT id FROM attendance_employees WHERE id=? AND active=1').get(employeeId);
    if (!employee) return res.status(400).json({ error: 'invalid_employee' });
    const dateKey = parseDateKeyInput(req.body?.date);
    const reason = sanitizePublicText(req.body?.reason, 280);
    if (!dateKey || !reason || reason.length < 5) return res.status(400).json({ error: 'invalid_payload' });
    const status = ['approved_auto', 'approved_manual', 'rejected'].includes(String(req.body?.status || ''))
        ? String(req.body.status)
        : 'approved_manual';
    const saved = upsertAttendanceAbsenceJustification({
        employeeId,
        dateKey,
        reason,
        source: 'panel',
        status
    });
    logAdminAction('attendance.justification.create', user.username, String(saved?.id || ''), { employeeId, dateKey, status }, req.socket.remoteAddress);
    res.json({ ok: true, item: saved });
});

app.put('/admin/attendance/justifications/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id || 0);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT * FROM attendance_absence_justifications WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const reason = req.body?.reason === undefined ? row.reason : sanitizePublicText(req.body?.reason, 280);
    const status = req.body?.status === undefined ? row.status : String(req.body?.status || '');
    if (!reason || reason.length < 5) return res.status(400).json({ error: 'invalid_payload' });
    if (!['approved_auto', 'approved_manual', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    db.prepare('UPDATE attendance_absence_justifications SET reason=?, status=?, updated_at=? WHERE id=?')
        .run(reason, status, Date.now(), id);
    const updated = db.prepare('SELECT * FROM attendance_absence_justifications WHERE id=?').get(id);
    logAdminAction('attendance.justification.update', user.username, String(id), { status }, req.socket.remoteAddress);
    res.json({ ok: true, item: updated });
});

app.get('/admin/attendance/schedules', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const employeeId = Number(req.query.employeeId || 0);
    const baseSql = `
        SELECT s.*,
               COALESCE(s.activity_label, s.class_name, '') AS activity_label_resolved,
               c.type AS catalog_type,
               c.name AS catalog_name,
               c.default_value AS catalog_default_value,
               c.active AS catalog_active
        FROM attendance_schedules s
        LEFT JOIN attendance_activity_catalog c ON c.id = s.activity_id
        WHERE s.active=1
    `;
    const rows = Number.isFinite(employeeId) && employeeId > 0
        ? db.prepare(`${baseSql} AND s.employee_id=? ORDER BY s.weekday ASC, s.start_time ASC`).all(employeeId)
        : db.prepare(`${baseSql} ORDER BY s.employee_id ASC, s.weekday ASC, s.start_time ASC`).all();
    res.json({ schedules: rows });
});

app.post('/admin/attendance/schedules', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const employeeId = Number(req.body?.employeeId || 0);
    const weekday = Number(req.body?.weekday);
    const startTime = String(req.body?.startTime || '');
    const endTime = String(req.body?.endTime || '');
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    const employee = db.prepare('SELECT id, role, active FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee || !employee.active) return res.status(400).json({ error: 'invalid_employee' });
    const scheduleType = parseAttendanceActivityTypeStrict(req.body?.scheduleType);
    const activityId = Number(req.body?.activityId || 0);
    if (!scheduleType) return res.status(400).json({ error: 'invalid_schedule_type' });
    if (!Number.isFinite(activityId) || activityId <= 0) return res.status(400).json({ error: 'invalid_activity' });
    const activity = db.prepare('SELECT id, type, name, default_value, active FROM attendance_activity_catalog WHERE id=?').get(activityId);
    if (!activity || !activity.active) return res.status(400).json({ error: 'invalid_activity' });
    if (parseAttendanceActivityTypeStrict(activity.type) !== scheduleType) return res.status(400).json({ error: 'activity_type_mismatch' });
    if (scheduleType === 'class' && !isAttendanceTeacherRole(employee.role)) {
        logAdminAction('attendance.schedule.blocked_role_rule', user.username, String(employeeId), {
            employeeId,
            employeeRole: String(employee.role || ''),
            scheduleType,
            activityId,
            endpoint: '/admin/attendance/schedules'
        }, req.socket.remoteAddress);
        return res.status(400).json({ error: 'not_teacher_for_class' });
    }
    const activityLabel = sanitizePublicText(activity.name || '', 80) || 'Atividade';
    const requestedValuePerClass = normalizeOptionalNumberInput(req.body?.valuePerClass);
    const valuePerClass = computeValuePerClass({
        scheduleType,
        rawValue: requestedValuePerClass,
        fallbackValue: activity.default_value
    });
    if (Number.isNaN(valuePerClass)) return res.status(400).json({ error: 'invalid_value_per_class' });
    const toleranceMin = Math.max(0, Math.min(180, Number(req.body?.toleranceMin || 5)));
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'invalid_weekday' });
    if (parseHHMMToMinutes(startTime) === null || parseHHMMToMinutes(endTime) === null) return res.status(400).json({ error: 'invalid_time' });
    const now = Date.now();
    const r = db.prepare(`
        INSERT INTO attendance_schedules (employee_id, weekday, start_time, end_time, class_name, schedule_type, activity_id, activity_label, value_per_class, tolerance_min, source_type, template_id, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, 1, ?, ?)
    `).run(
        employeeId,
        weekday,
        startTime,
        endTime,
        activityLabel,
        scheduleType,
        activityId,
        activityLabel,
        valuePerClass,
        toleranceMin,
        now,
        now
    );
    logAdminAction('attendance.schedule.create', user.username, String(r.lastInsertRowid), { employeeId, weekday, startTime, endTime, scheduleType, activityId, activityLabel, valuePerClass, toleranceMin }, req.socket.remoteAddress);
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

app.put('/admin/attendance/schedules/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM attendance_schedules WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const employeeId = Number(row.employee_id || 0);
    const employee = db.prepare('SELECT id, role, active FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee || !employee.active) return res.status(400).json({ error: 'invalid_employee' });
    const weekday = req.body?.weekday === undefined ? row.weekday : Number(req.body?.weekday);
    const startTime = req.body?.startTime === undefined ? row.start_time : String(req.body?.startTime || '');
    const endTime = req.body?.endTime === undefined ? row.end_time : String(req.body?.endTime || '');
    const scheduleType = req.body?.scheduleType === undefined
        ? parseAttendanceActivityTypeStrict(row.schedule_type)
        : parseAttendanceActivityTypeStrict(req.body?.scheduleType);
    if (!scheduleType) return res.status(400).json({ error: 'invalid_schedule_type' });
    const activityId = req.body?.activityId === undefined ? Number(row.activity_id || 0) : Number(req.body?.activityId || 0);
    if (!Number.isFinite(activityId) || activityId <= 0) return res.status(400).json({ error: 'invalid_activity' });
    const activity = db.prepare('SELECT id, type, name, default_value, active FROM attendance_activity_catalog WHERE id=?').get(activityId);
    if (!activity || !activity.active) return res.status(400).json({ error: 'invalid_activity' });
    if (parseAttendanceActivityTypeStrict(activity.type) !== scheduleType) return res.status(400).json({ error: 'activity_type_mismatch' });
    if (scheduleType === 'class' && !isAttendanceTeacherRole(employee.role)) {
        logAdminAction('attendance.schedule.blocked_role_rule', user.username, String(employeeId), {
            employeeId,
            employeeRole: String(employee.role || ''),
            scheduleType,
            activityId,
            endpoint: '/admin/attendance/schedules/:id'
        }, req.socket.remoteAddress);
        return res.status(400).json({ error: 'not_teacher_for_class' });
    }
    const activityLabel = sanitizePublicText(activity.name || '', 80) || 'Atividade';
    const className = activityLabel;
    const rawValueInput = req.body?.valuePerClass === undefined
        ? Number(row.value_per_class || 0)
        : normalizeOptionalNumberInput(req.body?.valuePerClass);
    const valuePerClass = computeValuePerClass({
        scheduleType,
        rawValue: rawValueInput,
        fallbackValue: activity.default_value
    });
    if (Number.isNaN(valuePerClass)) return res.status(400).json({ error: 'invalid_value_per_class' });
    const toleranceMin = req.body?.toleranceMin === undefined ? Number(row.tolerance_min || 5) : Math.max(0, Math.min(180, Number(req.body?.toleranceMin || 5)));
    const active = req.body?.active === undefined ? row.active : (req.body?.active ? 1 : 0);
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return res.status(400).json({ error: 'invalid_weekday' });
    if (parseHHMMToMinutes(startTime) === null || parseHHMMToMinutes(endTime) === null) return res.status(400).json({ error: 'invalid_time' });
    db.prepare(`
        UPDATE attendance_schedules
        SET weekday=?, start_time=?, end_time=?, class_name=?, schedule_type=?, activity_id=?, activity_label=?, value_per_class=?, tolerance_min=?, active=?, updated_at=?
        WHERE id=?
    `).run(weekday, startTime, endTime, className, scheduleType, activityId, activityLabel, valuePerClass, toleranceMin, active, Date.now(), id);
    logAdminAction('attendance.schedule.update', user.username, String(id), { weekday, startTime, endTime, className, scheduleType, activityId, activityLabel, valuePerClass, toleranceMin, active }, req.socket.remoteAddress);
    res.json({ ok: true });
});

app.delete('/admin/attendance/schedules/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = Number(req.params.id);
    db.prepare('UPDATE attendance_schedules SET active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    logAdminAction('attendance.schedule.deactivate', user.username, String(id), {}, req.socket.remoteAddress);
    res.json({ ok: true });
});

app.post('/admin/attendance/punch/manual', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const employeeId = Number(req.body?.employeeId || 0);
    const eventType = String(req.body?.eventType || '').toLowerCase();
    const note = sanitizePublicText(req.body?.note, 180);
    if (!Number.isFinite(employeeId) || employeeId <= 0) return res.status(400).json({ error: 'invalid_employee' });
    if (!['entry', 'exit'].includes(eventType)) return res.status(400).json({ error: 'invalid_event' });
    const punchContext = resolveAttendancePunchContext(employeeId, Date.now(), eventType);
    if (!punchContext.ok) return res.status(400).json({ error: punchContext.error || 'invalid_punch_window' });
    createAttendanceEvent(employeeId, eventType, 'panel', Date.now(), '', note || `Registro manual por ${user.username}`);
    logAdminAction('attendance.punch.manual', user.username, String(employeeId), { eventType, note }, req.socket.remoteAddress);
    res.json({ ok: true });
});

app.get('/admin/attendance/report', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const from = String(req.query.from || dateKeyFromTs(Date.now()));
    const to = String(req.query.to || from);
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return res.status(400).json({ error: 'employee_required' });
    }
    const employee = db.prepare('SELECT id, name, role, whatsapp_phone FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee) return res.status(404).json({ error: 'employee_not_found' });
    const report = computeAttendanceReport({ fromDate: from, toDate: to, employeeId });
    res.json({ from, to, employee, ...report });
});

app.get('/admin/attendance/export.csv', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const from = String(req.query.from || dateKeyFromTs(Date.now()));
    const to = String(req.query.to || from);
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return res.status(400).json({ error: 'employee_required' });
    }
    const employee = db.prepare('SELECT id, name, role, whatsapp_phone FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee) return res.status(404).json({ error: 'employee_not_found' });
    const report = computeAttendanceReport({ fromDate: from, toDate: to, employeeId });
    let csv = '\uFEFFRELATÓRIO DE PONTO - ACADEMIA OXIGÊNIO\n';
    csv += `Funcionário;"${String(employee.name || '').replace(/"/g, '""')}"\n`;
    csv += `Função;"${String(employee.role || '').replace(/"/g, '""')}"\n`;
    csv += `WhatsApp;"${String(employee.whatsapp_phone || '').replace(/"/g, '""')}"\n`;
    csv += `Período;"${from} a ${to}"\n`;
    csv += '\n';
    csv += 'RESUMO;VALOR\n';
    csv += `Dias avaliados;${report.summary.totalDays || 0}\n`;
    csv += `Dias presentes;${report.summary.presentDays || 0}\n`;
    csv += `Faltas;${report.summary.absences || 0}\n`;
    csv += `Faltas justificadas;${report.summary.justifiedAbsences || 0}\n`;
    csv += `Faltas não justificadas;${report.summary.unjustifiedAbsences || 0}\n`;
    csv += `Dias de férias;${report.summary.vacationDays || 0}\n`;
    csv += `Dias com atraso;${report.summary.lateDays || 0}\n`;
    csv += `Minutos de atraso;${report.summary.lateMinutes || 0}\n`;
    csv += `Vezes sem saída;${report.summary.missingExitDays || 0}\n`;
    csv += `Horas trabalhadas (HH:MM);${report.summary.workedHours || '00:00'}\n`;
    csv += `Total de entradas registradas;${report.summary.totalEntries || 0}\n`;
    csv += `Total de saídas registradas;${report.summary.totalExits || 0}\n`;
    csv += `Blocos previstos (aulas/turnos);${report.summary.expectedBlocks || 0}\n`;
    csv += `Blocos no horário;${report.summary.blocksOnTime || 0}\n`;
    csv += `Blocos com atraso na entrada;${report.summary.blocksLateStart || 0}\n`;
    csv += `Blocos sem entrada;${report.summary.blocksMissingEntry || 0}\n`;
    csv += `Blocos sem saída;${report.summary.blocksMissingExit || 0}\n`;
    csv += `Blocos com saída antecipada;${report.summary.blocksEarlyExit || 0}\n`;
    csv += `Aulas previstas;${report.summary.classExpected || 0}\n`;
    csv += `Aulas cumpridas;${report.summary.classCompleted || 0}\n`;
    csv += `Aulas não cumpridas;${report.summary.classMissed || 0}\n`;
    csv += `Total aulas (R$);${report.summary.classAmountTotal || 0}\n`;
    csv += '\n';
    csv += 'DETALHES POR BLOCO (AULAS/TURNOS)\n';
    csv += 'Data;Dia;Bloco;Aulas/Turnos;Início Previsto;Fim Previsto;Entrada Real;Saída Real;Status Entrada;Status Saída;Atraso Entrada(min);Saída Antecipada(min);Qtd Aulas;Aulas Cumpridas;Valor Bloco;Detalhamento Valor;Geo Entrada;Dist Entrada(m);Geo Saída;Dist Saída(m)\n';
    (report.classRows || []).forEach((r) => {
        const line = [
            r.date,
            r.weekday_label,
            r.block_index,
            r.classes_label || '',
            r.expected_start_hhmm || '',
            r.expected_end_hhmm || '',
            r.entry_hhmm || '',
            r.exit_hhmm || '',
            r.start_status || '',
            r.end_status || '',
            r.late_min || 0,
            r.early_exit_min || 0,
            r.class_items_count || 0,
            r.class_items_completed || 0,
            r.class_amount_currency || formatCurrencyBRL(r.class_amount || 0),
            r.class_amount_breakdown || '',
            r.entry_geo_status || '',
            r.entry_geo_distance_m ?? '',
            r.exit_geo_status || '',
            r.exit_geo_distance_m ?? ''
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
        csv += `${line}\n`;
    });
    csv += '\n';
    csv += 'DETALHES\n';
    csv += 'Data;Dia;Início Previsto;Saída Prevista;Primeira Entrada;Última Saída;Geo Primeira Entrada;Dist Primeira Entrada(m);Geo Última Saída;Dist Última Saída(m);Entradas (todas);Saídas (todas);Qtd Entradas;Qtd Saídas;Saída Assumida;Horas Trabalhadas;Atraso(min);Faltou;Falta Justificada;Em Férias;Motivo Justificativa;Mensagens;Tentativas Fora Área;Aula\n';
    report.rows.forEach((r) => {
        const line = [
            r.date,
            r.weekday_label,
            r.expected_start,
            r.expected_end,
            r.first_entry_hhmm || '',
            r.last_exit_hhmm || '',
            r.first_entry_geo_status || '',
            r.first_entry_geo_distance_m ?? '',
            r.last_exit_geo_status || '',
            r.last_exit_geo_distance_m ?? '',
            r.entries_all || '',
            r.exits_all || '',
            r.entries_count || 0,
            r.exits_count || 0,
            r.exit_assumed ? 'SIM' : 'NÃO',
            r.worked_hhmm || '00:00',
            r.late_min,
            r.absent ? 'SIM' : 'NÃO',
            r.justified_absence ? 'SIM' : 'NÃO',
            r.on_vacation ? 'SIM' : 'NÃO',
            r.justification_reason || '',
            r.message_count,
            r.geo_outside_attempts || 0,
            r.class_name || ''
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
        csv += `${line}\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ponto_${from}_a_${to}.csv"`);
    res.send(csv);
});

app.get('/admin/attendance/export.html', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const from = String(req.query.from || dateKeyFromTs(Date.now()));
    const to = String(req.query.to || from);
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : null;
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
        return res.status(400).send('employee_required');
    }
    const employee = db.prepare('SELECT id, name, role, whatsapp_phone FROM attendance_employees WHERE id=?').get(employeeId);
    if (!employee) return res.status(404).send('employee_not_found');
    const report = computeAttendanceReport({ fromDate: from, toDate: to, employeeId });

    const esc = (v) => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const summaryRows = [
        ['Dias avaliados', report.summary.totalDays || 0],
        ['Dias presentes', report.summary.presentDays || 0],
        ['Faltas', report.summary.absences || 0],
        ['Faltas justificadas', report.summary.justifiedAbsences || 0],
        ['Faltas não justificadas', report.summary.unjustifiedAbsences || 0],
        ['Dias de férias', report.summary.vacationDays || 0],
        ['Dias com atraso', report.summary.lateDays || 0],
        ['Minutos de atraso', report.summary.lateMinutes || 0],
        ['Vezes sem saída', report.summary.missingExitDays || 0],
        ['Horas trabalhadas (HH:MM)', report.summary.workedHours || '00:00'],
        ['Entradas registradas', report.summary.totalEntries || 0],
        ['Saídas registradas', report.summary.totalExits || 0],
        ['Blocos previstos', report.summary.expectedBlocks || 0],
        ['Blocos no horário', report.summary.blocksOnTime || 0],
        ['Blocos com atraso no início', report.summary.blocksLateStart || 0],
        ['Blocos sem entrada', report.summary.blocksMissingEntry || 0],
        ['Blocos sem saída', report.summary.blocksMissingExit || 0],
        ['Blocos com saída antecipada', report.summary.blocksEarlyExit || 0],
        ['Aulas previstas', report.summary.classExpected || 0],
        ['Aulas cumpridas', report.summary.classCompleted || 0],
        ['Aulas não cumpridas', report.summary.classMissed || 0],
        ['Total aulas', report.summary.classAmountCurrency || formatCurrencyBRL(report.summary.classAmountTotal || 0)],
        ['Entradas com localização OK', report.summary.geoInsideEntries || 0],
        ['Entradas com justificativa', report.summary.geoJustifiedEntries || 0],
        ['Entradas sem geostatus', report.summary.geoMissingEntries || 0]
    ];

    const summaryHtml = summaryRows
        .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
        .join('');

    const blockRowsHtml = (report.classRows || [])
        .map((r) => `<tr>
            <td>${esc(r.date)}</td>
            <td>${esc(r.weekday_label)}</td>
            <td>${esc(r.block_index)}</td>
            <td>${esc(r.classes_label || '-')}</td>
            <td>${esc(r.expected_start_hhmm || '--:--')}</td>
            <td>${esc(r.expected_end_hhmm || '--:--')}</td>
            <td>${esc(r.entry_hhmm || '--:--')}</td>
            <td>${esc(r.exit_hhmm || '--:--')}</td>
            <td>${esc(r.start_status || '')}</td>
            <td>${esc(r.end_status || '')}</td>
            <td>${esc(r.late_min || 0)}</td>
            <td>${esc(r.early_exit_min || 0)}</td>
            <td>${esc(r.class_items_count || 0)}</td>
            <td>${esc(r.class_items_completed || 0)}</td>
            <td>${esc(r.class_amount_currency || formatCurrencyBRL(r.class_amount || 0))}</td>
            <td>${esc(r.class_amount_breakdown || '-')}</td>
            <td>${esc(r.entry_geo_status || '-')}</td>
            <td>${esc(r.entry_geo_distance_m ?? '-')}</td>
            <td>${esc(r.exit_geo_status || '-')}</td>
            <td>${esc(r.exit_geo_distance_m ?? '-')}</td>
        </tr>`)
        .join('');

    const dayRowsHtml = (report.rows || [])
        .map((r) => `<tr>
            <td>${esc(r.date)}</td>
            <td>${esc(r.weekday_label)}</td>
            <td>${esc(r.expected_start || '--:--')}</td>
            <td>${esc(r.expected_end || '--:--')}</td>
            <td>${esc(r.first_entry_hhmm || '--:--')}</td>
            <td>${esc(r.last_exit_hhmm || '--:--')}</td>
            <td>${esc(r.first_entry_geo_status || '--')}</td>
            <td>${esc(r.first_entry_geo_distance_m ?? '--')}</td>
            <td>${esc(r.last_exit_geo_status || '--')}</td>
            <td>${esc(r.last_exit_geo_distance_m ?? '--')}</td>
            <td>${esc(r.entries_all || '--')}</td>
            <td>${esc(r.exits_all || '--')}</td>
            <td>${esc(r.worked_hhmm || '00:00')}</td>
            <td>${esc(r.late_min || 0)}</td>
            <td>${r.absent ? 'SIM' : 'NÃO'}</td>
            <td>${r.justified_absence ? 'SIM' : 'NÃO'}</td>
            <td>${r.on_vacation ? 'SIM' : 'NÃO'}</td>
            <td>${esc(r.justification_reason || '-')}</td>
            <td>${esc(r.message_count || 0)}</td>
            <td>${esc(r.geo_outside_attempts || 0)}</td>
            <td>${esc(r.class_name || '-')}</td>
        </tr>`)
        .join('');

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório de Ponto - ${esc(employee.name)} (${esc(from)} a ${esc(to)})</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 16px; background: #0f1116; color: #e7edf5; }
    .wrap { max-width: 1200px; margin: 0 auto; display: grid; gap: 14px; }
    .card { background: #171a21; border: 1px solid #2b3040; border-radius: 10px; padding: 12px; overflow: auto; }
    h1,h2,h3 { margin: 0 0 10px 0; }
    .meta { display: grid; gap: 4px; color: #b7c3d8; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #2b3040; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #202636; position: sticky; top: 0; z-index: 1; }
    .hint { color: #9fb2cd; font-size: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { border: 1px solid #2b3040; background: #202636; color: #e7edf5; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    @media print { body { background: #fff; color: #111; } .card { border: 1px solid #ccc; background: #fff; } th, td { border-color: #ccc; } .actions { display:none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Relatório de Ponto</h1>
      <div class="meta">
        <div><strong>Funcionário:</strong> ${esc(employee.name)}</div>
        <div><strong>Função:</strong> ${esc(employee.role || '-')}</div>
        <div><strong>WhatsApp:</strong> ${esc(employee.whatsapp_phone || '-')}</div>
        <div><strong>Período:</strong> ${esc(from)} a ${esc(to)}</div>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
      </div>
    </div>

    <div class="card">
      <h2>Resumo</h2>
      <table><tbody>${summaryHtml}</tbody></table>
    </div>

    <div class="card">
      <h2>Detalhes por Bloco (Aulas/Turnos)</h2>
      <div class="hint">Para aulas seguidas (intervalo <= ${ATTENDANCE_CONSECUTIVE_GAP_MIN} min), considera 1 entrada no início e 1 saída no fim.</div>
      <table>
        <thead>
          <tr>
            <th>Data</th><th>Dia</th><th>Bloco</th><th>Aulas/Turnos</th><th>Início Prev.</th><th>Fim Prev.</th><th>Entrada</th><th>Saída</th><th>Status Entrada</th><th>Status Saída</th><th>Atraso (min)</th><th>Saída Antecipada (min)</th><th>Qtd Aulas</th><th>Aulas Cumpridas</th><th>Valor Bloco</th><th>Detalhamento</th><th>Geo Entrada</th><th>Dist Entrada (m)</th><th>Geo Saída</th><th>Dist Saída (m)</th>
          </tr>
        </thead>
        <tbody>${blockRowsHtml || '<tr><td colspan="20">Sem dados</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>Detalhes Diários</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th><th>Dia</th><th>Início Prev.</th><th>Saída Prev.</th><th>Primeira Entrada</th><th>Última Saída</th><th>Geo Entrada</th><th>Dist Entrada (m)</th><th>Geo Saída</th><th>Dist Saída (m)</th><th>Entradas (todas)</th><th>Saídas (todas)</th><th>Horas</th><th>Atraso</th><th>Faltou</th><th>Falta Just.</th><th>Férias</th><th>Motivo</th><th>Msgs</th><th>Tentativas Fora Área</th><th>Aula</th>
          </tr>
        </thead>
        <tbody>${dayRowsHtml || '<tr><td colspan="21">Sem dados</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

app.get('/admin/attendance/templates/export.html', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const activeRaw = String(req.query.activeOnly || req.query.active || '1').trim().toLowerCase();
    const activeOnly = activeRaw === '1' || activeRaw === 'true';
    const source = String(req.query.source || '').trim().toLowerCase();
    const templates = getAttendanceClassTemplates({ activeOnly, source });
    const generatedAt = Date.now();

    const esc = (v) => String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const rowsByWeekday = new Map();
    for (let day = 0; day < 7; day += 1) rowsByWeekday.set(day, []);
    for (const tpl of templates) {
        const weekday = Number(tpl.weekday);
        if (!rowsByWeekday.has(weekday)) rowsByWeekday.set(weekday, []);
        rowsByWeekday.get(weekday).push(tpl);
    }

    const tableRows = [];
    for (let day = 0; day < 7; day += 1) {
        const items = rowsByWeekday.get(day) || [];
        if (!items.length) {
            tableRows.push(`<tr class="empty-row"><td>${esc(WEEKDAY_LABELS[day] || `Dia ${day}`)}</td><td colspan="6">Sem aulas cadastradas</td></tr>`);
            continue;
        }
        for (const item of items) {
            tableRows.push(`<tr>
                <td>${esc(WEEKDAY_LABELS[day] || `Dia ${day}`)}</td>
                <td>${esc(item.activity_label || '-')}</td>
                <td>${esc(item.start_time || '--:--')}</td>
                <td>${esc(item.end_time || '--:--')}</td>
                <td>${esc(item.duration_min || 0)} min</td>
                <td>${esc(item.source === ATTENDANCE_TEMPLATE_SOURCE_CONTEXT ? 'Contexto' : 'Manual')}</td>
                <td><span class="status ${item.active ? 'ok' : 'off'}">${item.active ? 'Ativa' : 'Inativa'}</span></td>
            </tr>`);
        }
    }

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Grade de Aulas - Academia Oxigenio</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --panel: #111214;
      --surface: #17191d;
      --text: #f8f8f8;
      --muted: #c9c9c9;
      --line: #2b2f36;
      --accent: #ff8a00;
      --accent-strong: #ff6a00;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top right, rgba(255, 138, 0, 0.15), transparent 45%), var(--bg);
      color: var(--text);
      font-family: "Segoe UI", Arial, sans-serif;
      padding: 18px;
    }
    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      gap: 14px;
    }
    .card {
      background: linear-gradient(180deg, var(--panel), var(--surface));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 8px 26px rgba(0, 0, 0, 0.28);
    }
    h1, h2 {
      margin: 0 0 10px 0;
      line-height: 1.2;
      letter-spacing: .02em;
    }
    h1 { color: var(--accent); font-size: 26px; }
    h2 { color: var(--text); font-size: 18px; }
    .meta {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 14px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .btn {
      border: 1px solid var(--accent-strong);
      background: linear-gradient(180deg, rgba(255, 138, 0, 0.15), rgba(255, 106, 0, 0.12));
      color: #ffe8c9;
      padding: 8px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 700;
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #0e1013;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: left;
      vertical-align: middle;
      white-space: nowrap;
    }
    th {
      background: #181b20;
      color: #ffd39a;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.01); }
    tbody tr:hover td { background: rgba(255, 138, 0, 0.08); }
    .empty-row td {
      color: #b9b9b9;
      font-style: italic;
    }
    .status {
      display: inline-flex;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .status.ok {
      color: #ffbd73;
      border-color: rgba(255, 138, 0, 0.6);
      background: rgba(255, 138, 0, 0.15);
    }
    .status.off {
      color: #c8c8c8;
      border-color: #4a4f5a;
      background: rgba(255, 255, 255, 0.06);
    }
    .hint {
      color: #d5d5d5;
      font-size: 12px;
    }
    @media print {
      body { background: #fff; color: #111; padding: 0; }
      .card, .table-wrap { box-shadow: none; border-color: #c9c9c9; background: #fff; }
      h1 { color: #111; }
      .actions { display: none; }
      th { color: #111; background: #f2f2f2; }
      tbody tr:hover td { background: transparent; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Grade de Aulas</h1>
      <div class="meta">
        <div><strong>Academia:</strong> Oxigenio</div>
        <div><strong>Total de aulas:</strong> ${esc(templates.length)}</div>
        <div><strong>Filtro:</strong> ${esc(activeOnly ? 'Somente ativas' : 'Ativas + inativas')}</div>
        <div><strong>Gerado em:</strong> ${esc(formatLocalDateTime(generatedAt))}</div>
      </div>
      <div class="actions">
        <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
      </div>
    </div>

    <div class="card">
      <h2>Todos os dias e horarios das aulas</h2>
      <div class="hint">Tabela completa da grade fixa cadastrada no sistema.</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Aula</th>
              <th>Inicio</th>
              <th>Fim</th>
              <th>Duracao</th>
              <th>Origem</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows.join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});
}
}

module.exports = { registerAttendanceAdminRoutes };
