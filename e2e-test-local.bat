@echo off
setlocal

REM ==========================================================
REM === MyHomeServicer — E2E Test Runner (Local) ==============
REM === Runs full end-to-end suite against live Postgres+Redis=
REM ==========================================================

echo.
echo ============================================
echo  MyHomeServicer — E2E Test Suite
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
echo [INFO] Running db:reset (drops, re-applies schema, seeds)...
call npm run db:reset
if errorlevel 1 (
    echo.
    echo [ERROR] Database setup failed. Make sure Docker is running and Postgres is ready.
    pause
    exit /b 1
)
echo [OK] Database reset + seed complete.

echo.
echo ============================================
echo  Running E2E tests (RUN_E2E=1)...
echo ============================================
echo.

call npm run test:e2e
set TEST_RESULT=%ERRORLEVEL%

echo.
if %TEST_RESULT% equ 0 (
    echo ============================================
    echo  E2E tests PASSED.
    echo ============================================
) else (
    echo ============================================
    echo  E2E tests FAILED (exit code %TEST_RESULT%).
    echo ============================================
)

echo.
pause
exit /b %TEST_RESULT%
