#!/usr/bin/env node
const path = require('path');
const Database = require('better-sqlite3');
const { resolveAppPaths } = require('../app_paths');
const { createPanelAuth } = require('../panel_auth');

function fail(message) {
  console.error(`[reset-panel-password] ${message}`);
  process.exit(1);
}

const username = String(process.env.PANEL_RESET_USER || process.env.PAINEL_USER || 'admin').trim().toLowerCase();
const password = String(process.env.PANEL_RESET_PASS || '').trim();
const role = String(process.env.PANEL_RESET_ROLE || 'admin').trim().toLowerCase() === 'user' ? 'user' : 'admin';
const fullname = String(process.env.PANEL_RESET_FULLNAME || (role === 'admin' ? 'Administrador' : 'Atendente')).trim();

if (!username) fail('PANEL_RESET_USER vazio.');
if (!password || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
  fail('PANEL_RESET_PASS precisa ter pelo menos 8 caracteres, letras e numeros.');
}

const rootDir = path.resolve(__dirname, '..');
const appPaths = resolveAppPaths(rootDir, process.env, process.platform);
require('fs').mkdirSync(path.dirname(appPaths.DB_FILE), { recursive: true });
const db = new Database(appPaths.DB_FILE);
const { hashPassword } = createPanelAuth({ db, sessionCookie: appPaths.PANEL_SESSION_COOKIE });
const now = Date.now();

db.prepare(`CREATE TABLE IF NOT EXISTS panel_users (
  username TEXT PRIMARY KEY,
  password TEXT,
  role TEXT DEFAULT 'user',
  fullname TEXT DEFAULT 'Atendente',
  avatar TEXT DEFAULT ''
)`).run();
try { db.prepare('ALTER TABLE panel_users ADD COLUMN active INTEGER DEFAULT 1').run(); } catch (_) {}
try { db.prepare('ALTER TABLE panel_users ADD COLUMN created_at INTEGER').run(); } catch (_) {}
try { db.prepare('ALTER TABLE panel_users ADD COLUMN updated_at INTEGER').run(); } catch (_) {}
db.prepare(`CREATE TABLE IF NOT EXISTS panel_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT,
  role TEXT,
  created_at INTEGER,
  expires_at INTEGER
)`).run();

const hashed = hashPassword(password);
const existing = db.prepare('SELECT username FROM panel_users WHERE username=?').get(username);
if (existing) {
  db.prepare(`
    UPDATE panel_users
    SET password=?, role=?, fullname=COALESCE(NULLIF(fullname, ''), ?), active=1, updated_at=?
    WHERE username=?
  `).run(hashed, role, fullname, now, username);
} else {
  db.prepare(`
    INSERT INTO panel_users (username, password, role, fullname, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).run(username, hashed, role, fullname, now, now);
}
db.prepare('DELETE FROM panel_sessions WHERE username=?').run(username);

console.log(JSON.stringify({
  ok: true,
  username,
  role,
  tenantSlug: appPaths.TENANT_SLUG,
  tenantMode: appPaths.IS_TENANT_MODE,
  dbFile: appPaths.DB_FILE,
  sessionsCleared: true
}, null, 2));
