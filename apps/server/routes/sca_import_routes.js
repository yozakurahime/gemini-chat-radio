function registerScaImportRoutes({
    app,
    db,
    fs,
    path,
    crypto,
    XLSX,
    requireAdmin,
    sanitizePublicText,
    normalizePhoneDigits,
    logAdminAction,
    ensureDir,
    isPathInside,
    scaImportUpload,
    SCA_IMPORT_MAX_BYTES,
    scaImportsDir,
    upsertScaAccessBatch
}) {
    const IMPORT_TYPES = new Set(['students', 'access', 'enrollments']);
    const MAPPING_FILE = path.join(scaImportsDir, 'sca_import_mappings.json');
    const DEFAULT_SOURCE = 'sca_manual_upload';
    db.prepare(`
        CREATE TABLE IF NOT EXISTS sca_manual_imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type TEXT NOT NULL,
            original_filename TEXT NOT NULL DEFAULT '',
            source_ext TEXT NOT NULL DEFAULT '',
            csv_filename TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'processed',
            rows_total INTEGER NOT NULL DEFAULT 0,
            accepted_count INTEGER NOT NULL DEFAULT 0,
            rejected_count INTEGER NOT NULL DEFAULT 0,
            mapping_confidence REAL NOT NULL DEFAULT 0,
            mapping_json TEXT NOT NULL DEFAULT '{}',
            result_json TEXT NOT NULL DEFAULT '{}',
            uploaded_by TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL DEFAULT 0
        )
    `).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_manual_imports_type_created ON sca_manual_imports(import_type, created_at DESC)').run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_manual_imports_created ON sca_manual_imports(created_at DESC)').run();

    try {
        db.prepare('ALTER TABLE sca_people ADD COLUMN cpf TEXT DEFAULT \'\'').run();
    } catch (_) {}
    try {
        db.prepare('ALTER TABLE sca_people ADD COLUMN membership_due_at INTEGER DEFAULT 0').run();
    } catch (_) {}
    try {
        db.prepare('ALTER TABLE sca_people ADD COLUMN membership_end_at INTEGER DEFAULT 0').run();
    } catch (_) {}
    try {
        db.prepare('ALTER TABLE sca_people ADD COLUMN membership_updated_at INTEGER DEFAULT 0').run();
    } catch (_) {}
    db.prepare('CREATE INDEX IF NOT EXISTS idx_sca_people_cpf ON sca_people(cpf)').run();

    function normalizeHeaderKey(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '')
            .trim();
    }

    function escapeCsvCell(value) {
        const raw = String(value ?? '');
        if (raw.includes(';') || raw.includes('"') || raw.includes('\n') || raw.includes('\r')) {
            return `"${raw.replace(/"/g, '""')}"`;
        }
        return raw;
    }

    function normalizeCpf(raw) {
        const digits = String(raw || '').replace(/\D/g, '');
        if (digits.length === 11 || digits.length === 14) return digits;
        return '';
    }

    function normalizeExternalId(raw) {
        if (raw == null) return '';
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            const normalized = String(Math.trunc(raw));
            return /^0+$/.test(normalized) ? '' : normalized;
        }
        const text = sanitizePublicText(String(raw || ''), 120).trim();
        if (!text) return '';
        const numericWithZeroDecimals = text.match(/^(\d+)[.,]0+$/);
        if (numericWithZeroDecimals) {
            const normalized = numericWithZeroDecimals[1];
            return /^0+$/.test(normalized) ? '' : normalized;
        }
        if (/^\d+$/.test(text)) {
            return /^0+$/.test(text) ? '' : text;
        }
        return text;
    }

    function normalizeExt(filename = '') {
        return String(path.extname(String(filename || '')) || '').toLowerCase();
    }

    function sanitizeImportType(raw) {
        const type = String(raw || '').trim().toLowerCase();
        return IMPORT_TYPES.has(type) ? type : '';
    }

    function parseSheetBuffer(fileBuffer, originalFilename = '') {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer', raw: false, cellDates: true });
        const firstSheetName = String(workbook?.SheetNames?.[0] || '');
        if (!firstSheetName || !workbook.Sheets[firstSheetName]) throw new Error('spreadsheet_empty');
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: '' }) || [];
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('spreadsheet_empty');
        const normalizedRows = rows.map((row) => (Array.isArray(row) ? row : []));
        const headerIndex = normalizedRows.findIndex((row) => row.some((cell) => String(cell || '').trim() !== ''));
        if (headerIndex < 0) throw new Error('spreadsheet_missing_header');
        const headersRaw = normalizedRows[headerIndex];
        const headers = headersRaw.map((cell, idx) => {
            const txt = sanitizePublicText(cell, 120);
            return txt || `coluna_${idx + 1}`;
        });
        const dataRows = normalizedRows.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
        const csvRows = [headersRaw, ...dataRows];
        const csvText = csvRows
            .map((row) => row.map((cell) => escapeCsvCell(cell)).join(';'))
            .join('\n');
        return {
            headers,
            dataRows,
            csvText,
            rowCount: dataRows.length,
            colCount: headers.length,
            originalFilename
        };
    }

    const FIELD_ALIASES = {
        students: {
            external_id: ['matricula', 'idaluno', 'alunoid', 'codigo', 'codigoaluno', 'externalid', 'id'],
            name: ['nome', 'nomecompleto', 'aluno', 'fullname', 'name'],
            phone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'telefone1', 'telefone2'],
            cpf: ['cpf', 'cpfcnpj', 'cnpj'],
            status: ['status', 'situacao', 'matriculastatus'],
            plan: ['plano', 'modalidade', 'produto', 'plan']
        },
        access: {
            external_id: ['matricula', 'idaluno', 'alunoid', 'codigo', 'codigoaluno', 'externalid', 'id'],
            name: ['nome', 'aluno', 'fullname', 'name'],
            phone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone'],
            event_type: ['tipo', 'evento', 'movimento', 'eventtype', 'tipoevento', 'tipoacesso', 'bloqueado', 'bloqueio', 'status'],
            event_at: ['datahora', 'data', 'horario', 'datetime', 'timestamp', 'eventat', 'acessoem'],
            gate: ['catraca', 'equipamento', 'unidade', 'gate']
        },
        enrollments: {
            external_id: ['matricula', 'idaluno', 'alunoid', 'codigo', 'codigoaluno', 'externalid', 'id'],
            name: ['nome', 'nomecompleto', 'aluno', 'fullname', 'name'],
            phone: ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'telefone1', 'telefone2'],
            cpf: ['cpf', 'cpfcnpj', 'cnpj'],
            plan: ['plano', 'modalidade', 'produto', 'plan', 'pacote', 'turma'],
            enrollment_status: ['status', 'situacao', 'situacaodamatricula', 'statusmatricula', 'situacaomatricula', 'bloqueio', 'motivo'],
            start_at: ['inicio', 'datainicio', 'iniciomatricula', 'iniciodamatricula', 'start'],
            due_at: ['vencimento', 'datavencimento', 'proximovencimento', 'vencimentoem', 'fim'],
            end_at: ['fim', 'datatermino', 'termino', 'validade', 'fimdamatricula', 'expiraem', 'vencimento']
        }
    };

    function getDefaultMapping() {
        return {
            students: {
                external_id: '',
                name: '',
                phone: '',
                cpf: '',
                status: '',
                plan: ''
            },
            access: {
                external_id: '',
                name: '',
                phone: '',
                event_type: '',
                event_at: '',
                gate: ''
            },
            enrollments: {
                external_id: '',
                name: '',
                phone: '',
                cpf: '',
                plan: '',
                enrollment_status: '',
                start_at: '',
                due_at: '',
                end_at: ''
            },
            updated_at: 0,
            updated_by: ''
        };
    }

    function readMappings() {
        ensureDir(scaImportsDir);
        if (!fs.existsSync(MAPPING_FILE)) return getDefaultMapping();
        try {
            const parsed = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
            const fallback = getDefaultMapping();
            return {
                ...fallback,
                ...(parsed || {}),
                students: { ...fallback.students, ...(parsed?.students || {}) },
                access: { ...fallback.access, ...(parsed?.access || {}) },
                enrollments: { ...fallback.enrollments, ...(parsed?.enrollments || {}) }
            };
        } catch (_) {
            return getDefaultMapping();
        }
    }

    function writeMappings(next) {
        ensureDir(scaImportsDir);
        fs.writeFileSync(MAPPING_FILE, JSON.stringify(next, null, 2), 'utf-8');
    }

    function detectAutoMapping(type, headers = []) {
        const aliases = FIELD_ALIASES[type] || {};
        const byNormalized = new Map(headers.map((header) => [normalizeHeaderKey(header), header]));
        const mapping = {};
        Object.keys(aliases).forEach((field) => {
            const fieldAliases = aliases[field];
            let matched = '';
            for (const alias of fieldAliases) {
                const direct = byNormalized.get(normalizeHeaderKey(alias));
                if (direct) {
                    matched = direct;
                    break;
                }
            }
            if (!matched) {
                for (const [normalized, original] of byNormalized.entries()) {
                    if (fieldAliases.some((alias) => normalized.includes(normalizeHeaderKey(alias)))) {
                        matched = original;
                        break;
                    }
                }
            }
            mapping[field] = matched || '';
        });
        return mapping;
    }

    function normalizeManualMappingInput(type, input = {}) {
        const defaults = getDefaultMapping()[type] || {};
        const next = {};
        Object.keys(defaults).forEach((key) => {
            next[key] = sanitizePublicText(input[key] || '', 120) || '';
        });
        return next;
    }

    function resolveMapping(type, headers, savedMapping = {}) {
        const defaults = getDefaultMapping()[type] || {};
        const auto = detectAutoMapping(type, headers);
        const resolved = { ...defaults, ...auto };
        Object.keys(defaults).forEach((key) => {
            const saved = sanitizePublicText(savedMapping[key] || '', 120) || '';
            if (!saved) return;
            const match = headers.find((header) => normalizeHeaderKey(header) === normalizeHeaderKey(saved));
            if (match) resolved[key] = match;
        });
        const values = Object.values(resolved).filter((item) => String(item || '').trim() !== '');
        const confidence = Object.keys(defaults).length > 0 ? (values.length / Object.keys(defaults).length) : 0;

        const missing = [];
        if (type === 'students') {
            if (!resolved.name) missing.push('name');
            if (!resolved.external_id && !resolved.cpf && !resolved.phone) missing.push('external_id|cpf|phone');
        } else if (type === 'access') {
            if (!resolved.event_type) missing.push('event_type');
            if (!resolved.event_at) missing.push('event_at');
            if (!resolved.external_id && !resolved.phone && !resolved.name) missing.push('external_id|phone|name');
        } else if (type === 'enrollments') {
            if (!resolved.external_id && !resolved.cpf && !resolved.phone && !resolved.name) missing.push('external_id|cpf|phone|name');
            if (!resolved.enrollment_status && !resolved.start_at && !resolved.due_at && !resolved.end_at) missing.push('enrollment_status|start_at|due_at|end_at');
        }
        return {
            mapping: resolved,
            confidence,
            missingRequired: missing
        };
    }

    function toRowObject(headers, rowValues) {
        const row = {};
        headers.forEach((header, index) => {
            row[header] = rowValues[index] ?? '';
        });
        return row;
    }

    function parseEventType(raw) {
        const text = String(raw ?? '').trim();
        if (/^-?\d+(?:[.,]\d+)?$/.test(text)) {
            const numeric = Number(text.replace(',', '.'));
            if (Number.isFinite(numeric)) {
                if (numeric === 0) return 'entry';
                if (numeric > 0) return 'denied';
            }
        }
        const value = normalizeHeaderKey(raw);
        if (!value) return '';
        if (['entrada', 'entry', 'in', 'entrou', 'acesso'].includes(value)) return 'entry';
        if (['saida', 'exit', 'out', 'saiu'].includes(value)) return 'exit';
        if (['denied', 'negado', 'bloqueado', 'recusado', 'blocked'].includes(value)) return 'denied';
        if (['liberado', 'allow', 'allowed', 'autorizado'].includes(value)) return 'entry';
        return '';
    }

    function parseEventAt(raw) {
        if (raw instanceof Date && Number.isFinite(raw.getTime())) {
            return raw.getTime();
        }
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
            return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
        }
        const text = String(raw || '').trim();
        if (!text) return 0;
        if (/^\d+$/.test(text)) {
            const num = Number(text);
            if (!Number.isFinite(num) || num <= 0) return 0;
            return num > 1e12 ? Math.floor(num) : Math.floor(num * 1000);
        }
        const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
        if (br) {
            const day = Number(br[1]);
            const month = Number(br[2]);
            const year = Number(br[3]);
            const hh = Number(br[4] || 0);
            const mm = Number(br[5] || 0);
            const ss = Number(br[6] || 0);
            const dt = new Date(year, month - 1, day, hh, mm, ss, 0).getTime();
            return Number.isFinite(dt) ? dt : 0;
        }
        const parsed = Date.parse(text);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function parseEnrollmentStatus(raw) {
        const text = String(raw || '').trim();
        if (!text) return '';
        const norm = normalizeHeaderKey(text);
        if (!norm) return '';
        if (norm.includes('atras') || norm.includes('debito') || norm.includes('inadimpl')) return 'atrasado';
        if (norm.includes('vencid') || norm.includes('expir') || norm.includes('venc')) return 'vencido';
        if (norm.includes('cancel') || norm.includes('tranc') || norm.includes('inativ')) return 'inativo';
        if (norm.includes('ativ') || norm.includes('regular') || norm.includes('adimpl') || norm.includes('ok') || norm.includes('liber')) return 'ativo';
        return text.toLowerCase();
    }

    function deriveEnrollmentStatus(rawStatus, dueAt, endAt, now) {
        const parsed = parseEnrollmentStatus(rawStatus);
        if (parsed) return parsed;
        const reference = Number(dueAt || endAt || 0);
        if (Number.isFinite(reference) && reference > 0) {
            return reference < Number(now || Date.now()) ? 'vencido' : 'ativo';
        }
        return '';
    }

    function readRowByAliases(rowObj = {}, aliases = []) {
        const rows = Object.entries(rowObj || {});
        for (const alias of aliases) {
            const normalizedAlias = normalizeHeaderKey(alias);
            const found = rows.find(([header]) => normalizeHeaderKey(header) === normalizedAlias);
            if (found) return found[1];
        }
        for (const alias of aliases) {
            const normalizedAlias = normalizeHeaderKey(alias);
            const found = rows.find(([header]) => normalizeHeaderKey(header).includes(normalizedAlias));
            if (found) return found[1];
        }
        return '';
    }

    function inferAccessEventType(rawType, rowObj = {}) {
        const direct = parseEventType(rawType);
        if (direct) return direct;
        const blockedRaw = readRowByAliases(rowObj, ['bloqueado', 'bloqueio', 'status']);
        const blockedType = parseEventType(blockedRaw);
        if (blockedType) return blockedType;
        const reasonRaw = String(readRowByAliases(rowObj, ['motivo', 'bloqueio', 'obs', 'observacao']) || '').trim();
        if (reasonRaw) return 'denied';
        return 'entry';
    }

    function buildSourceEventId({ rowObject, mapping, eventAt, eventType, externalId, phone, name, gate }) {
        const fromFile = sanitizePublicText(rowObject[mapping.source_event_id] || '', 180);
        if (fromFile) return fromFile;
        const payload = `${eventAt}|${eventType}|${externalId}|${phone}|${name}|${gate}`;
        return `manual_${crypto.createHash('sha1').update(payload).digest('hex')}`;
    }

    function summarizeRejectedRows(rejectedRows = []) {
        return rejectedRows.reduce((acc, item) => {
            const key = sanitizePublicText(item?.error || 'unknown_error', 80) || 'unknown_error';
            acc[key] = Number(acc[key] || 0) + 1;
            return acc;
        }, {});
    }

    function upsertStudentRow({ externalId, name, phone, cpf, status, plan, membershipDueAt = 0, membershipEndAt = 0, now }) {
        let row = null;
        if (externalId) {
            row = db.prepare('SELECT id, external_id, name, phone, cpf, status, plan, last_access_at, membership_due_at, membership_end_at FROM sca_people WHERE external_id=? LIMIT 1').get(externalId);
        }
        if (!row && cpf) {
            row = db.prepare('SELECT id, external_id, name, phone, cpf, status, plan, last_access_at, membership_due_at, membership_end_at FROM sca_people WHERE cpf=? LIMIT 1').get(cpf);
        }
        if (!row && phone) {
            row = db.prepare('SELECT id, external_id, name, phone, cpf, status, plan, last_access_at, membership_due_at, membership_end_at FROM sca_people WHERE phone=? LIMIT 1').get(phone);
        }
        if (!row) {
            db.prepare(`
                INSERT INTO sca_people (external_id, name, phone, cpf, status, plan, membership_due_at, membership_end_at, membership_updated_at, last_access_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(externalId, name, phone, cpf, status, plan, Number(membershipDueAt || 0), Number(membershipEndAt || 0), now, 0, now, now);
            return { inserted: 1, updated: 0 };
        }
        db.prepare(`
            UPDATE sca_people
               SET external_id=?,
                   name=?,
                   phone=?,
                   cpf=?,
                   status=?,
                   plan=?,
                   membership_due_at=?,
                   membership_end_at=?,
                   membership_updated_at=?,
                   updated_at=?
             WHERE id=?
        `).run(
            externalId || row.external_id || '',
            name || row.name || '',
            phone || row.phone || '',
            cpf || row.cpf || '',
            status || row.status || '',
            plan || row.plan || '',
            Number(membershipDueAt || row.membership_due_at || 0),
            Number(membershipEndAt || row.membership_end_at || 0),
            now,
            now,
            Number(row.id || 0)
        );
        return { inserted: 0, updated: 1 };
    }

    function insertImportHistory({
        importType,
        originalFilename,
        sourceExt,
        csvFilename,
        status,
        rowsTotal,
        acceptedCount,
        rejectedCount,
        mappingConfidence,
        mapping,
        result,
        uploadedBy,
        createdAt
    }) {
        const payload = {
            import_type: importType,
            original_filename: originalFilename,
            source_ext: sourceExt,
            csv_filename: csvFilename,
            status,
            rows_total: rowsTotal,
            accepted_count: acceptedCount,
            rejected_count: rejectedCount,
            mapping_confidence: Number(mappingConfidence || 0),
            mapping_json: JSON.stringify(mapping || {}),
            result_json: JSON.stringify(result || {}),
            uploaded_by: uploadedBy,
            created_at: createdAt
        };
        const resultInsert = db.prepare(`
            INSERT INTO sca_manual_imports (
                import_type, original_filename, source_ext, csv_filename, status,
                rows_total, accepted_count, rejected_count, mapping_confidence,
                mapping_json, result_json, uploaded_by, created_at
            ) VALUES (
                @import_type, @original_filename, @source_ext, @csv_filename, @status,
                @rows_total, @accepted_count, @rejected_count, @mapping_confidence,
                @mapping_json, @result_json, @uploaded_by, @created_at
            )
        `).run(payload);
        return Number(resultInsert?.lastInsertRowid || 0);
    }

    function getImports({ type = '', limit = 30 } = {}) {
        const safeLimit = Math.max(1, Math.min(200, Number(limit || 30)));
        if (!type) {
            return db.prepare(`
                SELECT id, import_type, original_filename, source_ext, csv_filename, status,
                       rows_total, accepted_count, rejected_count, mapping_confidence, result_json,
                       uploaded_by, created_at
                FROM sca_manual_imports
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            `).all(safeLimit);
        }
        return db.prepare(`
            SELECT id, import_type, original_filename, source_ext, csv_filename, status,
                   rows_total, accepted_count, rejected_count, mapping_confidence, result_json,
                   uploaded_by, created_at
            FROM sca_manual_imports
            WHERE import_type=?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
        `).all(type, safeLimit);
    }

    function resolveImportCsvPath(id) {
        const row = db.prepare('SELECT csv_filename FROM sca_manual_imports WHERE id=?').get(Number(id || 0));
        const csv = String(row?.csv_filename || '');
        if (!csv) return '';
        const full = path.join(scaImportsDir, csv);
        if (!isPathInside(scaImportsDir, full)) return '';
        if (!fs.existsSync(full)) return '';
        return full;
    }

    app.get('/admin/sca/imports/mapping', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const type = sanitizeImportType(req.query?.type || '');
        if (!type) return res.status(400).json({ ok: false, error: 'invalid_type' });
        const saved = readMappings();
        return res.json({
            ok: true,
            type,
            mapping: saved[type] || getDefaultMapping()[type]
        });
    });

    app.put('/admin/sca/imports/mapping', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const type = sanitizeImportType(req.query?.type || '');
        if (!type) return res.status(400).json({ ok: false, error: 'invalid_type' });
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const mapping = normalizeManualMappingInput(type, body.mapping || body);
        const saved = readMappings();
        const next = {
            ...saved,
            [type]: mapping,
            updated_at: Date.now(),
            updated_by: String(user.username || '')
        };
        writeMappings(next);
        logAdminAction('sca.import.mapping.update', user.username, type, { mapping }, req.ip);
        return res.json({ ok: true, type, mapping });
    });

    app.get('/admin/sca/imports', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const typeRaw = String(req.query?.type || '').trim().toLowerCase();
        const type = typeRaw ? sanitizeImportType(typeRaw) : '';
        if (typeRaw && !type) return res.status(400).json({ ok: false, error: 'invalid_type' });
        const limit = Number(req.query?.limit || 30);
        const items = getImports({ type, limit }).map((row) => ({
            ...row,
            result: (() => {
                try { return JSON.parse(row.result_json || '{}'); } catch (_) { return {}; }
            })()
        }));
        return res.json({ ok: true, items });
    });

    app.get('/admin/sca/imports/:id/csv', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params?.id || 0);
        if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'invalid_id' });
        const full = resolveImportCsvPath(id);
        if (!full) return res.status(404).json({ ok: false, error: 'not_found' });
        res.setHeader('Cache-Control', 'no-store');
        return res.download(full);
    });

    app.post('/admin/sca/imports/upload', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const type = sanitizeImportType(req.query?.type || '');
        if (!type) return res.status(400).json({ ok: false, error: 'invalid_type' });
        if (!scaImportUpload || typeof scaImportUpload.single !== 'function') {
            return res.status(503).json({ ok: false, error: 'upload_unavailable' });
        }
        const middleware = scaImportUpload.single('file');
        middleware(req, res, (err) => {
            if (err) {
                if (String(err?.code || '') === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({
                        ok: false,
                        error: 'file_too_large',
                        maxBytes: Number(SCA_IMPORT_MAX_BYTES || 0)
                    });
                }
                return res.status(400).json({ ok: false, error: 'upload_failed', detail: String(err?.message || err) });
            }
            const file = req.file;
            if (!file || !Buffer.isBuffer(file.buffer)) {
                return res.status(400).json({ ok: false, error: 'missing_file' });
            }
            const ext = normalizeExt(file.originalname || '');
            if (!['.csv', '.xls', '.xlsx'].includes(ext)) {
                return res.status(400).json({ ok: false, error: 'invalid_file_type' });
            }
            const now = Date.now();
            ensureDir(scaImportsDir);
            let parsed = null;
            try {
                parsed = parseSheetBuffer(file.buffer, file.originalname || '');
            } catch (error) {
                return res.status(400).json({ ok: false, error: error?.message || 'spreadsheet_parse_failed' });
            }

            const csvFilename = `${type}-import-${new Date(now).toISOString().replace(/[:.]/g, '-')}.csv`;
            const csvPath = path.join(scaImportsDir, csvFilename);
            fs.writeFileSync(csvPath, parsed.csvText, 'utf8');

            const savedMappings = readMappings();
            const resolved = resolveMapping(type, parsed.headers, savedMappings[type] || {});
            const minConfidenceByType = {
                students: 0.55,
                access: 0.55,
                enrollments: 0.35
            };
            const minConfidence = Number(minConfidenceByType[type] ?? 0.55);
            const mappingInsufficient = resolved.confidence < minConfidence || resolved.missingRequired.length > 0;
            const mappingWarnings = [];
            if (mappingInsufficient) {
                mappingWarnings.push('low_confidence_or_missing_required_fields');
            }
            if (resolved.confidence < minConfidence) {
                mappingWarnings.push(`confidence_below_threshold:${resolved.confidence.toFixed(2)}<${minConfidence.toFixed(2)}`);
            }
            if (resolved.missingRequired.length > 0) {
                mappingWarnings.push(`missing_required:${resolved.missingRequired.join('|')}`);
            }

            const mapping = resolved.mapping;
            const rejected = [];
            let acceptedCount = 0;
            let insertedCount = 0;
            let updatedCount = 0;
            let syncResult = null;

            if (type === 'students') {
                const tx = db.transaction(() => {
                    parsed.dataRows.forEach((raw, index) => {
                        const rowObj = toRowObject(parsed.headers, raw);
                        const externalId = normalizeExternalId(rowObj[mapping.external_id] || '');
                        const name = sanitizePublicText(rowObj[mapping.name] || '', 160);
                        const phone = normalizePhoneDigits(rowObj[mapping.phone] || '');
                        const cpf = normalizeCpf(rowObj[mapping.cpf] || '');
                        const status = sanitizePublicText(rowObj[mapping.status] || '', 40);
                        const plan = sanitizePublicText(rowObj[mapping.plan] || '', 120);
                        if (!name && !externalId && !phone && !cpf) {
                            rejected.push({ row: index + 2, error: 'identity_required' });
                            return;
                        }
                        const result = upsertStudentRow({ externalId, name, phone, cpf, status, plan, now });
                        acceptedCount += 1;
                        insertedCount += Number(result.inserted || 0);
                        updatedCount += Number(result.updated || 0);
                    });
                });
                tx();
            } else if (type === 'access') {
                const events = [];
                parsed.dataRows.forEach((raw, index) => {
                    const rowObj = toRowObject(parsed.headers, raw);
                    const externalId = normalizeExternalId(rowObj[mapping.external_id] || '');
                    const name = sanitizePublicText(rowObj[mapping.name] || '', 120);
                    const phone = normalizePhoneDigits(rowObj[mapping.phone] || '');
                        const eventType = inferAccessEventType(rowObj[mapping.event_type] || '', rowObj);
                        const eventAt = parseEventAt(rowObj[mapping.event_at] || '');
                        const gate = sanitizePublicText(rowObj[mapping.gate] || '', 120);
                        if (!eventType || !eventAt || (!externalId && !phone && !name)) {
                            rejected.push({ row: index + 2, error: 'invalid_access_row' });
                            return;
                    }
                    const sourceEventId = buildSourceEventId({
                        rowObject: rowObj,
                        mapping,
                        eventAt,
                        eventType,
                        externalId,
                        phone,
                        name,
                        gate
                    });
                    events.push({
                        source_event_id: sourceEventId,
                        external_id: externalId,
                        name,
                        phone,
                        event_type: eventType,
                        event_at: eventAt,
                        status: '',
                        plan: '',
                        gate,
                        raw: rowObj
                    });
                });
                acceptedCount = events.length;
                syncResult = upsertScaAccessBatch({
                    source: DEFAULT_SOURCE,
                    actor: 'sca_manual_import',
                    events,
                    connector: {
                        source: DEFAULT_SOURCE,
                        engine: 'manual_upload',
                        db_file: '',
                        last_scan_at: now,
                        lag_sec: 0,
                        meta: {
                            importType: 'access',
                            rowsTotal: parsed.rowCount
                        }
                    }
                });
                insertedCount = Number(syncResult?.inserted_count || 0);
                updatedCount = Number(syncResult?.duplicate_count || 0);
            } else if (type === 'enrollments') {
                const statusCounts = {
                    ativo: 0,
                    atrasado: 0,
                    vencido: 0,
                    inativo: 0,
                    outros: 0
                };
                const tx = db.transaction(() => {
                    parsed.dataRows.forEach((raw, index) => {
                        const rowObj = toRowObject(parsed.headers, raw);
                        const externalId = normalizeExternalId(rowObj[mapping.external_id] || '');
                        const name = sanitizePublicText(rowObj[mapping.name] || '', 160);
                        const phone = normalizePhoneDigits(rowObj[mapping.phone] || '');
                        const cpf = normalizeCpf(rowObj[mapping.cpf] || '');
                        const plan = sanitizePublicText(rowObj[mapping.plan] || '', 120);
                        const startAt = parseEventAt(rowObj[mapping.start_at] || '');
                        const dueAt = parseEventAt(rowObj[mapping.due_at] || '');
                        const endAt = parseEventAt(rowObj[mapping.end_at] || '');
                        let enrollmentStatus = deriveEnrollmentStatus(
                            rowObj[mapping.enrollment_status] || '',
                            dueAt,
                            endAt,
                            now
                        );
                        if (!externalId && !name && !phone && !cpf) {
                            rejected.push({ row: index + 2, error: 'identity_required' });
                            return;
                        }
                        if (!enrollmentStatus && startAt > 0) {
                            enrollmentStatus = 'ativo';
                        }
                        if (!enrollmentStatus && !startAt && !dueAt && !endAt) {
                            rejected.push({ row: index + 2, error: 'enrollment_status_or_due_required' });
                            return;
                        }
                        const result = upsertStudentRow({
                            externalId,
                            name,
                            phone,
                            cpf,
                            status: enrollmentStatus,
                            plan,
                            membershipDueAt: dueAt,
                            membershipEndAt: endAt,
                            now
                        });
                        acceptedCount += 1;
                        insertedCount += Number(result.inserted || 0);
                        updatedCount += Number(result.updated || 0);

                        if (enrollmentStatus === 'ativo') statusCounts.ativo += 1;
                        else if (enrollmentStatus === 'atrasado') statusCounts.atrasado += 1;
                        else if (enrollmentStatus === 'vencido') statusCounts.vencido += 1;
                        else if (enrollmentStatus === 'inativo') statusCounts.inativo += 1;
                        else statusCounts.outros += 1;
                    });
                });
                tx();
                syncResult = { statusCounts };
            }

            const importId = insertImportHistory({
                importType: type,
                originalFilename: sanitizePublicText(file.originalname || '', 180) || `${type}.csv`,
                sourceExt: ext,
                csvFilename,
                status: mappingWarnings.length > 0 ? 'processed_with_warnings' : 'processed',
                rowsTotal: parsed.rowCount,
                acceptedCount,
                rejectedCount: rejected.length,
                mappingConfidence: resolved.confidence,
                mapping,
                result: {
                    mappingWarnings,
                    missingRequired: resolved.missingRequired,
                    headers: parsed.headers,
                    rejected,
                    rejectedSummary: summarizeRejectedRows(rejected),
                    insertedCount,
                    updatedCount,
                    syncResult
                },
                uploadedBy: String(user.username || ''),
                createdAt: now
            });

            logAdminAction('sca.import.upload', user.username, String(importId), {
                type,
                acceptedCount,
                rejectedCount: rejected.length,
                rowsTotal: parsed.rowCount
            }, req.ip);

            return res.json({
                ok: true,
                importId,
                type,
                status: mappingWarnings.length > 0 ? 'processed_with_warnings' : 'processed',
                rowsTotal: parsed.rowCount,
                acceptedCount,
                rejectedCount: rejected.length,
                insertedCount,
                updatedCount,
                rejected,
                rejectedSummary: summarizeRejectedRows(rejected),
                mappingConfidence: resolved.confidence,
                mapping,
                mappingWarnings,
                missingRequired: resolved.missingRequired,
                headers: parsed.headers
            });
        });
    });
}

module.exports = {
    registerScaImportRoutes
};
