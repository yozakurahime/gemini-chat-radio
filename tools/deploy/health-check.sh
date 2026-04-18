#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
TIMEOUT_SEC="${TIMEOUT_SEC:-12}"
TMP_COOKIE="$(mktemp)"

cleanup() {
  rm -f "$TMP_COOKIE" 2>/dev/null || true
}
trap cleanup EXIT

echo "[health-check] base_url=$BASE_URL"

curl -fsS --max-time "$TIMEOUT_SEC" "$BASE_URL/api/health" >/dev/null
echo "[health-check] liveness: ok"

if [[ -n "${PANEL_USER:-}" && -n "${PANEL_PASS:-}" ]]; then
  LOGIN_PAYLOAD="$(printf '{"user":"%s","pass":"%s"}' "$PANEL_USER" "$PANEL_PASS")"
  curl -fsS --max-time "$TIMEOUT_SEC" \
    -H "Content-Type: application/json" \
    -c "$TMP_COOKIE" \
    -d "$LOGIN_PAYLOAD" \
    "$BASE_URL/auth/login" >/dev/null

  DETAILS_JSON="$(curl -fsS --max-time "$TIMEOUT_SEC" -b "$TMP_COOKIE" "$BASE_URL/admin/system/health/detailed")"
  STATUS="$(printf '%s' "$DETAILS_JSON" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -n1)"
  echo "[health-check] operational_status=${STATUS:-unknown}"
else
  echo "[health-check] PANEL_USER/PANEL_PASS nao definidos; pulando health detalhado."
fi

