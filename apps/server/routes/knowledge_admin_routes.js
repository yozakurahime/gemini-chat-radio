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
    const playbooksFile = path.join(knowledgeDir || path.dirname(baseContextFile), 'ai_playbooks.json');

    function defaultPlaybooks() {
        return {
            enabled: true,
            sections: {
                mensalidade: 'Quando perguntarem valor da mensalidade ou preco de plano, responda com os valores que existirem no contexto. Se nao houver valor no contexto, diga que vai confirmar com o atendimento humano antes de fechar.',
                modalidades: 'Quando perguntarem modalidades, responda com lista objetiva (nome, frequencia, publico e observacoes) priorizando clareza comercial.',
                matricula: 'Quando pedirem matricula, explique documentos, forma de pagamento, etapas e ofereca concluir com atendente humano.',
                objecoes: 'Quando houver indecisao (tempo, preco, distancia), responda com empatia, destaque beneficios praticos e convide para teste/aula experimental quando houver no contexto.'
            },
            updated_at: 0,
            updated_by: 'system'
        };
    }

    function normalizePlaybooksInput(raw = {}, actor = 'system', keepTimestamp = false) {
        const defaults = defaultPlaybooks();
        const sections = raw?.sections && typeof raw.sections === 'object' ? raw.sections : {};
        const clean = (value, fallback) => String(value ?? fallback ?? '').trim().slice(0, 1200);
        return {
            enabled: raw?.enabled !== false,
            sections: {
                mensalidade: clean(sections.mensalidade, defaults.sections.mensalidade),
                modalidades: clean(sections.modalidades, defaults.sections.modalidades),
                matricula: clean(sections.matricula, defaults.sections.matricula),
                objecoes: clean(sections.objecoes, defaults.sections.objecoes)
            },
            updated_at: keepTimestamp ? Number(raw?.updated_at || 0) : Date.now(),
            updated_by: String(actor || 'system').trim().slice(0, 80) || 'system'
        };
    }

    function readPlaybooks() {
        if (!fs.existsSync(playbooksFile)) return defaultPlaybooks();
        try {
            const parsed = JSON.parse(fs.readFileSync(playbooksFile, 'utf-8'));
            return normalizePlaybooksInput(parsed, parsed?.updated_by || 'system', true);
        } catch (_) {
            return defaultPlaybooks();
        }
    }

    function writePlaybooks(playbooks) {
        fs.mkdirSync(path.dirname(playbooksFile), { recursive: true });
        fs.writeFileSync(playbooksFile, JSON.stringify(playbooks, null, 2), 'utf-8');
    }

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

    app.get('/admin/knowledge/playbooks', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        return res.json({
            ok: true,
            playbooks: readPlaybooks()
        });
    });

    app.post('/admin/knowledge/playbooks/save', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const next = normalizePlaybooksInput(req.body?.playbooks || req.body || {}, user.username);
        try {
            writePlaybooks(next);
            try {
                broadcast({
                    type: 'ai_playbooks_updated',
                    updated_at: next.updated_at,
                    updated_by: next.updated_by
                });
            } catch (_) {}
            return res.json({ ok: true, playbooks: next });
        } catch (_) {
            return res.status(500).json({ error: 'write_failed' });
        }
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
