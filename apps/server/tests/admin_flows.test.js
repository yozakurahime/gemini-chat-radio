const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeTempDataRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'himefit-admin-'));
}

function randomPort() {
  return 4600 + Math.floor(Math.random() * 1200);
}

async function waitForHealth(baseUrl, timeoutMs = 25000) {
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

async function startServer({
  dataRoot,
  port,
  panelUser = 'admin',
  panelPass = 'Admin#12345',
  extraEnv = {},
}) {
  const env = {
    ...process.env,
    PORT: String(port),
    HIMEFIT_DISABLE_WHATSAPP: '1',
    HIMEFIT_DATA_ROOT: dataRoot,
    HIMEFIT_PROFILE: 'owner',
    HIMEFIT_SKIP_RUNTIME_MIGRATION: '1',
    HIMEFIT_SKIP_LEGACY_USER_IMPORT: '1',
    ATTENDANCE_ENABLED: '1',
    PAINEL_USER: panelUser,
    PAINEL_PASS: panelPass,
    ...extraEnv,
  };
  const child = spawn(process.execPath, ['index.js'], {
    cwd: ROOT_DIR,
    env,
    stdio: 'ignore',
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl);
  return { child, baseUrl, dataRoot, port, panelUser, panelPass };
}

async function stopServer(server) {
  if (!server?.child) return;
  const child = server.child;
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(5000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      wait(2000),
    ]);
  }
}

async function reqJson(baseUrl, pathname, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (cookie) finalHeaders.cookie = cookie;
  if (body !== undefined && finalHeaders['Content-Type'] === undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = { raw: text };
  }
  return { res, data };
}

async function login(baseUrl, user, pass) {
  const { res, data } = await reqJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { user, pass },
  });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, data, cookie };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

test('admin endpoints: attendance cadastro flow works end-to-end', async (t) => {
  const server = await startServer({
    dataRoot: makeTempDataRoot(),
    port: randomPort(),
  });
  t.after(async () => {
    await stopServer(server);
    fs.rmSync(server.dataRoot, { recursive: true, force: true });
  });

  const auth = await login(server.baseUrl, server.panelUser, server.panelPass);
  assert.equal(auth.res.status, 200);
  assert.ok(auth.cookie.startsWith('panel_session='));

  const statusResp = await reqJson(server.baseUrl, '/admin/attendance/status', {
    cookie: auth.cookie,
  });
  assert.equal(statusResp.res.status, 200);
  assert.equal(statusResp.data.enabled, true);

  const className = `QA Classe ${Date.now()}`;
  const createCatalog = await reqJson(server.baseUrl, '/admin/attendance/catalog', {
    method: 'POST',
    cookie: auth.cookie,
    body: { type: 'class', name: className, defaultValue: 23, sortOrder: 991 },
  });
  assert.equal(createCatalog.res.status, 200);
  assert.equal(createCatalog.data.ok, true);
  const classActivityId = Number(createCatalog.data.item?.id || 0);
  assert.ok(classActivityId > 0);

  const updateCatalog = await reqJson(server.baseUrl, `/admin/attendance/catalog/${classActivityId}`, {
    method: 'PUT',
    cookie: auth.cookie,
    body: { defaultValue: 27, sortOrder: 992, active: true },
  });
  assert.equal(updateCatalog.res.status, 200);
  assert.equal(updateCatalog.data.ok, true);
  assert.equal(Number(updateCatalog.data.item?.default_value), 27);

  const functionsCatalog = await reqJson(server.baseUrl, '/admin/attendance/catalog?type=function&active=1', {
    cookie: auth.cookie,
  });
  assert.equal(functionsCatalog.res.status, 200);
  const functionItems = Array.isArray(functionsCatalog.data.items) ? functionsCatalog.data.items : [];
  assert.ok(functionItems.length > 0);
  const professorRole =
    functionItems.find((item) => normalizeText(item?.name).includes('prof')) || functionItems[0];
  assert.ok(Number(professorRole?.id || 0) > 0);

  const createTemplate = await reqJson(server.baseUrl, '/admin/attendance/templates', {
    method: 'POST',
    cookie: auth.cookie,
    body: {
      activityId: classActivityId,
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
    },
  });
  assert.equal(createTemplate.res.status, 200);
  assert.equal(createTemplate.data.ok, true);
  const templateId = Number(createTemplate.data.item?.id || 0);
  assert.ok(templateId > 0);

  const createEmployee = await reqJson(server.baseUrl, '/admin/attendance/employees', {
    method: 'POST',
    cookie: auth.cookie,
    body: {
      name: `Professor QA ${Date.now()}`,
      roleActivityId: Number(professorRole.id),
      phone: `55119${Math.floor(1000000 + Math.random() * 8999999)}`,
      notes: 'Funcionario criado automaticamente no teste',
    },
  });
  assert.equal(createEmployee.res.status, 200);
  assert.equal(createEmployee.data.ok, true);
  const employeeId = Number(createEmployee.data.id || 0);
  assert.ok(employeeId > 0);

  const applyTemplates = await reqJson(server.baseUrl, `/admin/attendance/employees/${employeeId}/templates/apply`, {
    method: 'POST',
    cookie: auth.cookie,
    body: { templateIds: [templateId], replace: true, toleranceMin: 5 },
  });
  assert.equal(applyTemplates.res.status, 200);
  assert.equal(applyTemplates.data.ok, true);

  const createSchedule = await reqJson(server.baseUrl, '/admin/attendance/schedules', {
    method: 'POST',
    cookie: auth.cookie,
    body: {
      employeeId,
      weekday: 3,
      startTime: '12:00',
      endTime: '13:00',
      scheduleType: 'class',
      activityId: classActivityId,
      valuePerClass: 30,
      toleranceMin: 5,
    },
  });
  assert.equal(createSchedule.res.status, 200);
  assert.equal(createSchedule.data.ok, true);
  const scheduleId = Number(createSchedule.data.id || 0);
  assert.ok(scheduleId > 0);

  const updateSchedule = await reqJson(server.baseUrl, `/admin/attendance/schedules/${scheduleId}`, {
    method: 'PUT',
    cookie: auth.cookie,
    body: {
      startTime: '12:30',
      endTime: '13:30',
      active: true,
    },
  });
  assert.equal(updateSchedule.res.status, 200);
  assert.equal(updateSchedule.data.ok, true);

  const listSchedules = await reqJson(server.baseUrl, `/admin/attendance/schedules?employeeId=${employeeId}`, {
    cookie: auth.cookie,
  });
  assert.equal(listSchedules.res.status, 200);
  const schedules = Array.isArray(listSchedules.data.schedules) ? listSchedules.data.schedules : [];
  assert.ok(schedules.some((row) => Number(row.id) === scheduleId));

  const deleteSchedule = await reqJson(server.baseUrl, `/admin/attendance/schedules/${scheduleId}`, {
    method: 'DELETE',
    cookie: auth.cookie,
  });
  assert.equal(deleteSchedule.res.status, 200);
  assert.equal(deleteSchedule.data.ok, true);

  const deleteTemplate = await reqJson(server.baseUrl, `/admin/attendance/templates/${templateId}`, {
    method: 'DELETE',
    cookie: auth.cookie,
  });
  assert.equal(deleteTemplate.res.status, 200);
  assert.equal(deleteTemplate.data.ok, true);

  const deleteEmployee = await reqJson(server.baseUrl, `/admin/attendance/employees/${employeeId}`, {
    method: 'DELETE',
    cookie: auth.cookie,
  });
  assert.equal(deleteEmployee.res.status, 200);
  assert.equal(deleteEmployee.data.ok, true);

  const deleteCatalog = await reqJson(server.baseUrl, `/admin/attendance/catalog/${classActivityId}`, {
    method: 'DELETE',
    cookie: auth.cookie,
  });
  assert.equal(deleteCatalog.res.status, 200);
  assert.equal(deleteCatalog.data.ok, true);
});

test('knowledge admin endpoints persist base context updates', async (t) => {
  const server = await startServer({
    dataRoot: makeTempDataRoot(),
    port: randomPort(),
  });
  t.after(async () => {
    await stopServer(server);
    fs.rmSync(server.dataRoot, { recursive: true, force: true });
  });

  const auth = await login(server.baseUrl, server.panelUser, server.panelPass);
  assert.equal(auth.res.status, 200);

  const current = await reqJson(server.baseUrl, '/admin/knowledge/current', {
    cookie: auth.cookie,
  });
  assert.equal(current.res.status, 200);
  const currentBase = String(current.data.base_context || '');

  const marker = `QA_NATACAO_ADULTO_${Date.now()}`;
  const fallbackBase = [
    '# CONTEXTO BASE QA',
    '- Academia Oxigênio',
    '- Natação Adulto: Seg/Qua 20:00',
  ].join('\n');
  const nextBase = `${currentBase.trim() || fallbackBase}\n\n## QA CHECK\n- ${marker}\n- Natação Adulto confirmada.`;

  const save = await reqJson(server.baseUrl, '/admin/knowledge/base/save', {
    method: 'POST',
    cookie: auth.cookie,
    body: { base_context: nextBase },
  });
  assert.equal(save.res.status, 200);
  assert.equal(save.data.success, true);

  const currentAfter = await reqJson(server.baseUrl, '/admin/knowledge/current', {
    cookie: auth.cookie,
  });
  assert.equal(currentAfter.res.status, 200);
  assert.ok(String(currentAfter.data.base_context || '').includes(marker));
  assert.ok(Number(currentAfter.data.ai_context?.contexto_length || 0) > 0);

  const versions = await reqJson(server.baseUrl, '/admin/knowledge/versions', {
    cookie: auth.cookie,
  });
  assert.equal(versions.res.status, 200);
  assert.ok(Array.isArray(versions.data.versions));
});

test('SCA sync endpoint enforces token and keeps idempotency', async (t) => {
  const token = 'SCA_TOKEN_QA_123';
  const server = await startServer({
    dataRoot: makeTempDataRoot(),
    port: randomPort(),
    extraEnv: {
      SCA_SYNC_ENABLED: '1',
      SCA_SYNC_TOKEN: token,
    },
  });
  t.after(async () => {
    await stopServer(server);
    fs.rmSync(server.dataRoot, { recursive: true, force: true });
  });

  const auth = await login(server.baseUrl, server.panelUser, server.panelPass);
  assert.equal(auth.res.status, 200);

  const withoutToken = await reqJson(server.baseUrl, '/admin/sca/sync/batch', {
    method: 'POST',
    body: { source: 'sca_db', events: [] },
  });
  assert.equal(withoutToken.res.status, 401);

  const invalidPayload = await reqJson(server.baseUrl, '/admin/sca/sync/batch', {
    method: 'POST',
    headers: { 'x-sca-token': token },
    body: { source: 'sca_db', events: [] },
  });
  assert.equal(invalidPayload.res.status, 400);

  const now = Date.now();
  const sourceEventId = `evt-${now}`;
  const payload = {
    source: 'sca_db',
    events: [{
      source_event_id: sourceEventId,
      external_id: `ext-${now}`,
      name: 'Aluno QA',
      phone: '62999991111',
      event_type: 'entry',
      event_at: now,
      status: 'ativo',
      plan: 'mensal',
      gate: 'catraca-1',
    }],
  };

  const firstSync = await reqJson(server.baseUrl, '/admin/sca/sync/batch', {
    method: 'POST',
    headers: { 'x-sca-token': token },
    body: payload,
  });
  assert.equal(firstSync.res.status, 200);
  assert.equal(firstSync.data.ok, true);
  assert.ok(Number(firstSync.data.inserted_count || 0) >= 1);

  const secondSync = await reqJson(server.baseUrl, '/admin/sca/sync/batch', {
    method: 'POST',
    headers: { 'x-sca-token': token },
    body: payload,
  });
  assert.equal(secondSync.res.status, 200);
  assert.equal(secondSync.data.ok, true);
  assert.ok(Number(secondSync.data.duplicated_count || 0) >= 1);

  const status = await reqJson(server.baseUrl, '/admin/sca/sync/status', {
    cookie: auth.cookie,
  });
  assert.equal(status.res.status, 200);
  assert.equal(status.data.ok, true);
  assert.equal(status.data.enabled, true);
  assert.equal(status.data.tokenConfigured, true);
  assert.ok(Number(status.data.events?.total || 0) >= 1);
});
