const path = require('path');
const {
    countProfileContentChars,
    generateContextFromProfile,
    isProfileTooLarge,
    normalizeContextProfile
} = require('../knowledge_context_profile');

function registerKnowledgeAdminRoutes({
    app,
    db,
    fs,
    knowledgeDir,
    baseContextFile,
    requirePanelAuth,
    requireAdmin,
    getKnowledgePublished,
    setKnowledgePublished,
    getBaseContext,
    getAIContextSnapshot,
    setBaseContext,
    syncAttendanceClassTemplatesFromContext,
    broadcast
}) {
    const contextProfileFile = path.join(knowledgeDir || path.dirname(baseContextFile), 'context_profile.json');

    function readContextProfile() {
        if (!fs.existsSync(contextProfileFile)) return null;
        try {
            return normalizeContextProfile(JSON.parse(fs.readFileSync(contextProfileFile, 'utf-8')));
        } catch (_) {
            return null;
        }
    }

    function writeContextProfile(profile) {
        fs.mkdirSync(path.dirname(contextProfileFile), { recursive: true });
        fs.writeFileSync(contextProfileFile, JSON.stringify(normalizeContextProfile(profile), null, 2), 'utf-8');
    }

    function saveBaseContext(content, username, mode = 'manual') {
        fs.writeFileSync(baseContextFile, content, 'utf-8');
        setBaseContext(content);
        let templateSummary = null;
        try {
            templateSummary = syncAttendanceClassTemplatesFromContext({ actor: username, mode });
        } catch (error) {
            console.error('[attendance] templates sync after base save error:', error?.message || error);
        }
        try {
            broadcast({
                type: 'knowledge_base_updated',
                base_context: getBaseContext(),
                updated_at: Date.now(),
                updated_by: username
            });
            if (templateSummary) {
                broadcast({
                    type: 'attendance_templates_updated',
                    updated_at: templateSummary.updated_at || Date.now(),
                    summary: templateSummary
                });
            }
        } catch (_) {}
    }

    app.get('/admin/knowledge/current', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const published = getKnowledgePublished();
        const aiContext = typeof getAIContextSnapshot === 'function' ? getAIContextSnapshot() : null;
        res.json({ published, base_context: getBaseContext() || '', ai_context: aiContext });
    });

    app.get('/admin/knowledge/profile', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        res.json({
            profile: readContextProfile(),
            base_context: getBaseContext() || ''
        });
    });

    app.post('/admin/knowledge/profile/save', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const profile = normalizeContextProfile(req.body?.profile || req.body || {});
        if (isProfileTooLarge(profile)) return res.status(400).json({ error: 'profile_too_large' });
        if (countProfileContentChars(profile) < 10) return res.status(400).json({ error: 'too_short' });
        const baseContext = generateContextFromProfile(profile);
        if (baseContext.length > 200000) return res.status(400).json({ error: 'too_large' });
        try {
            writeContextProfile(profile);
            saveBaseContext(baseContext, user.username, 'profile');
            return res.json({ success: true, profile, base_context: baseContext });
        } catch (_) {
            return res.status(500).json({ error: 'write_failed' });
        }
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
            saveBaseContext(content, user.username, 'manual');
            return res.json({ success: true });
        } catch (_) {
            return res.status(500).json({ error: 'write_failed' });
        }
    });
}

module.exports = { registerKnowledgeAdminRoutes };
