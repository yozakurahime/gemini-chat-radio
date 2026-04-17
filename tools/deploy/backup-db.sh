#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/himefit}"
DATA_DIR="${DATA_DIR:-$APP_DIR/runtime/data}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/runtime/backups/auto}"
KEEP_DAYS="${KEEP_DAYS:-14}"

DB_FILE="$DATA_DIR/himefit.db"
TS="$(date +%F-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[backup] Database not found at $DB_FILE"
  exit 1
fi

echo "[backup] Creating backup at $BACKUP_DIR..."
cp -a "$DB_FILE" "$BACKUP_DIR/himefit-$TS.db"
[ -f "$DB_FILE-wal" ] && cp -a "$DB_FILE-wal" "$BACKUP_DIR/himefit-$TS.db-wal" || true
[ -f "$DB_FILE-shm" ] && cp -a "$DB_FILE-shm" "$BACKUP_DIR/himefit-$TS.db-shm" || true

echo "[backup] Pruning files older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -type f -name "himefit-*.db*" -mtime +"$KEEP_DAYS" -delete

echo "[backup] Done."
