#!/usr/bin/env bash
# scripts/fresh-start.sh
# ─────────────────────────────────────────────────────────────────────────────
# One-command fresh start for macOS / Linux / WSL.
# Spins up infrastructure, waits for healthy services, resets + reseeds DB.
#
# Usage (from repo root):
#   bash scripts/fresh-start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAX_WAIT=60
INTERVAL=3

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  MyServicer — Fresh Start"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Start infrastructure ───────────────────────────────────────────────────
echo "[1/3] Starting Docker services..."
cd "$REPO_ROOT"
docker compose up -d
echo "      Docker services started."

# ── 2. Wait for healthy services ──────────────────────────────────────────────
echo "[2/3] Waiting for postgres and redis to be healthy..."
elapsed=0
services=("hs_postgres" "hs_redis")

while true; do
  all_healthy=true
  for svc in "${services[@]}"; do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null || echo "missing")
    if [[ "$status" != "healthy" ]]; then
      all_healthy=false
      break
    fi
  done
  if $all_healthy; then break; fi
  if (( elapsed >= MAX_WAIT )); then
    echo "ERROR: Services did not become healthy within ${MAX_WAIT}s." >&2
    echo "       Check: docker compose ps" >&2
    exit 1
  fi
  echo "      Still waiting... (${elapsed}s elapsed)"
  sleep "$INTERVAL"
  (( elapsed += INTERVAL ))
done
echo "      All services healthy."

# ── 3. Reset + reseed database ────────────────────────────────────────────────
echo "[3/3] Resetting database (force-push schema + seed)..."
cd "$REPO_ROOT/backend"
npm run db:reset
echo "      Database ready with demo seed data."

# ── Done ──────────────────────────────────────────────────────────────────────
cd "$REPO_ROOT"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Fresh start complete! Start the app:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Standard (localhost only):"
echo "    Terminal 1:  cd backend  && npm run dev"
echo "    Terminal 2:  cd frontend && npx ng serve"
echo ""
echo "  LAN access (phone on same Wi-Fi):"
echo "    bash scripts/lan-dev.sh"
echo ""
echo "  Off-network tunnel:"
echo "    bash scripts/tunnel.sh"
echo ""
echo "  Demo accounts — password: Demo@2026"
echo "    customer.fresh@demo.local  |  admin@demo.local (PIN: 1234)"
echo "    merchant.1@demo.local  ...  merchant.12@demo.local"
echo ""
