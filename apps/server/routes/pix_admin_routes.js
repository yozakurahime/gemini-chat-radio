function toInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
}

function registerPixAdminRoutes({
    app,
    requirePanelAuth,
    requireAdmin,
    sanitizePublicText,
    logAdminAction,
    listPixPlans,
    createPixPlan,
    updatePixPlan,
    deactivatePixPlan,
    listPixCharges,
    getPixChargeById,
    confirmPixChargeScaDone,
    processAsaasWebhook,
    getPixSafeConfig,
    normalizePixSafeConfigInput,
    setPixSafeConfig,
    pixDailyImportUpload,
    storePixDailyImport,
    listPixDailyImports,
    resolvePixDailyImportCsvPath,
    getPixWebhookMonitorSnapshot
}) {
    app.get('/admin/pix/plans', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const activeOnly = String(req.query?.active || '').trim() === '1';
        const items = listPixPlans({ activeOnly });
        return res.json({ ok: true, items });
    });

    app.post('/admin/pix/plans', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const name = sanitizePublicText(req.body?.name || '', 120);
        const amountCents = toInt(req.body?.amount_cents, -1);
        const active = req.body?.active === false ? 0 : 1;
        if (!name) return res.status(400).json({ error: 'invalid_name' });
        if (amountCents <= 0) return res.status(400).json({ error: 'invalid_amount' });
        try {
            const item = createPixPlan({ name, amountCents, active });
            logAdminAction('pix.plan.create', user.username, String(item.id), { name, amountCents, active: !!active }, req.ip);
            return res.json({ ok: true, item });
        } catch (error) {
            const msg = String(error?.message || '');
            if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'plan_exists' });
            return res.status(500).json({ error: 'create_failed' });
        }
    });

    app.put('/admin/pix/plans/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = toInt(req.params?.id, 0);
        if (!id) return res.status(400).json({ error: 'invalid_id' });
        const patch = {};
        if (req.body?.name !== undefined) patch.name = sanitizePublicText(req.body?.name || '', 120);
        if (req.body?.amount_cents !== undefined) patch.amountCents = toInt(req.body?.amount_cents, -1);
        if (req.body?.active !== undefined) patch.active = req.body?.active ? 1 : 0;
        if (patch.name !== undefined && !patch.name) return res.status(400).json({ error: 'invalid_name' });
        if (patch.amountCents !== undefined && patch.amountCents <= 0) return res.status(400).json({ error: 'invalid_amount' });
        try {
            const item = updatePixPlan(id, patch);
            if (!item) return res.status(404).json({ error: 'not_found' });
            logAdminAction('pix.plan.update', user.username, String(id), patch, req.ip);
            return res.json({ ok: true, item });
        } catch (error) {
            const msg = String(error?.message || '');
            if (msg.includes('UNIQUE')) return res.status(409).json({ error: 'plan_exists' });
            return res.status(500).json({ error: 'update_failed' });
        }
    });

    app.delete('/admin/pix/plans/:id', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const id = toInt(req.params?.id, 0);
        if (!id) return res.status(400).json({ error: 'invalid_id' });
        const item = deactivatePixPlan(id);
        if (!item) return res.status(404).json({ error: 'not_found' });
        logAdminAction('pix.plan.deactivate', user.username, String(id), {}, req.ip);
        return res.json({ ok: true, item });
    });

    app.get('/admin/pix/charges', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const status = sanitizePublicText(req.query?.status || '', 30);
        const scaManualStatus = sanitizePublicText(req.query?.sca_manual_status || '', 30);
        const contact = sanitizePublicText(req.query?.contact || '', 120);
        const items = listPixCharges({ status, scaManualStatus, contact });
        return res.json({ ok: true, items });
    });

    app.get('/admin/pix/webhook-status', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const monitor = typeof getPixWebhookMonitorSnapshot === 'function'
            ? getPixWebhookMonitorSnapshot()
            : null;
        if (!monitor) return res.status(503).json({ ok: false, error: 'webhook_monitor_unavailable' });
        return res.json({ ok: true, monitor });
    });

    app.get('/admin/pix/safe-config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const config = typeof getPixSafeConfig === 'function' ? getPixSafeConfig() : null;
        if (!config) return res.status(503).json({ ok: false, error: 'pix_safe_config_unavailable' });
        return res.json({ ok: true, config });
    });

    app.put('/admin/pix/safe-config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        if (typeof normalizePixSafeConfigInput !== 'function' || typeof setPixSafeConfig !== 'function') {
            return res.status(503).json({ ok: false, error: 'pix_safe_config_unavailable' });
        }
        const current = typeof getPixSafeConfig === 'function' ? getPixSafeConfig() : {};
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        const normalized = normalizePixSafeConfigInput(payload, current || {});
        const saved = setPixSafeConfig(normalized, user.username);
        logAdminAction('pix.safe_config.update', user.username, 'pix_safe', saved, req.ip);
        return res.json({ ok: true, config: saved });
    });

    app.get('/admin/pix/daily-imports', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const limit = toInt(req.query?.limit, 20);
        const items = typeof listPixDailyImports === 'function' ? listPixDailyImports({ limit }) : [];
        return res.json({ ok: true, items });
    });

    app.post('/admin/pix/daily-imports/upload', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        if (!pixDailyImportUpload || typeof storePixDailyImport !== 'function') {
            return res.status(503).json({ ok: false, error: 'daily_import_unavailable' });
        }
        const middleware = pixDailyImportUpload.single('file');
        middleware(req, res, (err) => {
            if (err) {
                return res.status(400).json({ ok: false, error: 'upload_failed', detail: String(err?.message || err) });
            }
            const file = req.file;
            if (!file || !Buffer.isBuffer(file.buffer)) {
                return res.status(400).json({ ok: false, error: 'missing_file' });
            }
            try {
                const item = storePixDailyImport({
                    fileBuffer: file.buffer,
                    originalName: file.originalname || '',
                    uploadedBy: user.username || ''
                });
                logAdminAction('pix.daily_import.upload', user.username, String(item?.id || 0), {
                    original: file.originalname || '',
                    csv: item?.csv_filename || '',
                    rows: Number(item?.rows_count || 0),
                    cols: Number(item?.columns_count || 0)
                }, req.ip);
                return res.json({ ok: true, item });
            } catch (error) {
                const code = String(error?.message || 'upload_parse_failed');
                return res.status(400).json({ ok: false, error: code });
            }
        });
    });

    app.get('/admin/pix/daily-imports/:id/csv', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        if (typeof resolvePixDailyImportCsvPath !== 'function') {
            return res.status(503).json({ ok: false, error: 'daily_import_unavailable' });
        }
        const id = toInt(req.params?.id, 0);
        if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });
        const fullPath = resolvePixDailyImportCsvPath(id);
        if (!fullPath) return res.status(404).json({ ok: false, error: 'not_found' });
        res.setHeader('Cache-Control', 'no-store');
        return res.download(fullPath);
    });

    app.post('/admin/pix/charges/:id/sca-done', async (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const id = toInt(req.params?.id, 0);
        if (!id) return res.status(400).json({ error: 'invalid_id' });
        const charge = getPixChargeById(id);
        if (!charge) return res.status(404).json({ error: 'not_found' });
        if (String(charge.status || '') !== 'paid') return res.status(400).json({ error: 'charge_not_paid' });
        const result = await confirmPixChargeScaDone({
            id,
            actor: user.fullname || user.username || 'Atendente',
            actorUsername: user.username || '',
            ip: req.ip
        });
        return res.json({ ok: true, charge: result });
    });

    app.post('/api/payments/webhook/asaas', async (req, res) => {
        try {
            const processed = await processAsaasWebhook({
                headers: req.headers || {},
                body: req.body || {}
            });
            if (!processed.ok) {
                if (processed.error === 'unauthorized') return res.status(401).json({ ok: false, error: 'unauthorized' });
                if (processed.error === 'ignored') return res.json({ ok: true, ignored: true });
                return res.status(400).json({ ok: false, error: processed.error || 'invalid_payload' });
            }
            return res.json({ ok: true });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'webhook_failed' });
        }
    });
}

module.exports = {
    registerPixAdminRoutes
};
