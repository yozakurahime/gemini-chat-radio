#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/himefit}"
BRANCH="${BRANCH:-main}"
RUN_BACKUP="${RUN_BACKUP:-1}"

cd "$APP_DIR"

if [ "$RUN_BACKUP" = "1" ]; then
  bash tools/deploy/backup-db.sh
fi

echo "[deploy] Running update-server.sh..."
BRANCH="$BRANCH" APP_DIR="$APP_DIR" bash tools/deploy/update-server.sh

echo "[deploy] Completed."
