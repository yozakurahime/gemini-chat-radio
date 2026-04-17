#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/yozakurahime/academiaoxigenio.git}"
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

echo "[deploy] Installing base dependencies..."
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates build-essential ffmpeg

if ! command -v node >/dev/null 2>&1; then
  echo "[deploy] Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] Installing PM2..."
  sudo npm install -g pm2
fi

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[deploy] Cloning repository into ${APP_DIR}..."
  sudo mkdir -p "${APP_DIR}"
  sudo chown -R "$USER":"$USER" "${APP_DIR}"
  git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

echo "[deploy] Updating code..."
git fetch --all --prune
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "[deploy] Installing dependencies..."
install_deps ""
install_deps "apps/panel-v2"
install_deps "apps/landing"
install_deps "apps/server"

echo "[deploy] Building frontend apps..."
npm --prefix apps/panel-v2 run build
npm --prefix apps/landing run build

if [ ! -f "apps/server/.env" ]; then
  echo "[deploy] Creating apps/server/.env from example..."
  cp apps/server/.env.example apps/server/.env
fi

echo "[deploy] Starting server with PM2..."
pm2 startOrReload tools/deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[deploy] Installation complete."
echo "[deploy] If PM2 startup is not configured yet, run:"
echo "       pm2 startup systemd -u ${USER} --hp ${HOME}"
