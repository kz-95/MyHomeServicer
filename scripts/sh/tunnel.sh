#!/usr/bin/env bash
# scripts/tunnel.sh
# ─────────────────────────────────────────────────────────────────────────────
# Expose the app via a secure tunnel for off-network testing (macOS / Linux).
#
# Prefers cloudflared (no account required).
# Falls back to ngrok if cloudflared is not installed.
#
# Usage:
#   bash scripts/tunnel.sh               # tunnels port 4200 (Angular dev)
#   bash scripts/tunnel.sh 3000          # tunnel backend directly
#   TUNNEL_TOOL=ngrok bash scripts/tunnel.sh
#
# Install cloudflared:
#   macOS:  brew install cloudflared
#   Linux:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
#
# Install ngrok: https://ngrok.com/download  (free account + authtoken required)
#
# IMPORTANT: copy the printed tunnel URL into your backend .env:
#   CORS_EXTRA_ORIGINS=<tunnel-url>
# Then restart the backend.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-4200}"
TOOL="${TUNNEL_TOOL:-auto}"

# ── Choose tool ───────────────────────────────────────────────────────────────
if [[ "$TOOL" == "auto" ]]; then
  if command -v cloudflared &>/dev/null; then
    TOOL="cloudflared"
  elif command -v ngrok &>/dev/null; then
    TOOL="ngrok"
  else
    echo ""
    echo "ERROR: Neither cloudflared nor ngrok found." >&2
    echo ""
    echo "Install cloudflared (recommended, no account needed):"
    echo "  macOS:  brew install cloudflared"
    echo "  Linux:  see https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    echo ""
    echo "Or install ngrok (free account required):"
    echo "  https://ngrok.com/download"
    echo "  ngrok config add-authtoken <YOUR_TOKEN>"
    exit 1
  fi
fi

echo ""
echo "Starting ${TOOL} tunnel on port ${PORT} ..."
echo ""
echo "IMPORTANT: once the tunnel URL appears, add it to backend/.env:"
echo "  CORS_EXTRA_ORIGINS=<tunnel-url>"
echo "Then restart the backend (Ctrl+C → npm run dev in the backend terminal)."
echo ""

case "$TOOL" in
  cloudflared)
    cloudflared tunnel --url "http://localhost:${PORT}"
    ;;
  ngrok)
    ngrok http "$PORT"
    ;;
  *)
    echo "Unknown tool: $TOOL" >&2
    exit 1
    ;;
esac
