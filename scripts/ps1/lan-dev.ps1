# scripts/lan-dev.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Start the app in LAN-accessible dev mode so you can open it on a phone or
# any device on the same Wi-Fi network.
#
# What this does:
#   1. Auto-detects your desktop's LAN IP address
#   2. Starts the Express backend with CORS_EXTRA_ORIGINS set to allow that IP
#   3. Starts ng serve --configuration=lan (binds to 0.0.0.0)
#   4. Prints the URL to open on your phone
#
# Usage (from repo root):
#   .\scripts\lan-dev.ps1
#
# Prerequisites: Docker (postgres + redis) must already be running.
#   Start infra first:  docker compose up -d
# ─────────────────────────────────────────────────────────────────────────────

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot

# ── 1. Detect LAN IP ──────────────────────────────────────────────────────────
$LanIP = (
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.' -and
        $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -First 1
).IPAddress

if (-not $LanIP) {
    Write-Error "Could not detect a LAN IP address. Are you connected to Wi-Fi?"
    exit 1
}

$FrontendUrl = "http://${LanIP}:4200"
$BackendUrl  = "http://${LanIP}:3000"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           MyServicer - LAN Dev Mode              ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  LAN IP   : $LanIP" -ForegroundColor Cyan
Write-Host "║  Frontend : $FrontendUrl" -ForegroundColor Green
Write-Host "║  Backend  : $BackendUrl" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Open the Frontend URL on your phone's browser." -ForegroundColor Yellow
Write-Host "Press Ctrl+C in each window to stop." -ForegroundColor Yellow
Write-Host ""

# ── 2. Start backend in a new window with CORS_EXTRA_ORIGINS injected ─────────
$BackendCmd = @"
cd '$RepoRoot\backend'
`$env:CORS_EXTRA_ORIGINS = '$FrontendUrl'
Write-Host 'Backend: CORS_EXTRA_ORIGINS=$FrontendUrl' -ForegroundColor Cyan
npm run dev
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $BackendCmd

# Give the backend a moment to start before the frontend window opens
Start-Sleep -Seconds 2

# ── 3. Start Angular in LAN mode (binds to 0.0.0.0, port 4200) ───────────────
$FrontendCmd = @"
cd '$RepoRoot\frontend'
Write-Host 'Frontend: ng serve --configuration=lan (0.0.0.0:4200)' -ForegroundColor Cyan
npx ng serve --configuration=lan
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $FrontendCmd

Write-Host "Both servers starting in separate windows." -ForegroundColor Green
Write-Host "Navigate to $FrontendUrl on your phone once Angular is ready." -ForegroundColor Green
