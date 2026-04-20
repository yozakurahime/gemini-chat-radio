#!/usr/bin/env bash
set -euo pipefail

TARGET_TZ="${TARGET_TZ:-America/Sao_Paulo}"

echo "[timezone] applying ${TARGET_TZ}..."

if command -v timedatectl >/dev/null 2>&1; then
  sudo timedatectl set-timezone "${TARGET_TZ}"
  timedatectl | grep "Time zone" || true
else
  if [ ! -f "/usr/share/zoneinfo/${TARGET_TZ}" ]; then
    echo "[timezone] zoneinfo not found: ${TARGET_TZ}" >&2
    exit 1
  fi
  sudo ln -sf "/usr/share/zoneinfo/${TARGET_TZ}" /etc/localtime
  echo "${TARGET_TZ}" | sudo tee /etc/timezone >/dev/null
  date
fi

echo "[timezone] done."
