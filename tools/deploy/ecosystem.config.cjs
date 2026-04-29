const fs = require("fs");
const path = require("path");

const APP_DIR = process.env.APP_DIR || "/opt/himefit";
const TENANTS_ROOT = process.env.HIMEFIT_TENANTS_ROOT || path.join(APP_DIR, "runtime", "tenants");

function parseEnvFile(file) {
  const env = {};
  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return env;
}

function makeApp(name, env) {
  return {
    name,
    script: "apps/server/index.js",
    cwd: APP_DIR,
    interpreter: "node",
    autorestart: true,
    watch: false,
    max_memory_restart: "600M",
    env: {
      NODE_ENV: "production",
      HIMEFIT_DISABLE_WHATSAPP: "0",
      TZ: "America/Sao_Paulo",
      HIMEFIT_TZ: "America/Sao_Paulo",
      ...env,
    },
  };
}

function loadTenantApps() {
  if (!fs.existsSync(TENANTS_ROOT)) return [];
  return fs.readdirSync(TENANTS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const envFile = path.join(TENANTS_ROOT, entry.name, "tenant.env");
      if (!fs.existsSync(envFile)) return null;
      const env = parseEnvFile(envFile);
      const slug = env.HIMEFIT_TENANT_SLUG || entry.name;
      return makeApp(`himefit-${slug}`, env);
    })
    .filter(Boolean);
}

const tenantApps = loadTenantApps();

module.exports = {
  apps: tenantApps.length ? tenantApps : [
    makeApp("himefit-server", {}),
  ],
};
