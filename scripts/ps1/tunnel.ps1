# scripts/tunnel.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Expose the app to the internet via a secure tunnel for off-network testing
# (e.g. testing on a mobile device on a different network, sharing with a
# client for a quick demo, or testing webhooks).
#
# Prefers cloudflared (no account required for a quick tunnel).
# Falls back to ngrok if cloudflared is not installed.
#
# Usage (from repo root):
#   .\scripts\tunnel.ps1                  # tunnels port 4200 (Angular dev)
#   .\scripts\tunnel.ps1 -Port 3000       # tunnel backend directly
#   .\scripts\tunnel.ps1 -Tool ngrok      # force ngrok
#
# Install cloudflared (recommended, free, no account):
#   winget install --id Cloudflare.cloudflared
#   # or: scoop install cloudflared
#
# Install ngrok (requires free account + authtoken):
#   winget install ngrok.ngrok
#   ngrok config add-authtoken <YOUR_TOKEN>
#
# IMPORTANT: The tunnel URL must be added to CORS_EXTRA_ORIGINS in your
# backend .env so the backend accepts requests from it. The script prints
# the exact line to add.
# ─────────────────────────────────────────────────────────────────────────────

param(
    [int]    $Port = 4200,
    [string] $Tool = 'auto'   # 'auto' | 'cloudflared' | 'ngrok'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-Tool([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Choose tool ───────────────────────────────────────────────────────────────
if ($Tool -eq 'auto') {
    if (Find-Tool 'cloudflared') { $Tool = 'cloudflared' }
    elseif (Find-Tool 'ngrok')   { $Tool = 'ngrok' }
    else {
        Write-Host ""
        Write-Host "Neither cloudflared nor ngrok was found." -ForegroundColor Red
        Write-Host ""
        Write-Host "Install cloudflared (recommended - no account needed):" -ForegroundColor Yellow
        Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Or install ngrok (free account required):" -ForegroundColor Yellow
        Write-Host "  winget install ngrok.ngrok" -ForegroundColor Cyan
        Write-Host "  ngrok config add-authtoken <YOUR_TOKEN>" -ForegroundColor Cyan
        exit 1
    }
}

Write-Host ""
Write-Host "Starting $Tool tunnel on port $Port ..." -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: once the tunnel URL appears, add it to backend\.env:" -ForegroundColor Yellow
Write-Host "  CORS_EXTRA_ORIGINS=<tunnel-url>" -ForegroundColor Green
Write-Host "Then restart the backend (Ctrl+C → npm run dev in the backend window)." -ForegroundColor Yellow
Write-Host ""

# ── Start the tunnel ──────────────────────────────────────────────────────────
switch ($Tool) {
    'cloudflared' {
        # Quick tunnel - no account, URL printed to stdout
        # The URL is printed like: https://random-words.trycloudflare.com
        cloudflared tunnel --url "http://localhost:$Port"
    }
    'ngrok' {
        ngrok http $Port
    }
    default {
        Write-Error "Unknown tool: $Tool. Use 'cloudflared' or 'ngrok'."
        exit 1
    }
}
