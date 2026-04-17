#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/himefit}"
RUN_AT_HOUR="${RUN_AT_HOUR:-3}"
RUN_AT_MINUTE="${RUN_AT_MINUTE:-0}"
LOG_FILE="${LOG_FILE:-$APP_DIR/runtime/storage/logs/backup-db.log}"
CRON_CMD="bash $APP_DIR/tools/deploy/backup-db.sh >> $LOG_FILE 2>&1"
CRON_LINE="$RUN_AT_MINUTE $RUN_AT_HOUR * * * $CRON_CMD"

mkdir -p "$(dirname "$LOG_FILE")"

TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v "tools/deploy/backup-db.sh" > "$TMP_CRON" || true
echo "$CRON_LINE" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"

echo "[backup] Installed daily cron:"
echo "         $CRON_LINE"
