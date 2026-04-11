const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVER_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..', '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist-desktop');
const UPDATES_DIR = process.env.HIMEFIT_DATA_ROOT
  ? path.join(process.env.HIMEFIT_DATA_ROOT, 'updates')
  : path.join(PROJECT_ROOT, 'runtime', 'updates');
const BASE_URL = String(process.env.HIMEFIT_UPDATE_BASE_URL || '').trim();
const PKG = require(path.join(PROJECT_ROOT, 'package.json'));
const VERSION = String(PKG.version || '0.0.0');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function fileSha256(file) {
  const data = fs.readFileSync(file);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`dist-desktop nao encontrado: ${DIST_DIR}`);
  }
  const installers = fs.readdirSync(DIST_DIR)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => {
      const full = path.join(DIST_DIR, name);
      const st = fs.statSync(full);
      return { name, full, mtime: Number(st.mtimeMs || 0) };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (!installers.length) {
    throw new Error('nenhum instalador .exe encontrado em dist-desktop');
  }

  ensureDir(UPDATES_DIR);
  const latest = installers[0];
  const releaseFileName = `himefit-${VERSION}.exe`;
  const releaseTarget = path.join(UPDATES_DIR, releaseFileName);
  fs.copyFileSync(latest.full, releaseTarget);

  const sha256 = fileSha256(releaseTarget);
  const packageUrl = BASE_URL
    ? `${BASE_URL.replace(/\/+$/, '')}/${releaseFileName}`
    : releaseFileName;
  const manifest = {
    version: VERSION,
    url: packageUrl,
    sha256,
    notes: `Release ${VERSION}`
  };
  const manifestFile = path.join(UPDATES_DIR, 'manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('[publish-desktop-release] pronto');
  console.log(`  Installer: ${releaseTarget}`);
  console.log(`  Manifest:  ${manifestFile}`);
  console.log(`  URL:       ${packageUrl}`);
  console.log(`  SHA256:    ${sha256}`);
}

main();
