#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = '1';
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 64);
}

function envQuote(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const args = parseArgs(process.argv.slice(2));
const slug = normalizeSlug(args.slug || args.tenant || process.env.HIMEFIT_TENANT_SLUG);
if (!slug) {
  console.error('Uso: node tools/tenants/create-tenant.cjs --slug academia-exemplo --name "Academia Exemplo" --port 3101 --base-url https://academia-exemplo.seudominio.com');
  process.exit(1);
}

const appDir = path.resolve(args.appDir || args['app-dir'] || process.env.HIMEFIT_APP_DIR || '/opt/himefit');
const tenantsRoot = path.resolve(args.tenantsRoot || args['tenants-root'] || process.env.HIMEFIT_TENANTS_ROOT || path.join(appDir, 'runtime', 'tenants'));
const dataRoot = path.resolve(args.dataRoot || args['data-root'] || path.join(tenantsRoot, slug));
const tenantName = String(args.name || process.env.HIMEFIT_TENANT_NAME || slug).trim();
const port = Number(args.port || process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Porta invalida: ${args.port || process.env.PORT}`);
  process.exit(1);
}

const adminUser = String(args.adminUser || args['admin-user'] || process.env.PAINEL_USER || 'admin').trim();
const adminPass = String(args.adminPass || args['admin-pass'] || process.env.PAINEL_PASS || crypto.randomBytes(12).toString('base64url')).trim();
const baseUrl = String(args.baseUrl || args['base-url'] || process.env.APP_PANEL_BASE_URL || `https://${slug}.seudominio.com`).trim();
const envFile = path.join(dataRoot, 'tenant.env');

[
  dataRoot,
  path.join(dataRoot, 'data'),
  path.join(dataRoot, 'storage'),
  path.join(dataRoot, 'storage', 'logs'),
  path.join(dataRoot, 'storage', 'ads_mp3'),
  path.join(dataRoot, 'storage', 'chat_media_private'),
  path.join(dataRoot, 'storage', 'radio_cache'),
  path.join(dataRoot, 'backups'),
  path.join(dataRoot, 'updates'),
  path.join(dataRoot, 'knowledge'),
  path.join(dataRoot, 'auth', 'session'),
].forEach(ensureDir);

const templateContext = path.join(appDir, 'apps', 'server', 'contexto_academia.txt');
const tenantContext = path.join(dataRoot, 'knowledge', 'base_context.md');
if (!fs.existsSync(tenantContext) && fs.existsSync(templateContext)) {
  fs.copyFileSync(templateContext, tenantContext);
}

if (fs.existsSync(envFile) && args.force !== '1') {
  console.error(`tenant.env ja existe: ${envFile}`);
  console.error('Use --force para sobrescrever somente o arquivo de env.');
  process.exit(1);
}

const envLines = [
  '# HimeFit tenant instance',
  `NODE_ENV=${envQuote('production')}`,
  `TZ=${envQuote('America/Sao_Paulo')}`,
  `HIMEFIT_TZ=${envQuote('America/Sao_Paulo')}`,
  `HIMEFIT_PROFILE=${envQuote('owner')}`,
  `HIMEFIT_TENANT_SLUG=${envQuote(slug)}`,
  `HIMEFIT_TENANT_NAME=${envQuote(tenantName)}`,
  `HIMEFIT_DATA_ROOT=${envQuote(dataRoot)}`,
  `PORT=${port}`,
  `APP_PANEL_BASE_URL=${envQuote(baseUrl)}`,
  `PANEL_V2=1`,
  `HIMEFIT_DISABLE_WHATSAPP=${envQuote(args.disableWhatsapp || '0')}`,
  `ATTENDANCE_ENABLED=${envQuote(args.attendanceEnabled || '1')}`,
  `PAINEL_USER=${envQuote(adminUser)}`,
  `PAINEL_PASS=${envQuote(adminPass)}`,
  '',
];

fs.writeFileSync(envFile, envLines.join('\n'), 'utf8');

console.log(JSON.stringify({
  ok: true,
  slug,
  tenantName,
  port,
  dataRoot,
  envFile,
  baseUrl,
  adminUser,
  adminPass
}, null, 2));
