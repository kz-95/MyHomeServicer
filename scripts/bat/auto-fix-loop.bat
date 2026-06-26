@echo off
setlocal enabledelayedexpansion

set PROJECT_ROOT=%~dp0..\..

echo ============================================
echo  E2E QA Harness - Auto Fix Loop
echo ============================================
echo.

REM ==========================================================
REM === Docker check =========================================
REM ==========================================================
echo [1/6] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Docker is not running. Start Docker Desktop and try again.
    pause
    exit /b 1
)
echo [OK] Docker is running.

REM ==========================================================
REM === Verify dependencies ==================================
REM ==========================================================
echo.
echo [2/6] Checking dependencies...

if not exist "%PROJECT_ROOT%\backend\node_modules" (
    echo [MISSING] Backend node_modules. Installing...
    cd /d "%PROJECT_ROOT%\backend"
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [FAIL] Backend npm install failed.
        pause
        exit /b 1
    )
    echo [OK] Backend dependencies installed.
) else (
    echo [OK] Backend node_modules present.
)

if not exist "%PROJECT_ROOT%\frontend\node_modules" (
    echo [MISSING] Frontend node_modules. Installing...
    cd /d "%PROJECT_ROOT%\frontend"
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [FAIL] Frontend npm install failed.
        pause
        exit /b 1
    )
    echo [OK] Frontend dependencies installed.
) else (
    echo [OK] Frontend node_modules present.
)

echo Checking Playwright Chromium...
powershell -Command "if (Test-Path \"$env:LOCALAPPDATA\ms-playwright\chromium-*\chrome-win\chrome.exe\") { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Playwright Chromium ready.
) else (
    echo [INFO] Installing Playwright Chromium (one-time ~150MB)...
    call "%PROJECT_ROOT%\frontend\node_modules\.bin\playwright.cmd" install chromium
    if errorlevel 1 (
        echo [WARNING] Playwright Chromium install FAILED (exit code !ERRORLEVEL!)
        echo Tests will fail without Chromium. Fix this and re-run.
        pause
    ) else (
        echo [OK] Playwright Chromium installed.
    )
)

REM ==========================================================
REM === Kill stale ports =====================================
REM ==========================================================
echo.
echo [3/6] Killing stale processes on ports 3000 and 4200...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        taskkill /F /PID %%P >nul 2>&1
        echo   Killed PID %%P on port 3000
    )
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":4200" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        taskkill /F /PID %%P >nul 2>&1
        echo   Killed PID %%P on port 4200
    )
)
echo [OK] Ports cleared.

REM ==========================================================
REM === Clean DB: migrate + reseed ===========================
REM ==========================================================
echo.
echo [4/6] Resetting database (migrate + reseed)...
echo This may take 30-60 seconds...
cd /d "%PROJECT_ROOT%\backend"
call npm run db:reset
if errorlevel 1 (
    echo.
    echo [FAIL] Database reset FAILED (exit code !ERRORLEVEL!)
    echo Check: is Docker running? Is Postgres healthy?
    pause
    exit /b 1
)
echo [OK] Database reset complete.

REM ==========================================================
REM === Start backend ========================================
REM ==========================================================
echo.
echo [5/6] Starting backend (port 3000)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Backend is already running.
) else (
    echo [INFO] Launching backend...
    start "Backend" cmd /k "title Backend && cd /d %PROJECT_ROOT%\backend && npm run dev"
    echo Waiting for backend...
    set /a WAIT=0
    :wait_backend
    if !WAIT! geq 30 goto backend_timeout
    timeout /t 2 >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 goto backend_ready
    set /a WAIT+=1
    goto wait_backend

    :backend_timeout
    echo [WARNING] Backend did not respond in 60s. Check the Backend window for errors.
    echo Press any key to continue anyway...
    pause >nul
    goto backend_done

    :backend_ready
    echo [OK] Backend is ready.
)
:backend_done

REM ==========================================================
REM === Start frontend =======================================
REM ==========================================================
echo.
echo [6/6] Starting frontend (port 4200)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Frontend is already running.
) else (
    echo [INFO] Launching frontend...
    start "Frontend" cmd /k "title Frontend && cd /d %PROJECT_ROOT%\frontend && ng serve --poll 2000"
    echo Waiting for frontend (Angular compilation may take 1-2 min)...
    set /a WAIT=0
    :wait_frontend
    if !WAIT! geq 60 goto frontend_timeout
    timeout /t 2 >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 goto frontend_ready
    set /a WAIT+=1
    goto wait_frontend

    :frontend_timeout
    echo [WARNING] Frontend did not respond in 120s. Check the Frontend window for errors.
    echo Press any key to continue anyway...
    pause >nul
    goto frontend_done

    :frontend_ready
    echo [OK] Frontend is ready.
)
:frontend_done

REM ==========================================================
REM === Run the harness ======================================
REM ==========================================================
echo.
echo ============================================
echo  ALL SERVERS READY - Starting E2E harness
echo ============================================
echo.
echo  Logs: tests\e2e\logs\e2e-qa-harness_XXXXX\
echo  Fixer prompt: tests\e2e\.fixer-prompt.txt
echo.
echo ============================================

cd /d "%PROJECT_ROOT%\tests\e2e"
powershell -ExecutionPolicy Bypass -File auto-fix-loop.ps1 %*

echo.
echo ============================================
echo  Harness finished (exit code: !ERRORLEVEL!)
echo ============================================
pause
