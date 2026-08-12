const ALLOWED_STATUSES = new Set(['available', 'full', 'waitlist', 'unavailable']);
const DEFAULT_SHEET_VALIDITY_MS = 6 * 60 * 60 * 1000;

function cleanText(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTimestamp(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function normalizeAvailabilityEntry(raw = {}, index = 0, now = Date.now()) {
    const modality = cleanText(raw.modality, 80);
    if (!modality) return null;
    const requestedStatus = cleanText(raw.status, 30).toLowerCase();
    const status = ALLOWED_STATUSES.has(requestedStatus) ? requestedStatus : 'available';
    const hasAvailableSpots = raw.availableSpots !== null
        && raw.availableSpots !== undefined
        && String(raw.availableSpots).trim() !== '';
    const spotsRaw = hasAvailableSpots ? Number(raw.availableSpots) : Number.NaN;
    const availableSpots = hasAvailableSpots && Number.isFinite(spotsRaw)
        ? Math.max(0, Math.min(9999, Math.floor(spotsRaw)))
        : null;
    const hasCapacity = raw.capacity !== null
        && raw.capacity !== undefined
        && String(raw.capacity).trim() !== '';
    const capacityRaw = hasCapacity ? Number(raw.capacity) : Number.NaN;
    const capacity = hasCapacity && Number.isFinite(capacityRaw) && capacityRaw > 0
        ? Math.max(1, Math.min(9999, Math.floor(capacityRaw)))
        : null;
    return {
        id: cleanText(raw.id, 100) || `vaga-${now}-${index + 1}`,
        modality,
        className: cleanText(raw.className, 100),
        schedule: cleanText(raw.schedule, 120),
        status: availableSpots === 0 && status === 'available' ? 'full' : status,
        availableSpots,
        capacity,
        note: cleanText(raw.note, 300),
        active: raw.active !== false,
        validUntil: normalizeTimestamp(raw.validUntil),
        updatedAt: normalizeTimestamp(raw.updatedAt) || now,
        updatedBy: cleanText(raw.updatedBy, 80)
    };
}

function normalizeAvailabilityPayload(raw, { actor = 'system', now = Date.now() } = {}) {
    const source = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    const entries = source
        .slice(0, 200)
        .map((entry, index) => normalizeAvailabilityEntry(entry, index, now))
        .filter(Boolean)
        .map((entry) => ({ ...entry, updatedAt: now, updatedBy: cleanText(actor, 80) || 'system' }));
    return {
        version: 1,
        entries,
        updatedAt: now,
        updatedBy: cleanText(actor, 80) || 'system'
    };
}

function parseCsvRows(csvText) {
    const text = String(csvText || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') {
                cell += '"';
                i += 1;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                cell += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(cell);
            cell = '';
        } else if (ch === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else if (ch !== '\r') {
            cell += ch;
        }
    }
    row.push(cell);
    rows.push(row);
    return rows
        .map((cells) => cells.map((value) => cleanText(value, 200)))
        .filter((cells) => cells.some(Boolean));
}

function parsePositiveInteger(value) {
    const normalized = String(value ?? '').replace(/[^\d-]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function normalizeSheetHeader(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function resolveSummaryHeaderIndexes(headerRow) {
    const normalized = headerRow.map(normalizeSheetHeader);
    return {
        classIndex: normalized.findIndex((value) => value === 'turma' || value === 'modalidade'),
        scheduleIndex: normalized.findIndex((value) => value === 'horario' || value === 'hora'),
        capacityIndex: normalized.findIndex((value) => value.includes('vagas totais') || value === 'capacidade'),
        occupiedIndex: normalized.findIndex((value) => value.includes('matriculados') || value.includes('ocupadas')),
        availableIndex: normalized.findIndex((value) => value.includes('vagas disponiveis') || value.includes('disponiveis'))
    };
}

function parseAvailabilityCsv(csvText, { now = Date.now(), validForMs = DEFAULT_SHEET_VALIDITY_MS, actor = 'sheet-sync' } = {}) {
    const rows = parseCsvRows(csvText);
    const headerIndex = rows.findIndex((row) => {
        const indexes = resolveSummaryHeaderIndexes(row);
        return indexes.classIndex >= 0 && indexes.scheduleIndex >= 0 && indexes.availableIndex >= 0;
    });
    if (headerIndex < 0) {
        return normalizeAvailabilityPayload({ entries: [] }, { actor, now });
    }
    const indexes = resolveSummaryHeaderIndexes(rows[headerIndex]);
    const validUntil = now + Math.max(5 * 60 * 1000, Number(validForMs || DEFAULT_SHEET_VALIDITY_MS));
    const entries = [];
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
        const row = rows[i];
        const modality = cleanText(row[indexes.classIndex], 80);
        const schedule = cleanText(row[indexes.scheduleIndex], 120);
        if (!modality || normalizeSheetHeader(modality) === 'vaga') break;
        if (!schedule && !row.some(Boolean)) break;
        const availableSpots = parsePositiveInteger(row[indexes.availableIndex]);
        const capacity = indexes.capacityIndex >= 0 ? parsePositiveInteger(row[indexes.capacityIndex]) : null;
        const occupied = indexes.occupiedIndex >= 0 ? parsePositiveInteger(row[indexes.occupiedIndex]) : null;
        if (availableSpots === null && capacity === null) continue;
        entries.push({
            id: `sheet-${normalizeSheetHeader(`${modality}-${schedule}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || i}`,
            modality,
            className: modality,
            schedule,
            status: availableSpots === 0 ? 'full' : 'available',
            availableSpots,
            capacity,
            note: occupied !== null ? `${occupied} alunos matriculados` : '',
            active: true,
            validUntil
        });
    }
    return normalizeAvailabilityPayload({ entries }, { actor, now });
}

function formatDateTime(timestamp, timezone = 'America/Sao_Paulo') {
    if (!timestamp) return '';
    try {
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: timezone,
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(timestamp));
    } catch (_) {
        return new Date(timestamp).toISOString();
    }
}

function availabilityLabel(entry) {
    if (entry.status === 'full') return 'sem vagas no momento';
    if (entry.status === 'waitlist') return 'lista de espera';
    if (entry.status === 'unavailable') return 'turma indisponivel no momento';
    if (entry.availableSpots === null) return 'com vagas, quantidade nao informada';
    return `${entry.availableSpots} ${entry.availableSpots === 1 ? 'vaga disponivel' : 'vagas disponiveis'}`;
}

function buildAvailabilityContext(raw, { now = Date.now(), timezone = 'America/Sao_Paulo' } = {}) {
    const source = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    const active = source
        .map((entry, index) => normalizeAvailabilityEntry(entry, index, now))
        .filter((entry) => entry && entry.active && entry.validUntil >= now);
    const lines = [
        '# VAGAS ATUAIS POR MODALIDADE (PRIORIDADE ALTA)',
        'Estas informacoes substituem qualquer quantidade de vagas antiga presente na base permanente ou no historico.',
        'Use somente o registro da modalidade e turma exatas perguntadas. Nao deduza vagas para outros horarios.',
        'Vaga disponivel nao significa reserva confirmada. Oriente o cliente a concluir ou confirmar com a recepcao.'
    ];
    if (!active.length) {
        lines.push('Nao ha registros de vagas ativos e validos. Quando perguntarem disponibilidade, diga que a recepcao precisa confirmar.');
        return lines.join('\n');
    }
    lines.push('Registros vigentes:');
    active.forEach((entry) => {
        const details = [entry.modality];
        if (entry.className) details.push(`Turma: ${entry.className}`);
        if (entry.schedule) details.push(`Horario: ${entry.schedule}`);
        details.push(`Status: ${availabilityLabel(entry)}`);
        if (entry.capacity) details.push(`Capacidade total: ${entry.capacity}`);
        if (entry.validUntil) details.push(`Valido ate: ${formatDateTime(entry.validUntil, timezone)}`);
        if (entry.note) details.push(`Observacao: ${entry.note}`);
        lines.push(`- ${details.join(' | ')}`);
    });
    return lines.join('\n');
}

module.exports = {
    ALLOWED_STATUSES,
    DEFAULT_SHEET_VALIDITY_MS,
    normalizeAvailabilityEntry,
    normalizeAvailabilityPayload,
    parseCsvRows,
    parseAvailabilityCsv,
    buildAvailabilityContext
};
