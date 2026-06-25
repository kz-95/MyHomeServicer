# scripts/fresh-start.ps1
# ─────────────────────────────────────────────────────────────────────────────
# One-command fresh start: spin up infrastructure, wait for healthy services,
# reset + reseed the database, then print the commands to start the app.
#
# Usage (from repo root):
#   .\scripts\fresh-start.ps1
#
# What it does:
#   1. docker compose up -d          (starts postgres + redis)
#   2. Waits until both pass health checks
#   3. cd backend && npm run db:reset (force-push schema + regenerate + seed)
#   4. Prints the start commands
#
# For LAN access after this, run:
#   .\scripts\lan-dev.ps1
# ─────────────────────────────────────────────────────────────────────────────

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MyServicer - Fresh Start" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── 1. Start infrastructure ───────────────────────────────────────────────────
Write-Host "[1/3] Starting Docker services..." -ForegroundColor Yellow
Set-Location $RepoRoot
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up failed"; exit 1 }
Write-Host "      Docker services started." -ForegroundColor Green

# ── 2. Wait for healthy services ──────────────────────────────────────────────
Write-Host "[2/3] Waiting for postgres and redis to be healthy..." -ForegroundColor Yellow

$MaxWait   = 60   # seconds
$Interval  = 3
$Elapsed   = 0
$Services  = @('hs_postgres', 'hs_redis')

while ($Elapsed -lt $MaxWait) {
    $AllHealthy = $true
    foreach ($svc in $Services) {
        $status = docker inspect --format='{{.State.Health.Status}}' $svc 2>$null
        if ($status -ne 'healthy') {
            $AllHealthy = $false
            break
        }
    }
    if ($AllHealthy) { break }
    Write-Host "      Still waiting... ($Elapsed s elapsed)" -ForegroundColor Gray
    Start-Sleep -Seconds $Interval
    $Elapsed += $Interval
}

if ($Elapsed -ge $MaxWait) {
    Write-Error "Services did not become healthy within ${MaxWait}s. Check: docker compose ps"
    exit 1
}
Write-Host "      All services healthy." -ForegroundColor Green

# ── 3. Reset + reseed database ────────────────────────────────────────────────
Write-Host "[3/3] Resetting database (force-push schema + seed)..." -ForegroundColor Yellow
Set-Location "$RepoRoot\backend"
npm run db:reset
if ($LASTEXITCODE -ne 0) { Write-Error "db:reset failed"; exit 1 }
Write-Host "      Database ready with demo seed data." -ForegroundColor Green

# ── Done - print start instructions ──────────────────────────────────────────
Set-Location $RepoRoot
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Fresh start complete! Start the app:" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Standard (localhost only):" -ForegroundColor Cyan
Write-Host "    Terminal 1:  cd backend  && npm run dev"
Write-Host "    Terminal 2:  cd frontend && npx ng serve"
Write-Host ""
Write-Host "  LAN access (phone on same Wi-Fi):" -ForegroundColor Cyan
Write-Host "    .\scripts\lan-dev.ps1"
Write-Host ""
Write-Host "  Off-network tunnel:" -ForegroundColor Cyan
Write-Host "    .\scripts\tunnel.ps1"
Write-Host ""
Write-Host "  Demo accounts - password: Demo@2026" -ForegroundColor Yellow
Write-Host "    customer.fresh@demo.local  |  admin@demo.local (PIN: 1234)"
Write-Host "    merchant.1@demo.local  ...  merchant.12@demo.local"
Write-Host ""
