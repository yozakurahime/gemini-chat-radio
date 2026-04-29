const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveAppPaths } = require('../app_paths');

test('resolveAppPaths keeps legacy owner layout without tenant slug', () => {
  const rootDir = path.resolve('/opt/himefit/apps/server');
  const paths = resolveAppPaths(rootDir, {
    HIMEFIT_PROFILE: 'owner',
    ProgramData: '/programdata'
  }, 'linux');

  assert.equal(paths.IS_TENANT_MODE, false);
  assert.equal(paths.TENANT_SLUG, '');
  assert.equal(paths.PANEL_SESSION_COOKIE, 'panel_session');
  assert.equal(paths.DATA_ROOT_DIR, path.join(rootDir, '.programdata', 'Himefit-owner'));
  assert.equal(paths.DB_FILE, path.join(paths.DATA_ROOT_DIR, 'data', 'himefit.db'));
  assert.equal(paths.AUTH_SESSION_DIR, path.join(paths.DATA_ROOT_DIR, 'storage', 'himefit_auth_session'));
  assert.equal(paths.BASE_CONTEXT_FILE, path.join(paths.DATA_ROOT_DIR, 'data', 'contexto_academia.txt'));
});

test('resolveAppPaths creates isolated tenant layout when tenant slug is set', () => {
  const rootDir = path.resolve('/opt/himefit/apps/server');
  const tenantsRoot = path.resolve('/opt/himefit/runtime/tenants');
  const paths = resolveAppPaths(rootDir, {
    HIMEFIT_TENANT_SLUG: 'Academia Oxigenio',
    HIMEFIT_TENANT_NAME: 'Academia Oxigenio',
    HIMEFIT_TENANTS_ROOT: tenantsRoot
  }, 'linux');

  assert.equal(paths.IS_TENANT_MODE, true);
  assert.equal(paths.TENANT_SLUG, 'academia-oxigenio');
  assert.equal(paths.TENANT_NAME, 'Academia Oxigenio');
  assert.equal(paths.PANEL_SESSION_COOKIE, 'panel_session_academia_oxigenio');
  assert.equal(paths.DATA_ROOT_DIR, path.join(tenantsRoot, 'academia-oxigenio'));
  assert.equal(paths.DB_FILE, path.join(paths.DATA_ROOT_DIR, 'data', 'himefit.db'));
  assert.equal(paths.AUTH_SESSION_DIR, path.join(paths.DATA_ROOT_DIR, 'auth', 'session'));
  assert.equal(paths.BASE_CONTEXT_FILE, path.join(paths.DATA_ROOT_DIR, 'knowledge', 'base_context.md'));
  assert.equal(paths.CHAT_MEDIA_DIR, path.join(paths.DATA_ROOT_DIR, 'storage', 'chat_media_private'));
});

test('resolveAppPaths allows explicit data root for zero-risk first tenant migration', () => {
  const rootDir = path.resolve('/opt/himefit/apps/server');
  const dataRoot = path.resolve('/opt/himefit/runtime');
  const paths = resolveAppPaths(rootDir, {
    HIMEFIT_TENANT_SLUG: 'academia-oxigenio',
    HIMEFIT_DATA_ROOT: dataRoot
  }, 'linux');

  assert.equal(paths.IS_TENANT_MODE, true);
  assert.equal(paths.DATA_ROOT_DIR, dataRoot);
  assert.equal(paths.DB_FILE, path.join(dataRoot, 'data', 'himefit.db'));
  assert.equal(paths.AUTH_SESSION_DIR, path.join(dataRoot, 'auth', 'session'));
});
