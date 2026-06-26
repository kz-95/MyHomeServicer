@echo off
setlocal

REM Change to project root so docker-compose.yml is found
cd /d "%~dp0..\.."

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
cd /d "%~dp0..\..\backend"

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
echo  Running backend E2E tests (RUN_E2E=1)...
echo ============================================
echo.

call npm run test:e2e
set BACKEND_TEST_RESULT=%ERRORLEVEL%

if %BACKEND_TEST_RESULT% equ 0 (
    echo [OK] Backend E2E tests passed.
) else (
    echo [FAIL] Backend E2E tests failed (exit code %BACKEND_TEST_RESULT%).
)

REM ==========================================================
REM === Frontend Playwright E2E tests =======================
REM ==========================================================
REM Start the frontend dev server for Playwright tests
cd /d "%~dp0..\..\frontend"

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
echo  Starting frontend dev server...
echo ============================================
echo [INFO] Starting ng serve on http://localhost:4200
REM Start ng serve in background with polling enabled for Docker/WSL
start "Frontend Dev Server" cmd /k "title Frontend Dev Server && ng serve --poll 2000"

echo Waiting for ng serve to be ready (may take 1-2 minutes on first run)...
set WAIT_COUNT=0
:wait_ng
if %WAIT_COUNT% geq 24 goto ng_timeout
timeout /t 5 >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if %ERRORLEVEL% equ 0 goto ng_ready
set /a WAIT_COUNT=%WAIT_COUNT%+1
echo  ... waiting (%WAIT_COUNT%/24 attempts)
goto wait_ng

:ng_timeout
echo [WARNING] ng serve did not respond in time, but proceeding with tests...

:ng_ready
echo [OK] Frontend server is ready.

echo.
echo ============================================
echo  Verifying backend is running...
echo ============================================
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1' -UseBasicParsing -TimeoutSec 2 2>$null; exit 0 } catch { exit 1 }" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Backend API is responding.
) else (
    echo [WARNING] Backend is not responding on http://localhost:3000
    echo [WARNING] Please start backend separately: cd backend ^&^& npm run dev
)

echo.
echo ============================================
echo  Running frontend E2E tests (Playwright)...
echo ============================================
echo [INFO] BASE_URL=http://localhost:4200 npx playwright test --config=e2e/playwright.config.ts --reporter=list,html
echo.

REM Run Playwright tests (list reporter for console output + HTML for visual)
set BASE_URL=http://localhost:4200
call npx playwright test --config=e2e/playwright.config.ts --reporter=list,html
set FRONTEND_TEST_RESULT=%ERRORLEVEL%

if %FRONTEND_TEST_RESULT% equ 0 (
    echo [OK] Frontend E2E tests passed.
) else (
    echo [FAIL] Frontend E2E tests failed (exit code %FRONTEND_TEST_RESULT%).
)
echo  HTML report: frontend\playwright-report\index.html
echo  Open with:   cd frontend ^&^& npx playwright show-report

REM ==========================================================
REM === Results ==========================================
REM ==========================================================
echo.
echo ============================================
echo  E2E Test Suite Results
echo ============================================
echo  Backend:  %BACKEND_TEST_RESULT%
echo  Frontend: %FRONTEND_TEST_RESULT%
echo ============================================
echo.

if %BACKEND_TEST_RESULT% equ 0 if %FRONTEND_TEST_RESULT% equ 0 (
    echo [SUCCESS] All E2E tests passed.
    set FINAL_RESULT=0
) else (
    echo [FAILED] One or more E2E test suites failed.
    set FINAL_RESULT=1
)

pause
exit /b %FINAL_RESULT%
