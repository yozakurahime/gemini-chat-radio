#!/usr/bin/env bash
set -euo pipefail

# Instala e registra um GitHub Actions self-hosted runner na VM.
# Uso:
#   GITHUB_REPO="owner/repo" GITHUB_RUNNER_TOKEN="xxx" bash tools/deploy/install-self-hosted-runner.sh
#
# Opcional:
#   RUNNER_NAME="himefit-prod"
#   RUNNER_LABELS="self-hosted,linux,x64,himefit-prod"
#   RUNNER_VERSION="2.333.1"
#   RUNNER_DIR="/opt/actions-runner"
#   RUNNER_DISABLE_UPDATE="1"

: "${GITHUB_REPO:?Set GITHUB_REPO=owner/repo}"
: "${GITHUB_RUNNER_TOKEN:?Set GITHUB_RUNNER_TOKEN=<registration_token>}"

RUNNER_NAME="${RUNNER_NAME:-$(hostname)-himefit}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,x64,himefit-prod}"
RUNNER_VERSION="${RUNNER_VERSION:-2.333.1}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner}"
RUNNER_USER="${RUNNER_USER:-$USER}"
RUNNER_DISABLE_UPDATE="${RUNNER_DISABLE_UPDATE:-1}"

echo "[runner] Installing dependencies..."
sudo apt-get update -y
sudo apt-get install -y curl tar ca-certificates

echo "[runner] Preparing directory ${RUNNER_DIR}..."
sudo mkdir -p "${RUNNER_DIR}"
sudo chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

if [ ! -f "./config.sh" ]; then
  ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}"
  echo "[runner] Downloading ${URL}..."
  curl -fsSL -o "${ARCHIVE}" "${URL}"
  tar xzf "${ARCHIVE}"
  rm -f "${ARCHIVE}"
fi

if [ -f ".runner" ]; then
  echo "[runner] Existing runner configuration found. Replacing..."
  ./config.sh remove --unattended --token "${GITHUB_RUNNER_TOKEN}" || true
fi

echo "[runner] Configuring runner for ${GITHUB_REPO}..."
config_args=(
  --url "https://github.com/${GITHUB_REPO}"
  --token "${GITHUB_RUNNER_TOKEN}"
  --name "${RUNNER_NAME}"
  --labels "${RUNNER_LABELS}"
  --work "_work"
  --unattended
  --replace
)
if [ "${RUNNER_DISABLE_UPDATE}" = "1" ]; then
  config_args+=(--disableupdate)
fi
./config.sh "${config_args[@]}"

echo "[runner] Installing service..."
sudo ./svc.sh install "${RUNNER_USER}"
sudo ./svc.sh start
sudo ./svc.sh status || true

echo "[runner] Done."
echo "[runner] Keep VM online. Deploy workflow now runs on label: himefit-prod"
