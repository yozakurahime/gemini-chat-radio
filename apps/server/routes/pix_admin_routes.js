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
    processAsaasWebhook
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
