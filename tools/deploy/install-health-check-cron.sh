#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHECK_SCRIPT="$PROJECT_ROOT/tools/deploy/health-check.sh"
LOG_FILE="$PROJECT_ROOT/runtime/storage/logs/health-check.log"
CRON_EXPR="${CRON_EXPR:-*/5 * * * *}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"

mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

chmod +x "$CHECK_SCRIPT"

CRON_LINE="$CRON_EXPR BASE_URL=$BASE_URL bash $CHECK_SCRIPT >> $LOG_FILE 2>&1"

EXISTING="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$EXISTING" | grep -Fq "$CHECK_SCRIPT"; then
  NEW_CRON="$(printf '%s\n' "$EXISTING" | awk -v script="$CHECK_SCRIPT" '$0 !~ script { print }')"
  printf '%s\n%s\n' "$NEW_CRON" "$CRON_LINE" | crontab -
  echo "[health-check-cron] entrada atualizada."
else
  printf '%s\n%s\n' "$EXISTING" "$CRON_LINE" | crontab -
  echo "[health-check-cron] entrada criada."
fi

echo "[health-check-cron] script=$CHECK_SCRIPT"
echo "[health-check-cron] log=$LOG_FILE"

