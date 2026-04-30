function registerCoreSecurityRoutes({
    app,
    db,
    rootDir,
    publicAssetsDir,
    publicMediaFileMap,
    conversationState,
    appVersion,
    appProfile,
    requirePanelAuth,
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
    resolvePublicMediaPath,
    sendSafeStaticFile
}) {
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
            ts: Date.now(),
            uptimeSec: Math.floor(process.uptime())
        });
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
