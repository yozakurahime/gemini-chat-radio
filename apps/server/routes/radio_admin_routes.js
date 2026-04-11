function registerRadioAdminRoutes({
    app,
    db,
    fs,
    path,
    ffmpeg,
    ADS_DIR,
    CACHE_DIR,
    requirePanelAuth,
    requireAdmin,
    getCampaignsWithRuntime,
    normalizeCampaignMode,
    normalizeCampaignPayload,
    logAdminAction,
    broadcast,
    pickNextDueCampaign,
    pickNextUpcomingCampaign,
    getReservedCampaignFiles,
    runRadioCheck,
    runRadioCheckScript,
    resolveSafeMediaPath,
    moveToRadioTrash,
    safeJsonParse,
    generateSeedAdDrafts,
    generateCustomAdDraft,
    synthesizeAdSpeech,
    getAdsAICapabilities
}) {
const ADS_AI_TEXT_LIMIT = 1200;
const ADS_AI_NAME_LIMIT = 80;
const adsAiLocks = new Map();

function storeAdsHistory(event, data, username) {
    const payload = data && typeof data === 'object' ? data : {};
    const file = (payload.file || '').toString().trim().slice(0, 255);
    const reason = (payload.reason || payload.error || '').toString().trim().slice(0, 255);
    const row = db.prepare(`
        INSERT INTO ads_history (event, data_json, file, reason, username, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        String(event || 'ads.ai.event'),
        JSON.stringify(payload),
        file,
        reason,
        String(username || ''),
        Date.now()
    );
    return {
        id: Number(row.lastInsertRowid || 0),
        event: String(event || 'ads.ai.event'),
        created_at: Date.now(),
        data: payload
    };
}

function normalizeAdsAiText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, ADS_AI_TEXT_LIMIT);
}

function normalizeAdsAiName(value, fallback = 'anuncio_ia') {
    const trimmed = String(value || '').trim().slice(0, ADS_AI_NAME_LIMIT);
    return trimmed || fallback;
}

function slugifySegment(value, fallback = 'anuncio') {
    const slug = normalizeAdsAiName(value, fallback)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return slug || fallback;
}

function buildAiAdFilename(category, title) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const safeCategory = slugifySegment(category || 'institucional', 'institucional');
    const safeTitle = slugifySegment(title || 'anuncio_ia', 'anuncio_ia');
    return `ia_${safeCategory}_${safeTitle}_${stamp}.mp3`;
}

function probeDuration(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (error, data) => {
            if (error) return resolve(0);
            return resolve(Number(data?.format?.duration || 0) || 0);
        });
    });
}

async function withAdsAiLock(userKey, fn) {
    if (!userKey) throw new Error('ads_ai_invalid_actor');
    if (adsAiLocks.has(userKey)) throw new Error('ads_ai_busy');
    adsAiLocks.set(userKey, Date.now());
    try {
        return await fn();
    } finally {
        adsAiLocks.delete(userKey);
    }
}

function getAdsAiStatus() {
    const capabilities = typeof getAdsAICapabilities === 'function' ? getAdsAICapabilities() : {};
    return {
        enabled: !!capabilities.enabled,
        can_generate_scripts: !!capabilities.can_generate_scripts,
        can_synthesize: !!capabilities.can_synthesize,
        text_model_configured: !!capabilities.text_model_configured,
        openai_configured: !!capabilities.openai_configured,
        voice_model: String(capabilities.voice_model || 'gpt-4o-mini-tts'),
        voice: String(capabilities.voice || 'coral'),
        warning: String(capabilities.warning || '')
    };
}

function ensureAdsAiEnabled(res) {
    const status = getAdsAiStatus();
    if (!status.enabled) {
        res.status(503).json({ error: 'ads_ai_disabled', status });
        return null;
    }
    return status;
}

app.post('/admin/radio/ads/test', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    try {
        const files = fs.readdirSync(ADS_DIR).filter(f => f.endsWith('.mp3'));
        if (!files.length) return res.json({ ok: false, reason: 'no_files' });
        const file = files[0];
        const full = path.join(ADS_DIR, file);
        const size = fs.statSync(full).size;
        if (size <= 0) return res.json({ ok: false, reason: 'zero_bytes', file });
        ffmpeg.ffprobe(full, (err, data) => {
            if (err) return res.json({ ok: false, reason: 'ffprobe_error', error: err.message, file });
            return res.json({ ok: true, file, size, duration: data?.format?.duration || 0 });
        });
    } catch (e) {
        res.json({ ok: false, reason: 'exception', error: e.message });
    }
});

app.get('/admin/radio/ads/campaigns', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const now = Date.now();
    const campaigns = getCampaignsWithRuntime(now).map(c => ({
        id: c.id,
        name: c.name,
        advertiser: c.advertiser || '',
        file: c.file,
        mode: c.mode,
        runs_per_day: Number(c.runs_per_day || 0),
        interval_hours: Number(c.interval_hours || 0),
        start_at: Number(c.start_at || 0),
        end_at: Number(c.end_at || 0),
        is_active: !!c.is_active,
        priority: Number(c.priority || 0),
        notes: c.notes || '',
        created_by: c.created_by || '',
        created_at: Number(c.created_at || 0),
        updated_at: Number(c.updated_at || 0),
        runtime: c.runtime || {}
    }));
    res.json({ campaigns, now });
});

app.post('/admin/radio/ads/campaigns', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const parsed = normalizeCampaignPayload(req.body || {}, { partial: false });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const data = parsed.value;
    const ts = Date.now();
    const row = db.prepare(`
        INSERT INTO ad_campaigns
            (name, advertiser, file, mode, runs_per_day, interval_hours, start_at, end_at, is_active, priority, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        data.name,
        data.advertiser || '',
        data.file,
        normalizeCampaignMode(data.mode),
        Number(data.runs_per_day || 3),
        Number(data.interval_hours || 1),
        Number(data.start_at),
        Number(data.end_at),
        data.is_active === 0 ? 0 : 1,
        Number(data.priority || 0),
        data.notes || '',
        user.username || '',
        ts,
        ts
    );
    logAdminAction('ads.campaign.create', user.username, String(row.lastInsertRowid), { name: data.name, file: data.file }, req.socket?.remoteAddress);
    try { broadcast({ type: 'ads_campaigns_updated', action: 'create', id: Number(row.lastInsertRowid), at: Date.now() }); } catch(e) {}
    res.json({ ok: true, id: row.lastInsertRowid });
});

app.put('/admin/radio/ads/campaigns/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const existing = db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const parsed = normalizeCampaignPayload(req.body || {}, { partial: false });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const data = parsed.value;
    db.prepare(`
        UPDATE ad_campaigns
           SET name=?, advertiser=?, file=?, mode=?, runs_per_day=?, interval_hours=?, start_at=?, end_at=?, is_active=?, priority=?, notes=?, updated_at=?
         WHERE id=?
    `).run(
        data.name,
        data.advertiser || '',
        data.file,
        normalizeCampaignMode(data.mode),
        Number(data.runs_per_day || 3),
        Number(data.interval_hours || 1),
        Number(data.start_at),
        Number(data.end_at),
        data.is_active === 0 ? 0 : 1,
        Number(data.priority || 0),
        data.notes || '',
        Date.now(),
        id
    );
    logAdminAction('ads.campaign.update', user.username, String(id), { name: data.name, file: data.file }, req.socket?.remoteAddress);
    try { broadcast({ type: 'ads_campaigns_updated', action: 'update', id: Number(id), at: Date.now() }); } catch(e) {}
    res.json({ ok: true });
});

app.post('/admin/radio/ads/campaigns/:id/toggle', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT id, is_active FROM ad_campaigns WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const next = req.body?.active === undefined ? (row.is_active ? 0 : 1) : (req.body.active ? 1 : 0);
    db.prepare('UPDATE ad_campaigns SET is_active=?, updated_at=? WHERE id=?').run(next, Date.now(), id);
    logAdminAction('ads.campaign.toggle', user.username, String(id), { active: !!next }, req.socket?.remoteAddress);
    try { broadcast({ type: 'ads_campaigns_updated', action: 'toggle', id: Number(id), active: !!next, at: Date.now() }); } catch(e) {}
    res.json({ ok: true, active: !!next });
});

app.delete('/admin/radio/ads/campaigns/:id', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const row = db.prepare('SELECT id FROM ad_campaigns WHERE id=?').get(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    db.prepare('UPDATE ad_campaigns SET is_active=0, updated_at=? WHERE id=?').run(Date.now(), id);
    logAdminAction('ads.campaign.delete', user.username, String(id), {}, req.socket?.remoteAddress);
    try { broadcast({ type: 'ads_campaigns_updated', action: 'delete', id: Number(id), at: Date.now() }); } catch(e) {}
    res.json({ ok: true });
});

app.get('/admin/radio/ads/next', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const now = Date.now();
    const campaign = pickNextDueCampaign(now);
    const nextCampaign = pickNextUpcomingCampaign(now);
    const blockedFiles = getReservedCampaignFiles(now);

    if (!campaign) {
        return res.json({
            campaign: null,
            now,
            next_due_at: nextCampaign ? Number(nextCampaign.runtime?.next_due_at || 0) : null,
            next_campaign: nextCampaign ? {
                id: nextCampaign.id,
                name: nextCampaign.name,
                advertiser: nextCampaign.advertiser || '',
                file: nextCampaign.file,
                mode: nextCampaign.mode,
                priority: Number(nextCampaign.priority || 0),
                runtime: nextCampaign.runtime || {}
            } : null,
            blocked_files: blockedFiles
        });
    }
    res.json({
        now,
        next_due_at: nextCampaign ? Number(nextCampaign.runtime?.next_due_at || 0) : Number(campaign.runtime?.next_due_at || now),
        next_campaign: nextCampaign ? {
            id: nextCampaign.id,
            name: nextCampaign.name,
            advertiser: nextCampaign.advertiser || '',
            file: nextCampaign.file,
            mode: nextCampaign.mode,
            priority: Number(nextCampaign.priority || 0),
            runtime: nextCampaign.runtime || {}
        } : null,
        blocked_files: blockedFiles,
        campaign: {
            id: campaign.id,
            name: campaign.name,
            advertiser: campaign.advertiser || '',
            file: campaign.file,
            mode: campaign.mode,
            priority: Number(campaign.priority || 0),
            runtime: campaign.runtime || {}
        }
    });
});

app.post('/admin/radio/ads/campaigns/:id/track', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const campaign = db.prepare('SELECT id, file FROM ad_campaigns WHERE id=?').get(id);
    if (!campaign) return res.status(404).json({ error: 'not_found' });
    const status = (req.body?.status || '').toString().trim().toLowerCase();
    if (!['played', 'error', 'skipped'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    const file = (req.body?.file || campaign.file || '').toString().trim();
    const reason = (req.body?.reason || '').toString().trim().slice(0, 120);
    const meta = req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {};
    db.prepare(`
        INSERT INTO ad_campaign_runs (campaign_id, file, status, reason, played_at, meta_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, file, status, reason, Date.now(), JSON.stringify(meta));
    try { broadcast({ type: 'ads_campaigns_updated', action: 'track', id: Number(id), status, at: Date.now() }); } catch(e) {}
    res.json({ ok: true });
});

app.post('/admin/radio/library/check', async (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    try {
        const report = await runRadioCheck();
        res.json(report);
    } catch (e) {
        res.status(500).json({ error: 'check_failed', message: e.message });
    }
});

app.post('/admin/radio/library/report', async (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const mode = (req.body.mode || 'report').toString();
    const safeMode = (mode === 'move') ? 'move' : 'report';
    try {
        const result = await runRadioCheckScript(safeMode);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'report_failed', message: e.message });
    }
});

app.post('/admin/radio/library/remove', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const rel = (req.body.file || '').toString();
    const action = (req.body.action || 'move').toString();
    const reason = (req.body.reason || 'cleanup').toString();
    const abs = resolveSafeMediaPath(rel);
    if (!abs) return res.status(400).json({ error: 'invalid_path' });
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'not_found' });
    try {
        if (action === 'delete') fs.unlinkSync(abs);
        else moveToRadioTrash(abs, reason);
        if (abs.toLowerCase().startsWith(path.resolve(CACHE_DIR).toLowerCase())) {
            const vid = path.basename(abs, path.extname(abs));
            db.prepare('DELETE FROM playlist WHERE videoId=?').run(vid);
            broadcast({ type: 'playlist_updated' }, true);
        }
        logAdminAction('radio.file.remove', user.username, rel, { action, reason }, req.socket?.remoteAddress);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'remove_failed', message: e.message });
    }
});

app.get('/admin/radio/ads/history', (req, res) => {
    const user = requirePanelAuth(req, res); if (!user) return;
    const limitRaw = parseInt((req.query.limit || '50').toString(), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
    const rows = db.prepare('SELECT id, event, data_json, created_at FROM ads_history ORDER BY id DESC LIMIT ?').all(limit);
    const history = rows.map(r => ({ id: r.id, event: r.event, at: r.created_at, data: safeJsonParse(r.data_json || '{}', {}) }));
    res.json({ history });
});

app.get('/admin/radio/ads/ai/status', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    res.json({ status: getAdsAiStatus() });
});

app.post('/admin/radio/ads/ai/seed-scripts', async (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const status = ensureAdsAiEnabled(res); if (!status) return;
    if (!status.can_generate_scripts) return res.status(503).json({ error: 'ads_ai_text_unavailable', status });
    const count = Math.max(1, Math.min(24, Number(req.body?.count || 24) || 24));
    try {
        const drafts = await withAdsAiLock(`seed:${user.username}`, async () => generateSeedAdDrafts({ count }));
        const entry = storeAdsHistory('ads.ai.script.seed', { count, generated: drafts.length }, user.username);
        try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
        res.json({ ok: true, drafts, count: drafts.length, status });
    } catch (error) {
        const entry = storeAdsHistory('ads.ai.error', { reason: 'seed_scripts_failed', error: String(error?.message || error) }, user.username);
        try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
        res.status(500).json({ error: 'seed_scripts_failed', message: String(error?.message || error) });
    }
});

app.post('/admin/radio/ads/ai/custom-script', async (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const status = ensureAdsAiEnabled(res); if (!status) return;
    if (!status.can_generate_scripts) return res.status(503).json({ error: 'ads_ai_text_unavailable', status });
    const briefing = String(req.body?.briefing || '').trim().slice(0, 500);
    if (!briefing) return res.status(400).json({ error: 'briefing_required' });
    const objective = String(req.body?.objective || '').trim().slice(0, 220);
    const cta = String(req.body?.cta || '').trim().slice(0, 120);
    const category = String(req.body?.category || 'promocao').trim() || 'promocao';
    try {
        const draft = await withAdsAiLock(`custom:${user.username}`, async () => generateCustomAdDraft({ briefing, objective, cta, category }));
        const entry = storeAdsHistory('ads.ai.script.custom', { category, title: draft.title }, user.username);
        try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
        res.json({ ok: true, draft, status });
    } catch (error) {
        const entry = storeAdsHistory('ads.ai.error', { reason: 'custom_script_failed', error: String(error?.message || error) }, user.username);
        try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
        res.status(500).json({ error: 'custom_script_failed', message: String(error?.message || error) });
    }
});

app.post('/admin/radio/ads/ai/render', async (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const status = ensureAdsAiEnabled(res); if (!status) return;
    if (!status.can_synthesize) return res.status(503).json({ error: 'ads_ai_tts_unavailable', status });
    const text = normalizeAdsAiText(req.body?.text);
    if (!text) return res.status(400).json({ error: 'invalid_text' });
    const title = normalizeAdsAiName(req.body?.title, 'Anuncio IA');
    const category = normalizeAdsAiName(req.body?.category, 'institucional');
    const preview = !!req.body?.preview;

    try {
        const audio = await withAdsAiLock(`render:${user.username}`, async () => synthesizeAdSpeech(text));
        const reasonLabel = preview ? 'preview' : 'saved';
        if (preview) {
            const entry = storeAdsHistory('ads.ai.audio.preview', { title, category, reason: reasonLabel }, user.username);
            try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
            return res.json({
                ok: true,
                preview: true,
                title,
                category,
                mimeType: audio.mimeType || 'audio/mpeg',
                audioBase64: audio.buffer.toString('base64')
            });
        }

        const file = buildAiAdFilename(category, title);
        const target = path.join(ADS_DIR, file);
        fs.writeFileSync(target, audio.buffer);
        const duration = await probeDuration(target);
        const entry = storeAdsHistory('ads.ai.audio.saved', {
            file,
            title,
            category,
            duration,
            size: audio.buffer.length,
            model: audio.model,
            voice: audio.voice
        }, user.username);
        try {
            broadcast({ type: 'ads_files_updated', action: 'upload', file, at: Date.now() });
            broadcast({ type: 'ads_history_updated', entry });
        } catch (_) {}
        logAdminAction('ads.ai.render.save', user.username, file, { title, category, duration }, req.socket?.remoteAddress);
        return res.json({
            ok: true,
            file,
            url: `/ads/${encodeURIComponent(file)}`,
            size: audio.buffer.length,
            duration,
            title,
            category
        });
    } catch (error) {
        const entry = storeAdsHistory('ads.ai.error', {
            reason: preview ? 'preview_failed' : 'render_failed',
            error: String(error?.message || error),
            title,
            category
        }, user.username);
        try { broadcast({ type: 'ads_history_updated', entry }); } catch (_) {}
        res.status(500).json({ error: 'render_failed', message: String(error?.message || error) });
    }
});

app.get('/admin/audit', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const limitRaw = parseInt((req.query.limit || '100').toString(), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 100;
    const rows = db.prepare('SELECT id, action, actor, target, meta_json, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT ?').all(limit);
    const logs = rows.map(r => ({
        id: r.id,
        action: r.action,
        actor: r.actor,
        target: r.target,
        ip: r.ip,
        at: r.created_at,
        meta: safeJsonParse(r.meta_json || '{}', {})
    }));
    res.json({ logs });
});

app.get('/admin/audit/export', (req, res) => {
    const user = requireAdmin(req, res); if (!user) return;
    const rows = db.prepare('SELECT id, action, actor, target, meta_json, ip, created_at FROM admin_audit ORDER BY id DESC LIMIT 2000').all();
    let csv = '\uFEFFid;action;actor;target;ip;created_at;meta\n';
    rows.forEach(r => {
        const meta = (r.meta_json || '').replace(/\n/g, ' ').replace(/\r/g, ' ');
        const created = new Date(r.created_at || Date.now()).toISOString();
        csv += `${r.id};${r.action};${r.actor};${r.target};${r.ip};${created};${meta}\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=admin_audit.csv');
    res.send(csv);
});
}

module.exports = { registerRadioAdminRoutes };
