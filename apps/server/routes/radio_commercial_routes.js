function registerRadioCommercialRoutes({
    app,
    db,
    fs,
    path,
    ADS_DIR,
    requirePanelAuth,
    requireAdmin,
    logAdminAction,
    broadcast
}) {
    const SETTINGS_KEY = 'commercial.radio.settings.v1';
    const DEFAULT_SETTINGS = {
        min_interval_minutes: 5,
        min_same_advertiser_interval_minutes: 15,
        operating_hours_start: '06:00',
        operating_hours_end: '22:00',
        prime_hours_start: '17:00',
        prime_hours_end: '20:00'
    };

    const nowMs = () => Date.now();
    const normalizeStatus = (value, allowed, fallback) => {
        const raw = String(value || '').trim().toLowerCase();
        return allowed.includes(raw) ? raw : fallback;
    };
    const clampInt = (value, min, max, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(min, Math.min(max, Math.floor(n)));
    };
    const normalizeTimeHHMM = (value, fallback) => {
        const raw = String(value || '').trim();
        if (!/^\d{2}:\d{2}$/.test(raw)) return fallback;
        const [hh, mm] = raw.split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return fallback;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const sanitizeDateKey = (value) => {
        const raw = String(value || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
    };
    const toDayStartMs = (dateKey) => Date.parse(`${sanitizeDateKey(dateKey)}T00:00:00`);
    const toDayEndMs = (dateKey) => Date.parse(`${sanitizeDateKey(dateKey)}T23:59:59.999`);
    const timeToMinutes = (value) => {
        const [hh, mm] = normalizeTimeHHMM(value, '00:00').split(':').map(Number);
        return hh * 60 + mm;
    };
    const minutesToTime = (minutes) => {
        const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes)));
        return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}:00`;
    };
    const isValidDailyWindow = (startHHMM, endHHMM) => {
        const start = timeToMinutes(startHHMM);
        const end = timeToMinutes(endHHMM);
        return end > start;
    };
    const safeJsonParse = (raw, fallback) => {
        try { return JSON.parse(raw); } catch (_) { return fallback; }
    };
    const getSafeAdFile = (value) => {
        const file = String(value || '').trim();
        if (!file || !file.toLowerCase().endsWith('.mp3')) return '';
        const abs = path.join(ADS_DIR, file);
        if (!fs.existsSync(abs)) return '';
        return file;
    };

    function getSettings() {
        const row = db.prepare('SELECT value FROM radio_settings WHERE key=?').get(SETTINGS_KEY);
        const parsed = safeJsonParse(row?.value || '{}', {});
        return {
            min_interval_minutes: clampInt(parsed.min_interval_minutes, 1, 240, DEFAULT_SETTINGS.min_interval_minutes),
            min_same_advertiser_interval_minutes: clampInt(parsed.min_same_advertiser_interval_minutes, 1, 360, DEFAULT_SETTINGS.min_same_advertiser_interval_minutes),
            operating_hours_start: normalizeTimeHHMM(parsed.operating_hours_start, DEFAULT_SETTINGS.operating_hours_start),
            operating_hours_end: normalizeTimeHHMM(parsed.operating_hours_end, DEFAULT_SETTINGS.operating_hours_end),
            prime_hours_start: normalizeTimeHHMM(parsed.prime_hours_start, DEFAULT_SETTINGS.prime_hours_start),
            prime_hours_end: normalizeTimeHHMM(parsed.prime_hours_end, DEFAULT_SETTINGS.prime_hours_end)
        };
    }

    function saveSettings(input) {
        const next = {
            min_interval_minutes: clampInt(input.min_interval_minutes, 1, 240, DEFAULT_SETTINGS.min_interval_minutes),
            min_same_advertiser_interval_minutes: clampInt(input.min_same_advertiser_interval_minutes, 1, 360, DEFAULT_SETTINGS.min_same_advertiser_interval_minutes),
            operating_hours_start: normalizeTimeHHMM(input.operating_hours_start, DEFAULT_SETTINGS.operating_hours_start),
            operating_hours_end: normalizeTimeHHMM(input.operating_hours_end, DEFAULT_SETTINGS.operating_hours_end),
            prime_hours_start: normalizeTimeHHMM(input.prime_hours_start, DEFAULT_SETTINGS.prime_hours_start),
            prime_hours_end: normalizeTimeHHMM(input.prime_hours_end, DEFAULT_SETTINGS.prime_hours_end)
        };
        db.prepare(`
            INSERT INTO radio_settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
        `).run(SETTINGS_KEY, JSON.stringify(next), nowMs());
        return next;
    }

    function mapAdvertiserRow(row) {
        return {
            id: String(row.id),
            company_name: String(row.company_name || ''),
            contact_person: String(row.contact_person || ''),
            phone: String(row.phone || ''),
            segment_id: row.segment_id ? String(row.segment_id) : null,
            notes: String(row.notes || ''),
            status: normalizeStatus(row.status, ['active', 'inactive'], 'active'),
            created_at: new Date(Number(row.created_at || nowMs())).toISOString(),
            segment: row.segment_id_ref ? {
                id: String(row.segment_id_ref),
                name: String(row.segment_name || ''),
                description: String(row.segment_description || ''),
                active: !!row.segment_active
            } : null
        };
    }

    function mapContractRow(row) {
        return {
            id: String(row.id),
            advertiser_id: String(row.advertiser_id),
            plan_name: String(row.plan_name || 'Padrao'),
            value_cents: Number(row.value_cents || 0),
            start_date: sanitizeDateKey(row.start_date),
            end_date: sanitizeDateKey(row.end_date),
            daily_executions: clampInt(row.daily_executions, 1, 96, 3),
            ad_duration_seconds: clampInt(row.ad_duration_seconds, 5, 600, 30),
            contract_status: normalizeStatus(row.contract_status, ['active', 'paused', 'expired', 'cancelled'], 'active'),
            payment_status: normalizeStatus(row.payment_status, ['paid', 'pending', 'overdue'], 'pending'),
            segment_exclusive: !!row.segment_exclusive,
            notes: String(row.notes || ''),
            created_at: new Date(Number(row.created_at || nowMs())).toISOString()
        };
    }

    function mapAdRow(row) {
        return {
            id: String(row.id),
            advertiser_id: String(row.advertiser_id),
            contract_id: row.contract_id ? String(row.contract_id) : null,
            campaign_id: row.campaign_id ? String(row.campaign_id) : null,
            name: String(row.name || ''),
            file: String(row.file || ''),
            audio_url: row.file ? `/ads/${encodeURIComponent(String(row.file))}` : null,
            duration_seconds: clampInt(row.duration_seconds, 5, 600, 30),
            volume: Number(row.volume || 1),
            status: normalizeStatus(row.status, ['active', 'inactive', 'pending'], 'pending'),
            approved_at: row.approved_at ? new Date(Number(row.approved_at)).toISOString() : null,
            priority: clampInt(row.priority, -10, 10, 0),
            allowed_hours_start: normalizeTimeHHMM(row.allowed_hours_start, '06:00'),
            allowed_hours_end: normalizeTimeHHMM(row.allowed_hours_end, '23:00'),
            created_at: new Date(Number(row.created_at || nowMs())).toISOString()
        };
    }

    function findSegmentConflict(advertiserId, excludeId = 0) {
        const segmentId = db.prepare('SELECT segment_id FROM advertisers WHERE id=?').get(Number(advertiserId))?.segment_id;
        if (!segmentId) return null;
        const today = sanitizeDateKey(new Date().toISOString().slice(0, 10));
        return db.prepare(`
            SELECT c.id, a.company_name
              FROM ad_contracts c
              JOIN advertisers a ON a.id = c.advertiser_id
             WHERE c.id != ?
               AND c.segment_exclusive = 1
               AND c.contract_status = 'active'
               AND c.payment_status != 'overdue'
               AND a.segment_id = ?
               AND c.advertiser_id != ?
               AND c.start_date <= ?
               AND c.end_date >= ?
             LIMIT 1
        `).get(Number(excludeId || 0), Number(segmentId), Number(advertiserId), today, today);
    }

    function syncCampaignForAd(adId, actor = 'commercial') {
        const row = db.prepare(`
            SELECT ra.*, c.daily_executions, c.start_date, c.end_date, c.contract_status, c.payment_status, a.company_name
            FROM radio_ads ra
            LEFT JOIN ad_contracts c ON c.id = ra.contract_id
            LEFT JOIN advertisers a ON a.id = ra.advertiser_id
            WHERE ra.id = ?
        `).get(Number(adId));
        if (!row) return null;
        const file = getSafeAdFile(row.file);
        const campaignId = row.campaign_id ? Number(row.campaign_id) : 0;
        if (!file) {
            if (campaignId) db.prepare('UPDATE ad_campaigns SET is_active=0, updated_at=? WHERE id=?').run(nowMs(), campaignId);
            return campaignId || null;
        }
        const today = sanitizeDateKey(new Date().toISOString().slice(0, 10));
        const canRun = row.contract_id
            && normalizeStatus(row.status, ['active', 'inactive', 'pending'], 'pending') === 'active'
            && normalizeStatus(row.contract_status, ['active', 'paused', 'expired', 'cancelled'], 'active') === 'active'
            && normalizeStatus(row.payment_status, ['paid', 'pending', 'overdue'], 'pending') !== 'overdue'
            && sanitizeDateKey(row.start_date) <= today
            && sanitizeDateKey(row.end_date) >= today;
        const runs = clampInt(row.daily_executions, 1, 96, 3);
        const allowedStart = normalizeTimeHHMM(row.allowed_hours_start, '06:00');
        const allowedEnd = normalizeTimeHHMM(row.allowed_hours_end, '23:00');
        const startMinutes = timeToMinutes(allowedStart);
        const endMinutesRaw = timeToMinutes(allowedEnd);
        const endMinutes = endMinutesRaw > startMinutes ? endMinutesRaw : Math.min(23 * 60 + 59, startMinutes + 1);
        const windowMinutes = Math.max(1, endMinutes - startMinutes);
        const startAt = toDayStartMs(row.start_date || today) + (startMinutes * 60 * 1000);
        const endAt = toDayStartMs(row.end_date || today) + (endMinutes * 60 * 1000);
        const payload = {
            name: String(row.name || '').slice(0, 90),
            advertiser: String(row.company_name || '').slice(0, 90),
            file,
            mode: 'per_day',
            runs_per_day: runs,
            interval_hours: Math.max(0.05, Math.min(24, (windowMinutes / 60) / Math.max(1, runs))),
            start_at: startAt,
            end_at: endAt,
            is_active: canRun ? 1 : 0,
            priority: clampInt(row.priority, -10, 10, 0),
            notes: ''
        };
        const ts = nowMs();
        if (campaignId && db.prepare('SELECT id FROM ad_campaigns WHERE id=?').get(campaignId)) {
            db.prepare(`
                UPDATE ad_campaigns
                   SET name=?, advertiser=?, file=?, mode=?, runs_per_day=?, interval_hours=?, start_at=?, end_at=?, is_active=?, priority=?, notes=?, updated_at=?
                 WHERE id=?
            `).run(payload.name, payload.advertiser, payload.file, payload.mode, payload.runs_per_day, payload.interval_hours, payload.start_at, payload.end_at, payload.is_active, payload.priority, payload.notes, ts, campaignId);
            return campaignId;
        }
        const created = db.prepare(`
            INSERT INTO ad_campaigns
                (name, advertiser, file, mode, runs_per_day, interval_hours, start_at, end_at, is_active, priority, notes, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(payload.name, payload.advertiser, payload.file, payload.mode, payload.runs_per_day, payload.interval_hours, payload.start_at, payload.end_at, payload.is_active, payload.priority, payload.notes, String(actor).slice(0, 40), ts, ts);
        const nextId = Number(created.lastInsertRowid || 0);
        db.prepare('UPDATE radio_ads SET campaign_id=?, updated_at=? WHERE id=?').run(nextId, ts, Number(adId));
        return nextId;
    }

    function generateSchedule(dateKey) {
        const settings = getSettings();
        const date = sanitizeDateKey(dateKey);
        const operatingStart = timeToMinutes(settings.operating_hours_start);
        const operatingEnd = timeToMinutes(settings.operating_hours_end);
        const rows = db.prepare(`
            SELECT ra.id, ra.contract_id, ra.campaign_id, ra.advertiser_id, ra.priority, ra.allowed_hours_start, ra.allowed_hours_end, c.daily_executions
            FROM radio_ads ra
            JOIN ad_contracts c ON c.id = ra.contract_id
            JOIN advertisers a ON a.id = ra.advertiser_id
            WHERE ra.status='active'
              AND a.status='active'
              AND c.contract_status='active'
              AND c.payment_status!='overdue'
              AND c.start_date<=?
              AND c.end_date>=?
        `).all(date, date).map((row) => ({
            ...row,
            daily_executions: clampInt(row.daily_executions, 1, 96, 3),
            allowed_start: timeToMinutes(row.allowed_hours_start),
            allowed_end: timeToMinutes(row.allowed_hours_end)
        })).sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id);

        const required = rows.reduce((sum, row) => sum + row.daily_executions, 0);
        const minGap = clampInt(settings.min_interval_minutes, 1, 240, 5);
        const sameGap = clampInt(settings.min_same_advertiser_interval_minutes, minGap, 360, 15);

        const candidates = [];
        rows.forEach((row) => {
            const windowStart = Math.max(operatingStart, Number(row.allowed_start || 0));
            const windowEnd = Math.min(operatingEnd, Number(row.allowed_end || 0));
            if (windowEnd <= windowStart) return;
            const span = windowEnd - windowStart;
            for (let slot = 0; slot < row.daily_executions; slot += 1) {
                const target = windowStart + (((slot + 1) * span) / (row.daily_executions + 1));
                candidates.push({
                    ad_id: Number(row.id),
                    contract_id: row.contract_id ? Number(row.contract_id) : null,
                    campaign_id: row.campaign_id ? Number(row.campaign_id) : null,
                    advertiser_id: Number(row.advertiser_id || 0),
                    priority: Number(row.priority || 0),
                    slot_index: slot,
                    target_minute: target,
                    window_start: windowStart,
                    window_end: windowEnd
                });
            }
        });

        candidates.sort((a, b) => {
            if (a.target_minute !== b.target_minute) return a.target_minute - b.target_minute;
            if (a.priority !== b.priority) return b.priority - a.priority;
            if (a.slot_index !== b.slot_index) return a.slot_index - b.slot_index;
            return a.ad_id - b.ad_id;
        });

        const slots = [];
        const lastByAdvertiser = new Map();
        let lastGlobalMinute = null;
        candidates.forEach((candidate) => {
            let minute = Math.round(candidate.target_minute);
            minute = Math.max(candidate.window_start, Math.min(candidate.window_end, minute));
            if (Number.isFinite(lastGlobalMinute)) minute = Math.max(minute, Number(lastGlobalMinute) + minGap);
            const lastAdv = lastByAdvertiser.get(candidate.advertiser_id);
            if (Number.isFinite(lastAdv)) minute = Math.max(minute, Number(lastAdv) + sameGap);
            if (minute > candidate.window_end || minute > operatingEnd) return;
            slots.push({
                schedule_date: date,
                scheduled_time: minutesToTime(minute),
                ad_id: candidate.ad_id,
                contract_id: candidate.contract_id,
                campaign_id: candidate.campaign_id,
                execution_status: 'pending'
            });
            lastByAdvertiser.set(candidate.advertiser_id, minute);
            lastGlobalMinute = minute;
        });

        return { date, required_total: required, generated_total: slots.length, slots };
    }

    app.get('/admin/radio/commercial/segments', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rows = db.prepare('SELECT * FROM business_segments ORDER BY active DESC, name ASC').all();
        res.json({ segments: rows.map((row) => ({ id: String(row.id), name: String(row.name || ''), description: String(row.description || ''), active: !!row.active })) });
    });

    app.get('/admin/radio/commercial/advertisers', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rows = db.prepare(`
            SELECT a.*, s.id AS segment_id_ref, s.name AS segment_name, s.description AS segment_description, s.active AS segment_active
            FROM advertisers a
            LEFT JOIN business_segments s ON s.id = a.segment_id
            ORDER BY a.company_name ASC
        `).all();
        res.json({ advertisers: rows.map(mapAdvertiserRow) });
    });

    app.post('/admin/radio/commercial/advertisers', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const companyName = String(req.body?.company_name || '').trim().slice(0, 120);
        if (companyName.length < 2) return res.status(400).json({ error: 'invalid_company_name' });
        const row = db.prepare(`
            INSERT INTO advertisers (company_name, contact_person, phone, segment_id, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            companyName,
            String(req.body?.contact_person || '').trim().slice(0, 120),
            String(req.body?.phone || '').trim().slice(0, 60),
            req.body?.segment_id ? Number(req.body.segment_id) : null,
            String(req.body?.notes || '').trim().slice(0, 500),
            normalizeStatus(req.body?.status, ['active', 'inactive'], 'active'),
            nowMs(),
            nowMs()
        );
        logAdminAction('commercial.advertiser.create', user.username, String(row.lastInsertRowid || ''), { company_name: companyName }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_advertisers_updated', action: 'create', id: Number(row.lastInsertRowid || 0), at: Date.now() }); } catch (_) {}
        res.json({ ok: true, id: String(row.lastInsertRowid || '') });
    });

    app.put('/admin/radio/commercial/advertisers/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
        const companyName = String(req.body?.company_name || '').trim().slice(0, 120);
        if (companyName.length < 2) return res.status(400).json({ error: 'invalid_company_name' });
        db.prepare(`
            UPDATE advertisers
               SET company_name=?, contact_person=?, phone=?, segment_id=?, notes=?, status=?, updated_at=?
             WHERE id=?
        `).run(
            companyName,
            String(req.body?.contact_person || '').trim().slice(0, 120),
            String(req.body?.phone || '').trim().slice(0, 60),
            req.body?.segment_id ? Number(req.body.segment_id) : null,
            String(req.body?.notes || '').trim().slice(0, 500),
            normalizeStatus(req.body?.status, ['active', 'inactive'], 'active'),
            nowMs(),
            id
        );
        db.prepare('SELECT id FROM radio_ads WHERE advertiser_id=?').all(id).forEach((row) => syncCampaignForAd(row.id, `commercial:${user.username || 'admin'}`));
        logAdminAction('commercial.advertiser.update', user.username, String(id), { company_name: companyName }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_advertisers_updated', action: 'update', id, at: Date.now() }); } catch (_) {}
        res.json({ ok: true });
    });

    app.delete('/admin/radio/commercial/advertisers/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
        const contracts = Number(db.prepare('SELECT COUNT(1) AS c FROM ad_contracts WHERE advertiser_id=?').get(id)?.c || 0);
        if (contracts > 0) {
            db.prepare('UPDATE advertisers SET status=?, updated_at=? WHERE id=?').run('inactive', nowMs(), id);
        } else {
            db.prepare('DELETE FROM advertisers WHERE id=?').run(id);
        }
        db.prepare('SELECT id FROM radio_ads WHERE advertiser_id=?').all(id).forEach((row) => syncCampaignForAd(row.id, `commercial:${user.username || 'admin'}`));
        logAdminAction('commercial.advertiser.delete', user.username, String(id), { archived: contracts > 0 }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_advertisers_updated', action: 'delete', id, at: Date.now() }); } catch (_) {}
        res.json({ ok: true, archived: contracts > 0 });
    });

    app.get('/admin/radio/commercial/contracts', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rows = db.prepare(`
            SELECT c.*, a.company_name AS advertiser_company_name, a.contact_person AS advertiser_contact_person, a.phone AS advertiser_phone, a.segment_id AS advertiser_segment_id, a.notes AS advertiser_notes, a.status AS advertiser_status, s.id AS segment_id_ref, s.name AS segment_name, s.description AS segment_description, s.active AS segment_active
            FROM ad_contracts c
            JOIN advertisers a ON a.id = c.advertiser_id
            LEFT JOIN business_segments s ON s.id = a.segment_id
            ORDER BY c.created_at DESC, c.id DESC
        `).all();
        const contracts = rows.map((row) => ({
            ...mapContractRow(row),
            advertiser: {
                id: String(row.advertiser_id),
                company_name: String(row.advertiser_company_name || ''),
                contact_person: String(row.advertiser_contact_person || ''),
                phone: String(row.advertiser_phone || ''),
                segment_id: row.advertiser_segment_id ? String(row.advertiser_segment_id) : null,
                notes: String(row.advertiser_notes || ''),
                status: normalizeStatus(row.advertiser_status, ['active', 'inactive'], 'active'),
                created_at: '',
                segment: row.segment_id_ref ? { id: String(row.segment_id_ref), name: String(row.segment_name || ''), description: String(row.segment_description || ''), active: !!row.segment_active } : null
            }
        }));
        res.json({ contracts });
    });

    app.post('/admin/radio/commercial/contracts', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const advertiserId = Number(req.body?.advertiser_id);
        if (!Number.isFinite(advertiserId)) return res.status(400).json({ error: 'invalid_advertiser_id' });
        const startDate = sanitizeDateKey(req.body?.start_date);
        const endDate = sanitizeDateKey(req.body?.end_date || startDate);
        if (endDate < startDate) return res.status(400).json({ error: 'invalid_period' });
        const segmentExclusive = req.body?.segment_exclusive === undefined ? true : !!req.body.segment_exclusive;
        const contractStatus = normalizeStatus(req.body?.contract_status, ['active', 'paused', 'expired', 'cancelled'], 'active');
        const paymentStatus = normalizeStatus(req.body?.payment_status, ['paid', 'pending', 'overdue'], 'pending');
        if (segmentExclusive && contractStatus === 'active' && paymentStatus !== 'overdue') {
            const conflict = findSegmentConflict(advertiserId, 0);
            if (conflict) return res.status(409).json({ error: 'segment_conflict', conflict: { id: String(conflict.id), company_name: conflict.company_name } });
        }
        const row = db.prepare(`
            INSERT INTO ad_contracts (advertiser_id, plan_name, value_cents, start_date, end_date, daily_executions, ad_duration_seconds, contract_status, payment_status, segment_exclusive, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            advertiserId,
            String(req.body?.plan_name || 'Padrao').trim().slice(0, 80) || 'Padrao',
            clampInt(req.body?.value_cents, 0, 10_000_000_00, 0),
            startDate,
            endDate,
            clampInt(req.body?.daily_executions, 1, 96, 3),
            clampInt(req.body?.ad_duration_seconds, 5, 600, 30),
            contractStatus,
            paymentStatus,
            segmentExclusive ? 1 : 0,
            String(req.body?.notes || '').trim().slice(0, 500),
            nowMs(),
            nowMs()
        );
        const contractId = Number(row.lastInsertRowid || 0);
        db.prepare('SELECT id FROM radio_ads WHERE contract_id=?').all(contractId).forEach((item) => syncCampaignForAd(item.id, `commercial:${user.username || 'admin'}`));
        logAdminAction('commercial.contract.create', user.username, String(contractId), { advertiser_id: advertiserId }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_contracts_updated', action: 'create', id: contractId, at: Date.now() }); } catch (_) {}
        res.json({ ok: true, id: String(contractId) });
    });

    app.put('/admin/radio/commercial/contracts/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
        const advertiserId = Number(req.body?.advertiser_id);
        if (!Number.isFinite(advertiserId)) return res.status(400).json({ error: 'invalid_advertiser_id' });
        const startDate = sanitizeDateKey(req.body?.start_date);
        const endDate = sanitizeDateKey(req.body?.end_date || startDate);
        if (endDate < startDate) return res.status(400).json({ error: 'invalid_period' });
        const segmentExclusive = req.body?.segment_exclusive === undefined ? true : !!req.body.segment_exclusive;
        const contractStatus = normalizeStatus(req.body?.contract_status, ['active', 'paused', 'expired', 'cancelled'], 'active');
        const paymentStatus = normalizeStatus(req.body?.payment_status, ['paid', 'pending', 'overdue'], 'pending');
        if (segmentExclusive && contractStatus === 'active' && paymentStatus !== 'overdue') {
            const conflict = findSegmentConflict(advertiserId, id);
            if (conflict) return res.status(409).json({ error: 'segment_conflict', conflict: { id: String(conflict.id), company_name: conflict.company_name } });
        }
        db.prepare(`
            UPDATE ad_contracts
               SET advertiser_id=?, plan_name=?, value_cents=?, start_date=?, end_date=?, daily_executions=?, ad_duration_seconds=?, contract_status=?, payment_status=?, segment_exclusive=?, notes=?, updated_at=?
             WHERE id=?
        `).run(
            advertiserId,
            String(req.body?.plan_name || 'Padrao').trim().slice(0, 80) || 'Padrao',
            clampInt(req.body?.value_cents, 0, 10_000_000_00, 0),
            startDate,
            endDate,
            clampInt(req.body?.daily_executions, 1, 96, 3),
            clampInt(req.body?.ad_duration_seconds, 5, 600, 30),
            contractStatus,
            paymentStatus,
            segmentExclusive ? 1 : 0,
            String(req.body?.notes || '').trim().slice(0, 500),
            nowMs(),
            id
        );
        db.prepare('SELECT id FROM radio_ads WHERE contract_id=?').all(id).forEach((item) => syncCampaignForAd(item.id, `commercial:${user.username || 'admin'}`));
        logAdminAction('commercial.contract.update', user.username, String(id), { advertiser_id: advertiserId }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_contracts_updated', action: 'update', id, at: Date.now() }); } catch (_) {}
        res.json({ ok: true });
    });

    app.get('/admin/radio/commercial/ads', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rows = db.prepare(`
            SELECT ra.*, a.company_name AS advertiser_company_name, a.contact_person AS advertiser_contact_person, a.phone AS advertiser_phone, a.segment_id AS advertiser_segment_id, a.notes AS advertiser_notes, a.status AS advertiser_status, c.plan_name AS contract_plan_name, c.value_cents AS contract_value_cents, c.start_date AS contract_start_date, c.end_date AS contract_end_date, c.daily_executions AS contract_daily_executions, c.ad_duration_seconds AS contract_ad_duration_seconds, c.contract_status AS contract_status, c.payment_status AS contract_payment_status, c.segment_exclusive AS contract_segment_exclusive, c.notes AS contract_notes
            FROM radio_ads ra
            LEFT JOIN advertisers a ON a.id = ra.advertiser_id
            LEFT JOIN ad_contracts c ON c.id = ra.contract_id
            ORDER BY ra.priority DESC, ra.id DESC
        `).all();
        const ads = rows.map((row) => ({
            ...mapAdRow(row),
            advertiser: {
                id: String(row.advertiser_id),
                company_name: String(row.advertiser_company_name || ''),
                contact_person: String(row.advertiser_contact_person || ''),
                phone: String(row.advertiser_phone || ''),
                segment_id: row.advertiser_segment_id ? String(row.advertiser_segment_id) : null,
                notes: String(row.advertiser_notes || ''),
                status: normalizeStatus(row.advertiser_status, ['active', 'inactive'], 'active'),
                created_at: ''
            },
            contract: row.contract_id ? {
                id: String(row.contract_id),
                advertiser_id: String(row.advertiser_id),
                plan_name: String(row.contract_plan_name || 'Padrao'),
                value_cents: Number(row.contract_value_cents || 0),
                start_date: sanitizeDateKey(row.contract_start_date),
                end_date: sanitizeDateKey(row.contract_end_date),
                daily_executions: clampInt(row.contract_daily_executions, 1, 96, 3),
                ad_duration_seconds: clampInt(row.contract_ad_duration_seconds, 5, 600, 30),
                contract_status: normalizeStatus(row.contract_status, ['active', 'paused', 'expired', 'cancelled'], 'active'),
                payment_status: normalizeStatus(row.payment_status, ['paid', 'pending', 'overdue'], 'pending'),
                segment_exclusive: !!row.contract_segment_exclusive,
                notes: String(row.contract_notes || ''),
                created_at: ''
            } : null
        }));
        res.json({ ads });
    });

    app.post('/admin/radio/commercial/ads', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const advertiserId = Number(req.body?.advertiser_id);
        if (!Number.isFinite(advertiserId)) return res.status(400).json({ error: 'invalid_advertiser_id' });
        const contractId = req.body?.contract_id ? Number(req.body.contract_id) : null;
        const name = String(req.body?.name || '').trim().slice(0, 120);
        if (name.length < 2) return res.status(400).json({ error: 'invalid_name' });
        const file = getSafeAdFile(req.body?.file || req.body?.audio_url?.split('/').pop());
        if (!file) return res.status(400).json({ error: 'invalid_file' });
        if (contractId && !db.prepare('SELECT id FROM ad_contracts WHERE id=?').get(contractId)) return res.status(404).json({ error: 'contract_not_found' });
        const allowedStart = normalizeTimeHHMM(req.body?.allowed_hours_start, '06:00');
        const allowedEnd = normalizeTimeHHMM(req.body?.allowed_hours_end, '23:00');
        if (!isValidDailyWindow(allowedStart, allowedEnd)) return res.status(400).json({ error: 'invalid_allowed_period' });
        const row = db.prepare(`
            INSERT INTO radio_ads (advertiser_id, contract_id, name, file, duration_seconds, volume, status, approved_at, priority, allowed_hours_start, allowed_hours_end, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            advertiserId,
            contractId,
            name,
            file,
            clampInt(req.body?.duration_seconds, 5, 600, 30),
            Number(req.body?.volume || 1),
            normalizeStatus(req.body?.status, ['active', 'inactive', 'pending'], 'pending'),
            req.body?.approved_at ? Date.parse(req.body.approved_at) : null,
            clampInt(req.body?.priority, -10, 10, 0),
            allowedStart,
            allowedEnd,
            nowMs(),
            nowMs()
        );
        const adId = Number(row.lastInsertRowid || 0);
        const campaignId = syncCampaignForAd(adId, `commercial:${user.username || 'admin'}`);
        logAdminAction('commercial.ad.create', user.username, String(adId), { file, campaign_id: campaignId }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_ads_updated', action: 'create', id: adId, at: Date.now() }); } catch (_) {}
        res.json({ ok: true, id: String(adId), campaign_id: campaignId ? String(campaignId) : null });
    });

    app.put('/admin/radio/commercial/ads/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
        const existing = db.prepare('SELECT * FROM radio_ads WHERE id=?').get(id);
        if (!existing) return res.status(404).json({ error: 'not_found' });
        const advertiserId = Number(req.body?.advertiser_id || existing.advertiser_id);
        if (!Number.isFinite(advertiserId)) return res.status(400).json({ error: 'invalid_advertiser_id' });
        const contractId = req.body?.contract_id === '' ? null : (req.body?.contract_id ? Number(req.body.contract_id) : existing.contract_id);
        const name = String(req.body?.name || existing.name || '').trim().slice(0, 120);
        if (name.length < 2) return res.status(400).json({ error: 'invalid_name' });
        const file = getSafeAdFile(req.body?.file || existing.file);
        if (!file) return res.status(400).json({ error: 'invalid_file' });
        const allowedStart = normalizeTimeHHMM(req.body?.allowed_hours_start ?? existing.allowed_hours_start, '06:00');
        const allowedEnd = normalizeTimeHHMM(req.body?.allowed_hours_end ?? existing.allowed_hours_end, '23:00');
        if (!isValidDailyWindow(allowedStart, allowedEnd)) return res.status(400).json({ error: 'invalid_allowed_period' });
        db.prepare(`
            UPDATE radio_ads
               SET advertiser_id=?, contract_id=?, name=?, file=?, duration_seconds=?, volume=?, status=?, approved_at=?, priority=?, allowed_hours_start=?, allowed_hours_end=?, updated_at=?
             WHERE id=?
        `).run(
            advertiserId,
            contractId,
            name,
            file,
            clampInt(req.body?.duration_seconds ?? existing.duration_seconds, 5, 600, 30),
            Number(req.body?.volume ?? existing.volume ?? 1),
            normalizeStatus(req.body?.status ?? existing.status, ['active', 'inactive', 'pending'], 'pending'),
            req.body?.approved_at ? Date.parse(req.body.approved_at) : existing.approved_at,
            clampInt(req.body?.priority ?? existing.priority, -10, 10, 0),
            allowedStart,
            allowedEnd,
            nowMs(),
            id
        );
        const campaignId = syncCampaignForAd(id, `commercial:${user.username || 'admin'}`);
        logAdminAction('commercial.ad.update', user.username, String(id), { file, campaign_id: campaignId }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_ads_updated', action: 'update', id, at: Date.now() }); } catch (_) {}
        res.json({ ok: true, campaign_id: campaignId ? String(campaignId) : null });
    });

    app.delete('/admin/radio/commercial/ads/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
        const row = db.prepare('SELECT campaign_id FROM radio_ads WHERE id=?').get(id);
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (row.campaign_id) db.prepare('UPDATE ad_campaigns SET is_active=0, updated_at=? WHERE id=?').run(nowMs(), Number(row.campaign_id));
        db.prepare('DELETE FROM ad_schedule WHERE ad_id=? AND execution_status=?').run(id, 'pending');
        db.prepare('DELETE FROM radio_ads WHERE id=?').run(id);
        logAdminAction('commercial.ad.delete', user.username, String(id), {}, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_ads_updated', action: 'delete', id, at: Date.now() }); } catch (_) {}
        res.json({ ok: true });
    });

    app.get('/admin/radio/commercial/schedule', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const date = sanitizeDateKey(req.query.date);
        const rows = db.prepare(`
            SELECT s.*, ra.name AS ad_name, ra.file AS ad_file, ra.volume AS ad_volume, ra.priority AS ad_priority, a.id AS advertiser_ref_id, a.company_name AS advertiser_company_name
            FROM ad_schedule s
            LEFT JOIN radio_ads ra ON ra.id = s.ad_id
            LEFT JOIN advertisers a ON a.id = ra.advertiser_id
            WHERE s.schedule_date=?
            ORDER BY s.scheduled_time ASC, s.id ASC
        `).all(date);
        const schedule = rows.map((row) => ({
            id: String(row.id),
            schedule_date: sanitizeDateKey(row.schedule_date),
            scheduled_time: String(row.scheduled_time || '00:00:00'),
            ad_id: row.ad_id ? String(row.ad_id) : null,
            contract_id: row.contract_id ? String(row.contract_id) : null,
            campaign_id: row.campaign_id ? String(row.campaign_id) : null,
            execution_status: normalizeStatus(row.execution_status, ['pending', 'played', 'failed', 'skipped'], 'pending'),
            ad: row.ad_id ? {
                id: String(row.ad_id),
                advertiser_id: row.advertiser_ref_id ? String(row.advertiser_ref_id) : null,
                contract_id: row.contract_id ? String(row.contract_id) : null,
                campaign_id: row.campaign_id ? String(row.campaign_id) : null,
                name: String(row.ad_name || 'Anuncio'),
                file: String(row.ad_file || ''),
                audio_url: row.ad_file ? `/ads/${encodeURIComponent(String(row.ad_file))}` : null,
                duration_seconds: 30,
                volume: Number(row.ad_volume || 1),
                status: 'active',
                approved_at: null,
                priority: clampInt(row.ad_priority, -10, 10, 0),
                allowed_hours_start: '06:00',
                allowed_hours_end: '23:00',
                created_at: '',
                advertiser: { id: row.advertiser_ref_id ? String(row.advertiser_ref_id) : null, company_name: String(row.advertiser_company_name || ''), contact_person: '', phone: '', segment_id: null, notes: '', status: 'active', created_at: '' }
            } : null
        }));
        res.json({ date, schedule });
    });

    app.post('/admin/radio/commercial/schedule/generate', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const generated = generateSchedule(req.body?.date);
        const ts = nowMs();
        const tx = db.transaction((payload) => {
            db.prepare('DELETE FROM ad_schedule WHERE schedule_date=?').run(payload.date);
            const insert = db.prepare('INSERT INTO ad_schedule (schedule_date, scheduled_time, ad_id, contract_id, campaign_id, execution_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            payload.slots.forEach((row) => {
                insert.run(row.schedule_date, row.scheduled_time, row.ad_id, row.contract_id, row.campaign_id, row.execution_status, ts, ts);
            });
        });
        tx(generated);
        logAdminAction('commercial.schedule.generate', user.username, generated.date, { required: generated.required_total, generated: generated.generated_total }, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_schedule_updated', date: generated.date, at: Date.now() }); } catch (_) {}
        res.json({ ok: true, date: generated.date, required_total: generated.required_total, generated_total: generated.generated_total });
    });

    app.get('/admin/radio/commercial/logs', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const date = req.query.date ? sanitizeDateKey(req.query.date) : null;
        const from = req.query.from ? sanitizeDateKey(req.query.from) : date;
        const to = req.query.to ? sanitizeDateKey(req.query.to) : date;
        const limit = clampInt(req.query.limit, 1, 1000, 300);
        const fromMs = from ? toDayStartMs(from) : 0;
        const toMs = to ? toDayEndMs(to) : Number.MAX_SAFE_INTEGER;
        const rows = db.prepare(`
            SELECT l.*, ra.name AS ad_name, a.company_name AS advertiser_company_name
            FROM ad_execution_logs l
            LEFT JOIN radio_ads ra ON ra.id = l.ad_id
            LEFT JOIN advertisers a ON a.id = l.advertiser_id
            WHERE l.played_at BETWEEN ? AND ?
            ORDER BY l.played_at DESC, l.id DESC
            LIMIT ?
        `).all(fromMs, toMs, limit);
        const logs = rows.map((row) => ({
            id: String(row.id),
            ad_id: row.ad_id ? String(row.ad_id) : null,
            contract_id: row.contract_id ? String(row.contract_id) : null,
            advertiser_id: row.advertiser_id ? String(row.advertiser_id) : null,
            campaign_id: row.campaign_id ? String(row.campaign_id) : null,
            scheduled_time: String(row.scheduled_time || ''),
            played_at: new Date(Number(row.played_at || nowMs())).toISOString(),
            actual_duration_seconds: row.actual_duration_seconds === null ? null : Number(row.actual_duration_seconds || 0),
            status: normalizeStatus(row.status, ['success', 'failed', 'skipped'], 'failed'),
            error_message: String(row.error_message || ''),
            ad: row.ad_id ? { id: String(row.ad_id), name: String(row.ad_name || 'Anuncio'), advertiser_id: row.advertiser_id ? String(row.advertiser_id) : null } : null,
            advertiser: row.advertiser_id ? { id: String(row.advertiser_id), company_name: String(row.advertiser_company_name || '') } : null
        }));
        res.json({ logs, from, to });
    });

    app.get('/admin/radio/commercial/settings', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        res.json({ settings: { id: 'default', ...getSettings() } });
    });

    app.put('/admin/radio/commercial/settings', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const settings = saveSettings(req.body || {});
        logAdminAction('commercial.settings.update', user.username, 'default', settings, req.socket?.remoteAddress);
        try { broadcast({ type: 'commercial_settings_updated', at: Date.now() }); } catch (_) {}
        res.json({ ok: true, settings: { id: 'default', ...settings } });
    });
}

module.exports = { registerRadioCommercialRoutes };
