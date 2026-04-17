const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');

const ROOT_DIR = path.resolve(__dirname, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashPassword(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pass, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function makeTempDataRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'himefit-sec-'));
}

function randomPort() {
  return 3400 + Math.floor(Math.random() * 1000);
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch (_) {}
    await wait(250);
  }
  throw new Error('server_health_timeout');
}

async function startServer({ dataRoot, port, panelUser = 'admin', panelPass = 'Admin#12345' }) {
  const env = {
    ...process.env,
    PORT: String(port),
    HIMEFIT_DISABLE_WHATSAPP: '1',
    HIMEFIT_DATA_ROOT: dataRoot,
    HIMEFIT_PROFILE: 'owner',
    HIMEFIT_SKIP_RUNTIME_MIGRATION: '1',
    HIMEFIT_SKIP_LEGACY_USER_IMPORT: '1',
    PAINEL_USER: panelUser,
    PAINEL_PASS: panelPass
  };
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT_DIR,
    env,
    stdio: 'ignore'
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);
  return { child, baseUrl, dataRoot, port };
}

async function stopServer(server) {
  if (!server?.child) return;
  const child = server.child;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5000)
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      wait(2000)
    ]);
  }
}

async function login(baseUrl, user, pass) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass }),
    signal: AbortSignal.timeout(5000)
  });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, cookie };
}

test('security hardening protects public and private routes', async (t) => {
  const server = await startServer({
    dataRoot: makeTempDataRoot(),
    port: randomPort()
  });
  t.after(async () => {
    await stopServer(server);
    fs.rmSync(server.dataRoot, { recursive: true, force: true });
  });

  {
    const res = await fetch(`${server.baseUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    assert.equal(res.status, 200);
  }

  {
    const res = await fetch(`${server.baseUrl}/media/index.js`, { signal: AbortSignal.timeout(5000) });
    assert.notEqual(res.status, 200);
  }

  {
    const res = await fetch(`${server.baseUrl}/media/usuarios.json`, { signal: AbortSignal.timeout(5000) });
    assert.notEqual(res.status, 200);
  }

  {
    const res = await fetch(`${server.baseUrl}/api/conversations/test/messages`, { signal: AbortSignal.timeout(5000) });
    assert.equal(res.status, 401);
  }

  {
    const res = await fetch(`${server.baseUrl}/api/playlist`, { signal: AbortSignal.timeout(5000) });
    assert.equal(res.status, 401);
  }

  {
    const res = await fetch(`${server.baseUrl}/api/upload-ad`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(res.status, 401);
  }

  const auth = await login(server.baseUrl, 'admin', 'Admin#12345');
  assert.equal(auth.res.status, 200);
  assert.ok(auth.cookie.startsWith('panel_session='));

  {
    const res = await fetch(`${server.baseUrl}/api/playlist`, {
      headers: { cookie: auth.cookie },
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(res.status, 200);
  }

  {
    const res = await fetch(`${server.baseUrl}/api/ads`, {
      headers: { cookie: auth.cookie },
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(res.status, 200);
  }

  {
    const res = await fetch(`${server.baseUrl}/api/delete-ad`, {
      method: 'POST',
      headers: {
        cookie: auth.cookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename: '..\\index.js' }),
      signal: AbortSignal.timeout(5000)
    });
    assert.equal(res.status, 400);
  }
});

test('admin password is not overwritten on restart', async (t) => {
  const dataRoot = makeTempDataRoot();
  const port = randomPort();

  let server = await startServer({ dataRoot, port, panelUser: 'admin', panelPass: 'Admin#12345' });
  await stopServer(server);

  const dbPath = path.join(dataRoot, 'data', 'himefit.db');
  const db = new Database(dbPath);
  db.prepare('UPDATE panel_users SET password=? WHERE username=?').run(hashPassword('Persist123!'), 'admin');
  db.close();

  server = await startServer({ dataRoot, port, panelUser: 'admin', panelPass: 'Admin#12345' });
  t.after(async () => {
    await stopServer(server);
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  const persistedLogin = await login(server.baseUrl, 'admin', 'Persist123!');
  assert.equal(persistedLogin.res.status, 200);

  const envLogin = await login(server.baseUrl, 'admin', 'Admin#12345');
  assert.equal(envLogin.res.status, 401);
});
