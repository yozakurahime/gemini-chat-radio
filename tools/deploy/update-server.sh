#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/himefit}"
SERVER_TIMEZONE="${SERVER_TIMEZONE:-America/Sao_Paulo}"
RUN_TESTS_ON_SERVER="${RUN_TESTS_ON_SERVER:-0}"
NPM_TIMEOUT_SEC="${NPM_TIMEOUT_SEC:-1200}"
INSTALL_ROOT_DEPS="${INSTALL_ROOT_DEPS:-0}"

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

diff_has_changes() {
  if [ -z "${PREV_HEAD}" ] || [ -z "${NEXT_HEAD}" ] || [ "${PREV_HEAD}" = "${NEXT_HEAD}" ]; then
    return 1
  fi
  if git diff --quiet "${PREV_HEAD}" "${NEXT_HEAD}" -- "$@"; then
    return 1
  fi
  return 0
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
git checkout "${BRANCH}" || git checkout -B "${BRANCH}" "origin/${BRANCH}"
if ! git pull --ff-only origin "${BRANCH}"; then
  echo "[deploy] Fast-forward update failed; aligning local checkout with origin/${BRANCH}..."
  git reset --hard "origin/${BRANCH}"
fi
NEXT_HEAD="$(git rev-parse HEAD 2>/dev/null || true)"

should_install_root_deps=0
should_install_panel_deps=0
should_install_landing_deps=0
should_install_server_deps=0
should_build_panel=0
should_build_landing=0

if [ "${INSTALL_ROOT_DEPS}" = "1" ] && [ ! -d "node_modules" ]; then
  should_install_root_deps=1
fi

if [ ! -d "apps/panel-v2/node_modules" ]; then
  should_install_panel_deps=1
fi
if [ ! -d "apps/landing/node_modules" ]; then
  should_install_landing_deps=1
fi
if [ ! -d "apps/server/node_modules" ]; then
  should_install_server_deps=1
fi
if [ ! -d "apps/panel-v2/dist" ]; then
  should_build_panel=1
fi
if [ ! -d "apps/landing/dist" ]; then
  should_build_landing=1
fi

if [ -n "${PREV_HEAD}" ] && [ -n "${NEXT_HEAD}" ] && [ "${PREV_HEAD}" != "${NEXT_HEAD}" ]; then
  if [ "${INSTALL_ROOT_DEPS}" = "1" ] && diff_has_changes "package-lock.json"; then
    should_install_root_deps=1
  fi
  if diff_has_changes "apps/panel-v2/package.json" "apps/panel-v2/package-lock.json"; then
    should_install_panel_deps=1
  fi
  if diff_has_changes "apps/landing/package.json" "apps/landing/package-lock.json"; then
    should_install_landing_deps=1
  fi
  if diff_has_changes "apps/server/package.json" "apps/server/package-lock.json"; then
    should_install_server_deps=1
  fi

  if diff_has_changes "apps/panel-v2"; then
    should_build_panel=1
  fi
  if diff_has_changes "apps/landing"; then
    should_build_landing=1
  fi
fi

if [ "$should_install_root_deps" = "1" ]; then
  echo "[deploy] Installing root dependencies (INSTALL_ROOT_DEPS=1)..."
  install_deps ""
else
  echo "[deploy] Skipping root dependency install (INSTALL_ROOT_DEPS=${INSTALL_ROOT_DEPS})."
fi

if [ "$should_install_panel_deps" = "1" ]; then
  echo "[deploy] Installing panel dependencies..."
  install_deps "apps/panel-v2"
else
  echo "[deploy] Skipping panel dependency install."
fi

if [ "$should_install_landing_deps" = "1" ]; then
  echo "[deploy] Installing landing dependencies..."
  install_deps "apps/landing"
else
  echo "[deploy] Skipping landing dependency install."
fi

if [ "$should_install_server_deps" = "1" ]; then
  echo "[deploy] Installing server dependencies..."
  install_deps "apps/server"
else
  echo "[deploy] Skipping server dependency install."
fi

if [ "${RUN_TESTS_ON_SERVER}" = "1" ]; then
  echo "[deploy] Running tests on server (RUN_TESTS_ON_SERVER=1)..."
  npm --prefix apps/panel-v2 run test
  node --test apps/server/tests/security.test.js apps/server/tests/admin_flows.test.js
else
  echo "[deploy] Skipping tests on server (already validated in CI)."
fi

if [ "$should_build_panel" = "1" ]; then
  echo "[deploy] Building panel frontend..."
  npm --prefix apps/panel-v2 run build
else
  echo "[deploy] Skipping panel build (no changes)."
fi

if [ "$should_build_landing" = "1" ]; then
  echo "[deploy] Building landing frontend..."
  npm --prefix apps/landing run build
else
  echo "[deploy] Skipping landing build (no changes)."
fi

echo "[deploy] Reloading PM2 process..."
pm2 startOrReload tools/deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] Update complete."
