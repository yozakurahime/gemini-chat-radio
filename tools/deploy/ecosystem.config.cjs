const APP_DIR = process.env.APP_DIR || "/opt/himefit";

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

module.exports = {
  apps: [
    makeApp("himefit-server", {}),
  ],
};
