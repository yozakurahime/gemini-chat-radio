const fs = require('fs');
const path = require('path');
const RADIO_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function registerCoreSecurityRoutes({
    app,
    db,
    rootDir,
    publicAssetsDir,
    publicMediaFileMap,
    cacheDir,
    adsDir,
    upload,
    radioState,
    conversationState,
    appVersion,
    appProfile,
    tenantSlug = '',
    tenantName = '',
    isTenantMode = false,
    dataRootDir = '',
    requirePanelAuth,
    requireAdmin,
    rateLimitLogin,
    verifyPassword,
    hashPassword,
    createSession,
    setSessionCookie,
    sessionTtlMs,
    getSessionFromReq,
    parseCookieHeader,
    sessionCookie,
    hashToken,
    clearSessionCookie,
    getSafeFilename,
    isPathInside,
    resolvePublicMediaPath,
    sendSafeStaticFile,
    broadcast
}) {
    function sanitizePlaylistRows(rows) {
        return (Array.isArray(rows) ? rows : []).filter((row) => (
            row
            && typeof row === 'object'
            && RADIO_VIDEO_ID_RE.test(String(row.videoId || '').trim())
            && ['pending', 'ready', 'error'].includes(String(row.status || '').trim())
        ));
    }

    app.get('/favicon.ico', (req, res) => res.status(204).end());

    app.get(/^\/media\/(.+)$/, (req, res) => {
        const filePath = resolvePublicMediaPath({
            requestPath: req.params[0],
            rootDir,
            publicAssetsDir,
            publicMediaFileMap
        });
        if (!filePath) return res.status(404).json({ error: 'not_found' });
        return sendSafeStaticFile(res, filePath);
    });

    app.get(/^\/cache\/([^/]+)$/, (req, res) => {
        const safeName = getSafeFilename(req.params[0], ['.mp3']);
        if (!safeName) return res.status(400).json({ error: 'invalid_filename' });
        const filePath = path.join(cacheDir, safeName);
        if (!isPathInside(cacheDir, filePath) || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'not_found' });
        }
        return sendSafeStaticFile(res, filePath, 'public, max-age=3600');
    });

    app.get(/^\/ads\/([^/]+)$/, (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const safeName = getSafeFilename(req.params[0], ['.mp3']);
        if (!safeName) return res.status(400).json({ error: 'invalid_filename' });
        const filePath = path.join(adsDir, safeName);
        if (!isPathInside(adsDir, filePath) || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'not_found' });
        }
        return sendSafeStaticFile(res, filePath, 'private, max-age=3600');
    });

    app.post('/auth/login', (req, res) => {
        if (rateLimitLogin(req)) return res.status(429).json({ error: 'rate_limited' });
        const user = (req.body.user || '').toString().toLowerCase().trim();
        const pass = (req.body.pass || '').toString();
        if (!user || !pass) return res.status(400).json({ error: 'missing' });
        const dbUser = db.prepare('SELECT * FROM panel_users WHERE username=?').get(user);
        if (!dbUser || !verifyPassword(pass, dbUser.password)) {
            return res.status(401).json({ error: 'invalid' });
        }
        if (Number(dbUser.active ?? 1) === 0) {
            return res.status(403).json({ error: 'inactive_user' });
        }
        if (!dbUser.password.startsWith('scrypt$')) {
            const hashed = hashPassword(pass);
            db.prepare('UPDATE panel_users SET password=? WHERE username=?').run(hashed, user);
        }
        const session = createSession(dbUser);
        setSessionCookie(res, session.token, sessionTtlMs, req);
        return res.json({ ok: true, username: dbUser.username, role: dbUser.role, fullname: dbUser.fullname, avatar: dbUser.avatar });
    });

    app.get('/auth/me', (req, res) => {
        const user = getSessionFromReq(req);
        if (!user) return res.status(401).json({ error: 'unauthorized' });
        return res.json({ ok: true, username: user.username, role: user.role, fullname: user.fullname, avatar: user.avatar });
    });

    app.post('/auth/logout', (req, res) => {
        const cookies = parseCookieHeader(req.headers.cookie || '');
        const token = cookies[sessionCookie];
        if (token) {
            const tokenHash = hashToken(token);
            db.prepare('DELETE FROM panel_sessions WHERE token_hash=?').run(tokenHash);
        }
        clearSessionCookie(res);
        return res.json({ ok: true });
    });

    app.get('/api/health', (req, res) => {
        res.json({
            ok: true,
            service: 'himefit',
            version: appVersion,
            profile: appProfile,
            tenantSlug,
            tenantName,
            tenantMode: Boolean(isTenantMode),
            dataRoot: dataRootDir,
            ts: Date.now(),
            uptimeSec: Math.floor(process.uptime())
        });
    });

    app.get('/api/ads', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        try { res.json(fs.readdirSync(adsDir).filter((file) => file.endsWith('.mp3'))); }
        catch { res.json([]); }
    });

    app.post('/api/upload-ad', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        upload.single('file')(req, res, (err) => {
            if (err) return res.status(400).json({ error: 'invalid_upload' });
            if (!req?.file?.filename) return res.status(400).json({ error: 'missing_file' });
            const filename = req.file.filename;
            try {
                broadcast({ type: 'ads_files_updated', action: 'upload', file: filename, at: Date.now() });
            } catch (_) {}
            return res.json({ message: 'OK', file: filename });
        });
    });

    app.post('/api/delete-ad', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const filename = getSafeFilename(req.body?.filename, ['.mp3']);
        if (!filename) return res.status(400).json({ error: 'invalid_filename' });
        try {
            const targetFile = path.join(adsDir, filename);
            if (!isPathInside(adsDir, targetFile) || !fs.existsSync(targetFile)) {
                return res.status(404).json({ error: 'not_found' });
            }
            fs.unlinkSync(targetFile);
            try {
                broadcast({ type: 'ads_files_updated', action: 'delete', file: filename, at: Date.now() });
            } catch (_) {}
            return res.json({ success: true });
        } catch (_) {
            return res.status(500).json({ error: true });
        }
    });

    app.get('/api/playlist', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        const playlist = sanitizePlaylistRows(db.prepare('SELECT * FROM playlist ORDER BY id ASC').all());
        const current = sanitizePlaylistRows([radioState.currentTrack])[0] || null;
        res.json({ playlist, current });
    });

    app.get('/api/cache-files', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        try {
            const files = fs.readdirSync(cacheDir).map((name) => ({
                name,
                size: fs.statSync(path.join(cacheDir, name)).size
            }));
            res.json({ success: true, files });
        } catch (_) {
            res.json({ success: false });
        }
    });

    app.get('/api/conversations/:id/messages', (req, res) => {
        const user = requirePanelAuth(req, res); if (!user) return;
        try {
            const id = req.params.id;
            const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '80', 10)));
            const before = req.query.before ? parseInt(req.query.before, 10) : null;
            const convo = conversationState[id];
            if (!convo || !Array.isArray(convo.history)) return res.json({ messages: [], nextCursor: null, total: 0 });
            const total = convo.history.length;
            const end = (before !== null && !Number.isNaN(before)) ? Math.min(before, total) : total;
            const start = Math.max(0, end - limit);
            const messages = convo.history.slice(start, end);
            const nextCursor = start > 0 ? start : null;
            return res.json({ messages, nextCursor, total });
        } catch (_) {
            return res.json({ messages: [], nextCursor: null, total: 0 });
        }
    });
}

module.exports = { registerCoreSecurityRoutes };
