@echo off
setlocal

REM ==========================================================
REM === MyHomeServicer — Playwright E2E Runner (Local) ========
REM === Runs browser E2E suite (frontend/e2e) against live ====
REM === Postgres+Redis. Backend + ng serve are auto-started ===
REM === by Playwright's webServer config. =====================
REM ==========================================================

echo.
echo ============================================
echo  MyHomeServicer — Playwright E2E Suite
echo ============================================
echo.

REM ==========================================================
REM === Infrastructure check (Docker) =========================
REM ==========================================================
echo Checking Docker infrastructure...
echo.

docker info >nul 2>&1
if not errorlevel 1 goto :infra_containers

echo [MISSING] Docker Desktop is not running. Attempting to start it...
if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
) else if exist "C:\Program Files (x86)\Docker\Docker\Docker Desktop.exe" (
    start "" "C:\Program Files (x86)\Docker\Docker\Docker Desktop.exe"
) else (
    echo [ERROR] Docker Desktop not found at the usual install paths.
    echo        Please start Docker Desktop manually, then re-run this script.
    pause
    exit /b 1
)
echo Waiting for Docker to be ready (this may take a minute)...
:wait_docker
timeout /t 5 >nul
docker info >nul 2>&1
if errorlevel 1 goto wait_docker

:infra_containers
echo [OK] Docker is running.

REM --- Check if Postgres container is up ---
docker compose ps postgres 2>nul | findstr "Up" >nul
if errorlevel 1 (
    echo [MISSING] Starting Postgres and Redis...
    docker compose up -d
    if errorlevel 1 (
        echo [ERROR] Failed to start Docker containers.
        pause
        exit /b 1
    )
    echo Waiting for Postgres to be ready...
    :wait_pg
    docker compose exec -T postgres pg_isready -U postgres >nul 2>&1
    if errorlevel 1 (
        timeout /t 2 >nul
        goto :wait_pg
    )
    echo [OK] Postgres is ready.
) else (
    echo [OK] Postgres and Redis are already running.
)

REM ==========================================================
REM === Backend setup =========================================
REM ==========================================================
cd /d "%~dp0backend"

REM --- Force-kill stale node processes BEFORE npm install: a running
REM --- backend holds query_engine-windows.dll.node, which makes the
REM --- postinstall "prisma generate" fail ---
echo [CLEAN] Stopping any stale node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

echo.
echo ============================================
echo  Installing backend dependencies...
echo ============================================
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] Backend npm install failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Resetting database + seeding demo data...
echo ============================================
echo [INFO] Running db:reset (drops, re-applies migrations, seeds)...
call npm run db:reset
if errorlevel 1 (
    echo.
    echo [ERROR] Database setup failed. Make sure Docker is running and Postgres is ready.
    pause
    exit /b 1
)
echo [OK] Database reset + seed complete.

REM ==========================================================
REM === Frontend setup ========================================
REM ==========================================================
cd /d "%~dp0frontend"

echo.
echo ============================================
echo  Installing frontend dependencies...
echo ============================================
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [ERROR] Frontend npm install failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Installing Playwright Chromium browser...
echo ============================================
call npx playwright install chromium
if errorlevel 1 (
    echo [ERROR] Playwright browser install failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Running Playwright E2E tests...
echo  (backend + ng serve start automatically)
echo ============================================
echo.

call npm run test:e2e
set TEST_RESULT=%ERRORLEVEL%

echo.
if %TEST_RESULT% equ 0 (
    echo ============================================
    echo  Playwright E2E tests PASSED.
    echo ============================================
) else (
    echo ============================================
    echo  Playwright E2E tests FAILED (exit code %TEST_RESULT%).
    echo ============================================
    echo  HTML report: frontend\playwright-report\index.html
    echo  Open with:   cd frontend ^&^& npx playwright show-report
)

echo.
pause
exit /b %TEST_RESULT%
