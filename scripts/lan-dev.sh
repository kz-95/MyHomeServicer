#!/usr/bin/env bash
# scripts/lan-dev.sh
# ─────────────────────────────────────────────────────────────────────────────
# Start the app in LAN-accessible dev mode (macOS / Linux / WSL).
#
# What this does:
#   1. Auto-detects your LAN IP address
#   2. Starts Express with CORS_EXTRA_ORIGINS set for that IP
#   3. Starts ng serve --configuration=lan  (binds to 0.0.0.0:4200)
#   4. Prints the URL to open on your phone
#
# Usage (from repo root):
#   bash scripts/lan-dev.sh
#
# Prerequisites: docker compose up -d  (postgres + redis must be running)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── 1. Detect LAN IP ──────────────────────────────────────────────────────────
detect_lan_ip() {
  # macOS
  if command -v ipconfig &>/dev/null && [[ "$(uname)" == "Darwin" ]]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null
    return
  fi
  # Linux / WSL — pick the first non-loopback, non-link-local IPv4
  ip -4 addr show scope global 2>/dev/null \
    | grep -oP '(?<=inet\s)\d+(\.\d+){3}' \
    | grep -v '^127\.' \
    | grep -v '^169\.254\.' \
    | head -1
}

LAN_IP="$(detect_lan_ip)"
if [[ -z "$LAN_IP" ]]; then
  echo "ERROR: Could not detect a LAN IP. Are you connected to Wi-Fi?" >&2
  exit 1
fi

FRONTEND_URL="http://${LAN_IP}:4200"
BACKEND_URL="http://${LAN_IP}:3000"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           MyServicer — LAN Dev Mode              ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  LAN IP   : ${LAN_IP}"
echo "║  Frontend : ${FRONTEND_URL}"
echo "║  Backend  : ${BACKEND_URL}"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Open ${FRONTEND_URL} on your phone once Angular is ready."
echo "Press Ctrl+C to stop both servers."
echo ""

# ── 2. Start backend with injected CORS_EXTRA_ORIGINS ─────────────────────────
export CORS_EXTRA_ORIGINS="$FRONTEND_URL"
(
  cd "$REPO_ROOT/backend"
  echo "[backend] Starting with CORS_EXTRA_ORIGINS=$CORS_EXTRA_ORIGINS"
  npm run dev
) &
BACKEND_PID=$!

sleep 2

# ── 3. Start Angular in LAN mode ──────────────────────────────────────────────
(
  cd "$REPO_ROOT/frontend"
  echo "[frontend] Starting ng serve --configuration=lan"
  npx ng serve --configuration=lan
) &
FRONTEND_PID=$!

# Wait and forward Ctrl+C to both child processes
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait $BACKEND_PID $FRONTEND_PID
