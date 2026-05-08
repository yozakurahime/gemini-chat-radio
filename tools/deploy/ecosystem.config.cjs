const APP_DIR = process.env.APP_DIR || "/opt/himefit";

function pickOptionalEnv(keys) {
  const out = {};
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

function makeApp(name, env) {
  const optionalRuntimeEnv = pickOptionalEnv([
    "SCA_SYNC_ENABLED",
    "SCA_SYNC_TOKEN",
    "ASAAS_ENV",
    "ASAAS_API_KEY",
    "ASAAS_WEBHOOK_TOKEN",
    "ASAAS_BASE_URL",
    "PIX_EXPIRES_HOURS",
  ]);

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
      ...optionalRuntimeEnv,
      ...env,
    },
  };
}

module.exports = {
  apps: [
    makeApp("himefit-server", {}),
  ],
};
