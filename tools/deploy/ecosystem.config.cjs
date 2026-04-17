module.exports = {
  apps: [
    {
      name: "himefit-server",
      script: "apps/server/index.js",
      cwd: "/opt/himefit",
      interpreter: "node",
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        HIMEFIT_DISABLE_WHATSAPP: "0",
      },
    },
  ],
};
