#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/himefit}"
SERVER_TIMEZONE="${SERVER_TIMEZONE:-America/Sao_Paulo}"
RUN_TESTS_ON_SERVER="${RUN_TESTS_ON_SERVER:-0}"
NPM_TIMEOUT_SEC="${NPM_TIMEOUT_SEC:-1200}"

install_deps() {
  local prefix="$1"
  if [ -z "$prefix" ]; then
    if timeout "${NPM_TIMEOUT_SEC}" npm ci --no-audit --no-fund; then
      return 0
    fi
    echo "[deploy] npm ci failed at root, falling back to npm install..."
    timeout "${NPM_TIMEOUT_SEC}" npm install --no-audit --no-fund
    return 0
  fi

  if timeout "${NPM_TIMEOUT_SEC}" npm --prefix "$prefix" ci --no-audit --no-fund; then
    return 0
  fi
  echo "[deploy] npm ci failed for $prefix, falling back to npm install..."
  timeout "${NPM_TIMEOUT_SEC}" npm --prefix "$prefix" install --no-audit --no-fund
}

configure_timezone() {
  local tz="$1"
  echo "[deploy] Enforcing server timezone ${tz}..."
  if command -v timedatectl >/dev/null 2>&1; then
    sudo timedatectl set-timezone "$tz" || true
    timedatectl | grep "Time zone" || true
    return 0
  fi

  if [ -f "/usr/share/zoneinfo/${tz}" ]; then
    sudo ln -sf "/usr/share/zoneinfo/${tz}" /etc/localtime || true
    echo "$tz" | sudo tee /etc/timezone >/dev/null || true
  fi
}

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[deploy] Repository not found at ${APP_DIR}. Run install-server.sh first."
  exit 1
fi

cd "${APP_DIR}"
configure_timezone "$SERVER_TIMEZONE"

echo "[deploy] Updating code from origin/${BRANCH}..."
PREV_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
git fetch --all --prune
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"
NEXT_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"

should_install_deps=0
if [ ! -d node_modules ] || [ ! -d apps/panel-v2/node_modules ] || [ ! -d apps/landing/node_modules ] || [ ! -d apps/server/node_modules ]; then
  should_install_deps=1
fi

if [ "$should_install_deps" = "0" ] && [ -n "$PREV_HEAD" ] && [ -n "$NEXT_HEAD" ] && [ "$PREV_HEAD" != "$NEXT_HEAD" ]; then
  if git diff --name-only "$PREV_HEAD" "$NEXT_HEAD" -- package-lock.json apps/panel-v2/package-lock.json apps/landing/package-lock.json apps/server/package-lock.json | grep -q .; then
    should_install_deps=1
  fi
fi

if [ "$should_install_deps" = "1" ]; then
  echo "[deploy] Installing dependencies..."
  install_deps ""
  install_deps "apps/panel-v2"
  install_deps "apps/landing"
  install_deps "apps/server"
else
  echo "[deploy] Skipping dependency install (lockfiles unchanged and node_modules already present)."
fi

if [ "${RUN_TESTS_ON_SERVER}" = "1" ]; then
  echo "[deploy] Running tests on server (RUN_TESTS_ON_SERVER=1)..."
  npm --prefix apps/panel-v2 run test
  node --test apps/server/tests/security.test.js apps/server/tests/admin_flows.test.js
else
  echo "[deploy] Skipping tests on server (already validated in CI)."
fi

echo "[deploy] Building frontend apps..."
npm --prefix apps/panel-v2 run build
npm --prefix apps/landing run build

echo "[deploy] Reloading PM2 process..."
pm2 startOrReload tools/deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] Update complete."
