const path = require('path');
const crypto = require('crypto');

function registerSystemAdminRoutes({
    app,
    db,
    fs,
    requireAdmin,
    getLastQrRaw,
    getLastQrAt,
    getLastPairingCode,
    getLastPairingAt,
    setLastPairingCode,
    setLastPairingAt,
    getSock,
    getWhatsappConnected,
    getStartingSock,
    getReconnectTimer,
    getReconnectAttempts,
    getWhatsappLastError,
    getWhatsappLastErrorCode,
    getSystemConfig,
    resolveUpdatesManifestUrl,
    maskSystemConfig,
    isCommercialProfile,
    appProfile,
    appVersion,
    pendingRestoreDbFile,
    dataRootDir,
    dbFile,
    backupDir,
    updatesDir,
    normalizeSystemConfigInput,
    setSystemConfig,
    logAdminAction,
    sanitizePublicText,
    hashPassword,
    isStrongPassword,
    getSystemUpdateState,
    checkForSystemUpdate,
    setSystemUpdateState,
    createDatabaseBackup,
    downloadFileOverHttp,
    restoreDatabaseBackup,
    ensureDir,
    getOperationalHealthSnapshot,
    getOpsAlertsConfig,
    normalizeOpsAlertsConfigInput,
    setOpsAlertsConfig
}) {
    const USERNAME_RE = /^[a-z0-9._-]{3,60}$/;

    function normalizeUsername(raw) {
        return String(raw || '').toLowerCase().trim();
    }

    function normalizeRole(raw) {
        return String(raw || '').toLowerCase().trim() === 'admin' ? 'admin' : 'user';
    }

    function mapPanelUserRow(row) {
        if (!row) return null;
        return {
            username: String(row.username || ''),
            fullname: String(row.fullname || ''),
            role: normalizeRole(row.role),
            avatar: String(row.avatar || ''),
            active: Number(row.active ?? 1) === 1,
            created_at: Number(row.created_at || 0),
            updated_at: Number(row.updated_at || 0),
        };
    }

    function listPanelUsers() {
        const rows = db.prepare(`
            SELECT
                username,
                fullname,
                role,
                avatar,
                COALESCE(active, 1) AS active,
                created_at,
                updated_at
            FROM panel_users
            ORDER BY CASE WHEN role='admin' THEN 0 ELSE 1 END, username ASC
        `).all();
        return rows.map((row) => mapPanelUserRow(row));
    }

    function countOtherActiveAdmins(usernameToExclude) {
        const row = db.prepare(`
            SELECT COUNT(1) AS total
            FROM panel_users
            WHERE role='admin'
              AND COALESCE(active, 1)=1
              AND username <> ?
        `).get(String(usernameToExclude || ''));
        return Number(row?.total || 0);
    }

    function revokeUserSessions(username) {
        db.prepare('DELETE FROM panel_sessions WHERE username=?').run(String(username || ''));
    }

    app.get('/auth/qr', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const lastQrRaw = getLastQrRaw();
        const lastQrAt = getLastQrAt();
        if (!lastQrRaw) return res.json({ ok: false, message: 'qr_not_available' });
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(lastQrRaw)}`;
        return res.json({ ok: true, qr: lastQrRaw, qr_url: qrUrl, updated_at: lastQrAt });
    });

    app.post('/auth/pairing-code', async (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        try {
            const sock = getSock();
            if (!sock || typeof sock.requestPairingCode !== 'function') {
                return res.status(503).json({ ok: false, message: 'socket_not_ready' });
            }
            const phone = String(req.body?.phone || process.env.PAIRING_PHONE || '').replace(/\D/g, '');
            if (!phone || phone.length < 10) {
                return res.status(400).json({ ok: false, message: 'invalid_phone' });
            }
            const code = await sock.requestPairingCode(phone);
            setLastPairingCode(code || '');
            setLastPairingAt(Date.now());
            return res.json({ ok: true, code: getLastPairingCode(), updated_at: getLastPairingAt() });
        } catch (error) {
            return res.status(500).json({ ok: false, message: error?.message || 'pairing_code_error' });
        }
    });

    app.get('/auth/pairing-code', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const lastPairingCode = getLastPairingCode();
        const lastPairingAt = getLastPairingAt();
        if (!lastPairingCode) return res.json({ ok: false, message: 'pairing_code_not_available' });
        return res.json({ ok: true, code: lastPairingCode, updated_at: lastPairingAt });
    });

    app.get('/admin/whatsapp/status', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const lastQrRaw = getLastQrRaw();
        const lastQrAt = getLastQrAt();
        const lastPairingCode = getLastPairingCode();
        const lastPairingAt = getLastPairingAt();
        const sock = getSock();
        const connected = !!getWhatsappConnected();
        const lastError = getWhatsappLastError() || '';
        const lastErrorCode = getWhatsappLastErrorCode() || 0;
        let status = connected ? 'connected' : 'disconnected';
        if (!connected && (getStartingSock() || getReconnectTimer())) status = 'connecting';
        if (!connected && lastQrRaw) status = 'qr_ready';
        if (!connected && lastPairingCode) status = 'pairing_code_ready';
        if (!connected && !lastQrRaw && !lastPairingCode && (lastErrorCode === 401 || lastErrorCode === 405 || lastError === 'loggedOut')) {
            status = 'relogin_required';
        }
        const qrUrl = lastQrRaw
            ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(lastQrRaw)}`
            : '';

        return res.json({
            ok: true,
            status,
            connected,
            socketReady: connected,
            reconnectAttempts: getReconnectAttempts(),
            starting: !!getStartingSock(),
            qr: {
                available: !!lastQrRaw,
                qr: lastQrRaw || '',
                qr_url: qrUrl,
                updated_at: lastQrAt || 0
            },
            pairing: {
                available: !!lastPairingCode,
                code: lastPairingCode || '',
                updated_at: lastPairingAt || 0
            },
            lastError,
            lastErrorCode,
            updatedAt: Date.now()
        });
    });

    app.get('/admin/system/health/detailed', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const health = typeof getOperationalHealthSnapshot === 'function'
            ? getOperationalHealthSnapshot()
            : null;
        if (!health) {
            return res.status(503).json({ ok: false, error: 'health_snapshot_unavailable' });
        }
        return res.json({
            ok: true,
            profile: appProfile,
            appVersion,
            health
        });
    });

    app.get('/admin/system/alerts/config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const config = typeof getOpsAlertsConfig === 'function'
            ? getOpsAlertsConfig()
            : null;
        if (!config) {
            return res.status(503).json({ ok: false, error: 'ops_alerts_unavailable' });
        }
        return res.json({
            ok: true,
            config
        });
    });

    app.put('/admin/system/alerts/config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        if (typeof normalizeOpsAlertsConfigInput !== 'function' || typeof setOpsAlertsConfig !== 'function') {
            return res.status(503).json({ ok: false, error: 'ops_alerts_unavailable' });
        }
        const current = typeof getOpsAlertsConfig === 'function' ? getOpsAlertsConfig() : {};
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        const normalized = normalizeOpsAlertsConfigInput(payload, current || {});
        const saved = setOpsAlertsConfig(normalized, user.username);
        logAdminAction('system.alerts.config.update', user.username, 'ops_alerts', {
            enabled: !!saved.enabled,
            destinations: Array.isArray(saved.whatsappDestinations) ? saved.whatsappDestinations.length : 0
        }, req.ip);
        return res.json({ ok: true, config: saved });
    });

    app.get('/admin/system/config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const config = getSystemConfig();
        const updatesManifestUrlResolved = resolveUpdatesManifestUrl(req, config);
        const maskedConfig = maskSystemConfig(config);
        if (isCommercialProfile) {
            maskedConfig.aiApiKey = '';
        }
        return res.json({
            ok: true,
            profile: appProfile,
            appVersion,
            config: maskedConfig,
            updatesManifestUrlResolved,
            aiKeyManagedByProvider: isCommercialProfile,
            hasPendingRestore: fs.existsSync(pendingRestoreDbFile),
            paths: {
                dataRoot: dataRootDir,
                dbFile,
                backupDir,
                updatesDir
            }
        });
    });

    app.get('/admin/users', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        return res.json({ ok: true, users: listPanelUsers() });
    });

    app.post('/admin/users', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const username = normalizeUsername(req.body?.username);
        const fullname = sanitizePublicText(req.body?.fullname || '', 80) || username;
        const role = normalizeRole(req.body?.role);
        const password = String(req.body?.password || '').trim();
        const active = req.body?.active === false ? 0 : 1;

        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'invalid_username' });
        }
        if (!isStrongPassword(password)) {
            return res.status(400).json({ error: 'weak_password' });
        }
        const existing = db.prepare('SELECT username FROM panel_users WHERE username=?').get(username);
        if (existing) {
            return res.status(409).json({ error: 'user_exists' });
        }

        const now = Date.now();
        db.prepare(`
            INSERT INTO panel_users (username, password, role, fullname, avatar, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', ?, ?, ?)
        `).run(username, hashPassword(password), role, fullname, active, now, now);

        logAdminAction('user.create.http', user.username, username, { role, active: !!active }, req.socket?.remoteAddress);
        return res.json({ ok: true, user: mapPanelUserRow({ username, fullname, role, avatar: '', active, created_at: now, updated_at: now }) });
    });

    app.put('/admin/users/:username', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const username = normalizeUsername(req.params.username);
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'invalid_username' });
        }

        const current = db.prepare(`
            SELECT username, fullname, role, avatar, COALESCE(active, 1) AS active, created_at, updated_at
            FROM panel_users
            WHERE username=?
        `).get(username);
        if (!current) {
            return res.status(404).json({ error: 'not_found' });
        }

        const nextFullname = req.body?.fullname === undefined
            ? String(current.fullname || '')
            : (sanitizePublicText(req.body?.fullname || '', 80) || String(current.fullname || ''));
        const nextRole = req.body?.role === undefined ? normalizeRole(current.role) : normalizeRole(req.body?.role);
        const nextActive = req.body?.active === undefined ? Number(current.active || 0) : (req.body?.active ? 1 : 0);

        const actorUsername = normalizeUsername(user.username);
        if (actorUsername === username && nextRole !== 'admin') {
            return res.status(400).json({ error: 'cannot_demote_self' });
        }
        if (actorUsername === username && nextActive !== 1) {
            return res.status(400).json({ error: 'cannot_disable_self' });
        }

        const isTargetActiveAdmin = normalizeRole(current.role) === 'admin' && Number(current.active || 0) === 1;
        const willStopBeingActiveAdmin = isTargetActiveAdmin && (nextRole !== 'admin' || nextActive !== 1);
        if (willStopBeingActiveAdmin && countOtherActiveAdmins(username) <= 0) {
            return res.status(400).json({ error: 'last_admin' });
        }

        const now = Date.now();
        db.prepare(`
            UPDATE panel_users
            SET fullname=?, role=?, active=?, updated_at=?
            WHERE username=?
        `).run(nextFullname, nextRole, nextActive, now, username);

        if (nextActive !== 1) {
            revokeUserSessions(username);
        }

        logAdminAction('user.update.http', user.username, username, {
            role: nextRole,
            active: !!nextActive,
            fullname: nextFullname
        }, req.socket?.remoteAddress);

        const updated = db.prepare(`
            SELECT username, fullname, role, avatar, COALESCE(active, 1) AS active, created_at, updated_at
            FROM panel_users
            WHERE username=?
        `).get(username);
        return res.json({ ok: true, user: mapPanelUserRow(updated) });
    });

    app.post('/admin/users/:username/password', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const username = normalizeUsername(req.params.username);
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'invalid_username' });
        }
        const nextPassword = String(req.body?.password || '').trim();
        if (!isStrongPassword(nextPassword)) {
            return res.status(400).json({ error: 'weak_password' });
        }

        const row = db.prepare('SELECT username FROM panel_users WHERE username=?').get(username);
        if (!row) {
            return res.status(404).json({ error: 'not_found' });
        }

        db.prepare('UPDATE panel_users SET password=?, updated_at=? WHERE username=?')
            .run(hashPassword(nextPassword), Date.now(), username);
        revokeUserSessions(username);
        logAdminAction('user.reset_password.http', user.username, username, {}, req.socket?.remoteAddress);
        return res.json({ ok: true });
    });

    app.delete('/admin/users/:username', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const username = normalizeUsername(req.params.username);
        if (!USERNAME_RE.test(username)) {
            return res.status(400).json({ error: 'invalid_username' });
        }

        const current = db.prepare(`
            SELECT username, role, COALESCE(active, 1) AS active
            FROM panel_users
            WHERE username=?
        `).get(username);
        if (!current) {
            return res.status(404).json({ error: 'not_found' });
        }

        const actorUsername = normalizeUsername(user.username);
        if (actorUsername === username) {
            return res.status(400).json({ error: 'cannot_disable_self' });
        }
        if (normalizeRole(current.role) === 'admin' && Number(current.active || 0) === 1 && countOtherActiveAdmins(username) <= 0) {
            return res.status(400).json({ error: 'last_admin' });
        }

        db.prepare('UPDATE panel_users SET active=0, updated_at=? WHERE username=?')
            .run(Date.now(), username);
        revokeUserSessions(username);
        logAdminAction('user.disable.http', user.username, username, {}, req.socket?.remoteAddress);
        return res.json({ ok: true });
    });

    app.put('/admin/system/config', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const current = getSystemConfig();
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        payload.updatesManifestUrl = current.updatesManifestUrl || '';
        const keepSecret = (field) => {
            if (payload[field] === '********') payload[field] = current[field] || '';
        };
        keepSecret('aiApiKey');
        keepSecret('updatesToken');
        if (isCommercialProfile) {
            payload.aiApiKey = current.aiApiKey || '';
        }
        const normalized = normalizeSystemConfigInput(payload, current);
        const saved = setSystemConfig(normalized, { updatedBy: user.username });
        logAdminAction('system.config.update', user.username, 'app_config', {
            onboardingCompleted: saved.onboardingCompleted,
            updatesEnabled: saved.updatesEnabled,
            updatesChannel: saved.updatesChannel
        }, req.ip);
        return res.json({
            ok: true,
            config: maskSystemConfig(saved),
            updatesManifestUrlResolved: resolveUpdatesManifestUrl(req, saved)
        });
    });

    app.post('/admin/system/onboarding/complete', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const payload = req.body && typeof req.body === 'object' ? req.body : {};
        const current = getSystemConfig();
        const adminUsername = sanitizePublicText(payload.adminUsername || '', 60).toLowerCase();
        const adminPassword = String(payload.adminPassword || '').trim();
        if (adminUsername && adminPassword) {
            if (adminUsername.length < 3) return res.status(400).json({ error: 'invalid_admin_username' });
            if (adminPassword.length < 8) return res.status(400).json({ error: 'weak_admin_password' });
            const existing = db.prepare('SELECT username FROM panel_users WHERE username=?').get(adminUsername);
            const hash = hashPassword(adminPassword);
            if (existing) {
                db.prepare('UPDATE panel_users SET password=?, role=?, fullname=? WHERE username=?')
                    .run(hash, 'admin', sanitizePublicText(payload.adminDisplayName || 'Administrador', 80), adminUsername);
            } else {
                db.prepare('INSERT INTO panel_users (username, password, role, fullname) VALUES (?, ?, ?, ?)')
                    .run(adminUsername, hash, 'admin', sanitizePublicText(payload.adminDisplayName || 'Administrador', 80));
            }
        }
        if (isCommercialProfile) {
            payload.aiApiKey = current.aiApiKey || '';
        }
        const normalized = normalizeSystemConfigInput({
            ...current,
            ...payload,
            onboardingCompleted: true
        }, current);
        const saved = setSystemConfig(normalized, { updatedBy: user.username });
        logAdminAction('system.onboarding.complete', user.username, 'app_config', { onboardingCompleted: true }, req.ip);
        return res.json({
            ok: true,
            config: maskSystemConfig(saved),
            updatesManifestUrlResolved: resolveUpdatesManifestUrl(req, saved)
        });
    });

    app.get('/admin/system/update/status', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const config = getSystemConfig();
        const state = getSystemUpdateState();
        const updatesManifestUrlResolved = resolveUpdatesManifestUrl(req, config);
        return res.json({
            ok: true,
            profile: appProfile,
            appVersion,
            updatesEnabled: !!config.updatesEnabled,
            updatesManifestUrl: updatesManifestUrlResolved,
            updatesManifestUrlResolved,
            channel: config.updatesChannel || 'stable',
            state
        });
    });

    app.post('/admin/system/update/check', async (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        try {
            const result = await checkForSystemUpdate(resolveUpdatesManifestUrl(req));
            const nextState = setSystemUpdateState({
                lastCheckAt: Date.now(),
                lastCheckError: '',
                lastManifest: result.manifest || null
            }, user.username);
            return res.json({ ok: true, ...result, state: nextState });
        } catch (error) {
            const msg = error?.message || 'update_check_failed';
            const nextState = setSystemUpdateState({
                lastCheckAt: Date.now(),
                lastCheckError: msg
            }, user.username);
            return res.status(400).json({ error: msg, state: nextState });
        }
    });

    app.post('/admin/system/update/apply', async (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const state = getSystemUpdateState();
        const manifest = state.lastManifest || null;
        if (!manifest?.url || !manifest?.version) {
            return res.status(400).json({ error: 'no_checked_manifest' });
        }
        try {
            const preBackup = createDatabaseBackup('pre_update');
            const ext = path.extname(new URL(manifest.url).pathname || '').toLowerCase() || '.zip';
            const fileName = `himefit_${manifest.version}${ext}`;
            const targetFile = path.join(updatesDir, fileName);
            await downloadFileOverHttp(manifest.url, targetFile, 30000);
            if (manifest.sha256) {
                const localSha = crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');
                if (localSha.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
                    throw new Error('sha256_mismatch');
                }
            }
            const nextState = setSystemUpdateState({
                pendingPackagePath: targetFile,
                pendingVersion: manifest.version,
                lastApplyAt: Date.now(),
                lastApplyError: ''
            }, user.username);
            logAdminAction('system.update.package_downloaded', user.username, 'update', {
                version: manifest.version,
                packagePath: targetFile
            }, req.ip);
            return res.json({
                ok: true,
                downloaded: true,
                applied: false,
                requiresRestart: false,
                preBackup,
                packagePath: targetFile,
                version: manifest.version,
                state: nextState
            });
        } catch (error) {
            const msg = error?.message || 'update_apply_failed';
            const nextState = setSystemUpdateState({
                lastApplyAt: Date.now(),
                lastApplyError: msg
            }, user.username);
            return res.status(400).json({ error: msg, state: nextState });
        }
    });

    app.post('/admin/system/backup/create', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        try {
            const file = createDatabaseBackup('manual');
            logAdminAction('system.backup.create', user.username, 'backup', { file }, req.ip);
            return res.json({ ok: true, file });
        } catch (error) {
            return res.status(500).json({ error: error?.message || 'backup_failed' });
        }
    });

    app.get('/admin/system/backup/list', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        try {
            ensureDir(backupDir);
            const files = fs.readdirSync(backupDir)
                .filter((name) => name.toLowerCase().endsWith('.db'))
                .map((name) => {
                    const full = path.join(backupDir, name);
                    const st = fs.statSync(full);
                    return {
                        name,
                        path: full,
                        size: Number(st.size || 0),
                        mtime: Number(st.mtimeMs || 0)
                    };
                })
                .sort((a, b) => b.mtime - a.mtime);
            return res.json({ ok: true, files });
        } catch (error) {
            return res.status(500).json({ error: error?.message || 'backup_list_failed' });
        }
    });

    app.post('/admin/system/backup/restore', (req, res) => {
        const user = requireAdmin(req, res); if (!user) return;
        const backupPath = String(req.body?.backupPath || '').trim();
        if (!backupPath) return res.status(400).json({ error: 'missing_backup_path' });
        try {
            const result = restoreDatabaseBackup(backupPath);
            logAdminAction('system.backup.restore_scheduled', user.username, 'backup', { backupPath }, req.ip);
            return res.json({ ok: true, ...result });
        } catch (error) {
            return res.status(400).json({ error: error?.message || 'restore_failed' });
        }
    });
}

module.exports = { registerSystemAdminRoutes };
