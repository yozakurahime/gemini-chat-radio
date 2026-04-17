#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/himefit}"

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[deploy] Repository not found at ${APP_DIR}. Run install-server.sh first."
  exit 1
fi

cd "${APP_DIR}"

echo "[deploy] Updating code from origin/${BRANCH}..."
git fetch --all --prune
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "[deploy] Installing dependencies..."
npm ci
npm --prefix apps/panel-v2 ci
npm --prefix apps/landing ci
npm --prefix apps/server ci

echo "[deploy] Running tests..."
npm --prefix apps/panel-v2 run test
node --test apps/server/tests/security.test.js apps/server/tests/admin_flows.test.js

echo "[deploy] Building frontend apps..."
npm --prefix apps/panel-v2 run build
npm --prefix apps/landing run build

echo "[deploy] Reloading PM2 process..."
pm2 startOrReload tools/deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] Update complete."
