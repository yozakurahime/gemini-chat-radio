#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/himefit}"

install_deps() {
  local prefix="$1"
  if [ -z "$prefix" ]; then
    if npm ci; then
      return 0
    fi
    echo "[deploy] npm ci failed at root, falling back to npm install..."
    npm install --no-audit --no-fund
    return 0
  fi

  if npm --prefix "$prefix" ci; then
    return 0
  fi
  echo "[deploy] npm ci failed for $prefix, falling back to npm install..."
  npm --prefix "$prefix" install --no-audit --no-fund
}

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
install_deps ""
install_deps "apps/panel-v2"
install_deps "apps/landing"
install_deps "apps/server"

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
