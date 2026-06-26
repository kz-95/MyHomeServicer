@echo off
setlocal enabledelayedexpansion

REM Change to project root so docker-compose.yml is found
cd /d "%~dp0..\.."

REM ========================================================
REM === E2E Diagnostics & Debug Helper ====================
REM === Runs backend + frontend E2E with verbose output ===
REM ========================================================

echo.
echo ====== MyHomeServicer E2E Debug Helper ======
echo.

REM Check Docker
echo [1/5] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Docker is not running
    echo Please start Docker Desktop and try again
    pause
    exit /b 1
)
echo [OK] Docker is running

REM Check Postgres
echo.
echo [2/5] Checking Postgres container...
docker compose ps postgres 2>nul | findstr "Up" >nul
if errorlevel 1 (
    echo [MISSING] Starting Postgres + Redis...
    docker compose up -d
) else (
    echo [OK] Postgres is running
)

REM Check backend setup
echo.
echo [3/5] Setting up backend...
cd /d "%~dp0..\..\backend"
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

echo Installing backend deps...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [FAIL] Backend npm install failed
    pause
    exit /b 1
)

echo Resetting database...
call npm run db:reset
if errorlevel 1 (
    echo [FAIL] Database reset failed
    pause
    exit /b 1
)
echo [OK] Backend ready

REM Run backend E2E
echo.
echo [4/5] Running backend E2E tests...
echo.
set RUN_E2E=1
call npm run test:e2e
set BACKEND_RESULT=%ERRORLEVEL%

if %BACKEND_RESULT% equ 0 (
    echo.
    echo [OK] Backend E2E tests PASSED
) else (
    echo.
    echo [FAIL] Backend E2E tests FAILED ^(exit code %BACKEND_RESULT%^)
    echo [INFO] Check the errors above
)

REM Run frontend E2E
echo.
echo [5/5] Running frontend E2E tests...
echo [NOTE] Backend must be running for this to work
echo [NOTE] Start in another terminal: cd backend ^&^& npm run dev
echo.

cd /d "%~dp0..\..\frontend"
call npm install --no-audit --no-fund

REM Try to start ng serve with polling
echo Starting ng serve...
start "Frontend Dev Server" cmd /k "title Frontend Dev Server && ng serve --poll 2000"

echo Waiting for frontend to be ready...
set ATTEMPTS=0
:wait_frontend
if %ATTEMPTS% geq 24 goto frontend_timeout
timeout /t 5 >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if %ERRORLEVEL% equ 0 goto frontend_ready
set /a ATTEMPTS=%ATTEMPTS%+1
echo  ... attempt %ATTEMPTS%/24
goto wait_frontend

:frontend_timeout
echo [WARNING] Frontend server did not respond in time

:frontend_ready
echo [OK] Frontend is ready

echo.
echo Running Playwright tests...
echo.
set BASE_URL=http://localhost:4200
call npm run test:e2e
set FRONTEND_RESULT=%ERRORLEVEL%

echo.
echo ====== Results ======
echo Backend:  %BACKEND_RESULT%
echo Frontend: %FRONTEND_RESULT%
echo.

if %BACKEND_RESULT% equ 0 if %FRONTEND_RESULT% equ 0 (
    echo SUCCESS: All tests passed
) else (
    echo FAILED: Check errors above
    echo.
    echo Troubleshooting:
    echo - Backend tests fail? Check docker-compose is up and DB seeded
    echo - Frontend tests fail? Check backend is running ^(npm run dev^) and frontend compiled
    echo - Browser timeout? The ng serve window may still be compiling
)

pause
exit /b %ERRORLEVEL%
