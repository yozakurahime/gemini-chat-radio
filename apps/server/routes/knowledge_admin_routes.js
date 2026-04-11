function registerKnowledgeAdminRoutes({
    app,
    db,
    fs,
    baseContextFile,
    requirePanelAuth,
    requireAdmin,
    getKnowledgePublished,
    setKnowledgePublished,
    getBaseContext,
    setBaseContext,
    syncAttendanceClassTemplatesFromContext,
    broadcast
}) {
    app.get('/admin/knowledge/current', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const published = getKnowledgePublished();
        res.json({ published, base_context: getBaseContext() || '' });
    });

    app.get('/admin/knowledge/versions', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const rows = db.prepare('SELECT id, content_json, published, author, created_at FROM knowledge_versions ORDER BY id DESC LIMIT 50').all();
        const versions = rows.map((row) => ({
            id: row.id,
            published: !!row.published,
            author: row.author,
            created_at: row.created_at,
            content: JSON.parse(row.content_json || '{}')
        }));
        res.json({ versions });
    });

    app.post('/admin/knowledge/publish', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const avisos = (req.body.avisos || '').toString().trim();
        if (!avisos || avisos.length < 3) return res.status(400).json({ error: 'empty' });
        if (avisos.length > 10000) return res.status(400).json({ error: 'too_large' });
        db.prepare('UPDATE knowledge_versions SET published=0').run();
        const content = { avisos };
        const id = db.prepare('INSERT INTO knowledge_versions (content_json, published, author, created_at) VALUES (?, ?, ?, ?)')
            .run(JSON.stringify(content), 1, user.username, Date.now()).lastInsertRowid;
        setKnowledgePublished(content, user.username);
        res.json({ success: true, id });
    });

    app.post('/admin/knowledge/rollback', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const id = parseInt(req.body.id, 10);
        const row = db.prepare('SELECT id, content_json FROM knowledge_versions WHERE id=?').get(id);
        if (!row) return res.status(404).json({ error: 'not_found' });
        db.prepare('UPDATE knowledge_versions SET published=0').run();
        db.prepare('UPDATE knowledge_versions SET published=1 WHERE id=?').run(id);
        const content = JSON.parse(row.content_json || '{}');
        setKnowledgePublished(content, user.username);
        res.json({ success: true });
    });

    app.post('/admin/knowledge/base/save', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const content = (req.body?.base_context ?? '').toString();
        const trimmed = content.trim();
        if (trimmed.length < 10) return res.status(400).json({ error: 'too_short' });
        if (content.length > 200000) return res.status(400).json({ error: 'too_large' });
        try {
            fs.writeFileSync(baseContextFile, content, 'utf-8');
            setBaseContext(content);
            let templateSummary = null;
            try {
                templateSummary = syncAttendanceClassTemplatesFromContext({ actor: user.username, mode: 'manual' });
            } catch (error) {
                console.error('[attendance] templates sync after base save error:', error?.message || error);
            }
            try {
                broadcast({
                    type: 'knowledge_base_updated',
                    base_context: getBaseContext(),
                    updated_at: Date.now(),
                    updated_by: user.username
                });
                if (templateSummary) {
                    broadcast({
                        type: 'attendance_templates_updated',
                        updated_at: templateSummary.updated_at || Date.now(),
                        summary: templateSummary
                    });
                }
            } catch (_) {}
            return res.json({ success: true });
        } catch (_) {
            return res.status(500).json({ error: 'write_failed' });
        }
    });
}

module.exports = { registerKnowledgeAdminRoutes };
