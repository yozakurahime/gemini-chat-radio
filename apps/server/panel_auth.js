const crypto = require('crypto');

function createPanelAuth({
    db,
    sessionCookie = 'panel_session',
    sessionTtlMs = 1000 * 60 * 60 * 24 * 7,
    loginWindowMs = 5 * 60 * 1000,
    loginMaxAttempts = 5
}) {
    const loginAttempts = new Map();

    function hashPassword(pass, salt) {
        const resolvedSalt = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(pass, resolvedSalt, 64).toString('hex');
        return `scrypt$${resolvedSalt}$${hash}`;
    }

    function verifyPassword(pass, stored) {
        if (!stored) return false;
        if (stored.startsWith('scrypt$')) {
            const parts = stored.split('$');
            if (parts.length !== 3) return false;
            const salt = parts[1];
            const expected = parts[2];
            const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
            if (hash.length !== expected.length) return false;
            return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
        }
        return pass === stored;
    }

    function isStrongPassword(pass) {
        if (!pass || pass.length < 8) return false;
        if (!/[a-zA-Z]/.test(pass)) return false;
        if (!/[0-9]/.test(pass)) return false;
        return true;
    }

    function parseCookieHeader(header) {
        const out = {};
        if (!header) return out;
        header.split(';').forEach((part) => {
            const [key, ...rest] = part.trim().split('=');
            if (!key) return;
            out[key] = decodeURIComponent(rest.join('='));
        });
        return out;
    }

    function hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    function createSession(dbUser) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(token);
        const now = Date.now();
        const expiresAt = now + sessionTtlMs;
        db.prepare('INSERT INTO panel_sessions (token_hash, username, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
            .run(tokenHash, dbUser.username, dbUser.role, now, expiresAt);
        return { token, expiresAt };
    }

    function getSessionFromReq(req) {
        const cookies = parseCookieHeader(req.headers.cookie || '');
        const token = cookies[sessionCookie];
        if (!token) return null;
        const tokenHash = hashToken(token);
        const row = db.prepare('SELECT username, role, expires_at FROM panel_sessions WHERE token_hash=?').get(tokenHash);
        if (!row) return null;
        if (row.expires_at && row.expires_at < Date.now()) {
            db.prepare('DELETE FROM panel_sessions WHERE token_hash=?').run(tokenHash);
            return null;
        }
        const dbUser = db.prepare('SELECT username, role, fullname, avatar, COALESCE(active, 1) AS active FROM panel_users WHERE username=?').get(row.username);
        if (!dbUser || Number(dbUser.active || 0) === 0) {
            db.prepare('DELETE FROM panel_sessions WHERE token_hash=?').run(tokenHash);
            return null;
        }
        return dbUser || null;
    }

    function setSessionCookie(res, token, maxAgeMs, req) {
        const secure = req && (req.secure || req.headers['x-forwarded-proto'] === 'https');
        const parts = [
            `${sessionCookie}=${token}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.floor((maxAgeMs || sessionTtlMs) / 1000)}`
        ];
        if (secure) parts.push('Secure');
        res.setHeader('Set-Cookie', parts.join('; '));
    }

    function clearSessionCookie(res) {
        res.setHeader('Set-Cookie', `${sessionCookie}=; Path=/; Max-Age=0; SameSite=Lax`);
    }

    function rateLimitLogin(req) {
        const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
        const now = Date.now();
        const entry = loginAttempts.get(ip) || { count: 0, firstAt: now };
        if (now - entry.firstAt > loginWindowMs) {
            entry.count = 0;
            entry.firstAt = now;
        }
        entry.count += 1;
        loginAttempts.set(ip, entry);
        return entry.count > loginMaxAttempts;
    }

    return {
        SESSION_COOKIE: sessionCookie,
        SESSION_TTL_MS: sessionTtlMs,
        hashPassword,
        verifyPassword,
        isStrongPassword,
        parseCookieHeader,
        hashToken,
        createSession,
        getSessionFromReq,
        setSessionCookie,
        clearSessionCookie,
        rateLimitLogin
    };
}

module.exports = { createPanelAuth };
