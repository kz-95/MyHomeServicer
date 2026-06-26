@echo off
setlocal

set PROJECT_ROOT=%~dp0..\..

echo ============================================
echo  E2E QA Harness - Auto Fix Loop
echo ============================================
echo.

REM ==========================================================
REM === Docker check =========================================
REM ==========================================================
echo Checking Docker...
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
echo Checking dependencies...

REM Backend node_modules
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

REM Frontend node_modules
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

REM Playwright browsers (Chromium for tests)
cd /d "%PROJECT_ROOT%\frontend"
npx playwright install chromium 2>nul
if errorlevel 1 (
    echo [WARNING] Playwright Chromium install had issues. Tests may fail.
) else (
    echo [OK] Playwright Chromium ready.
)

REM ==========================================================
REM === Start backend ========================================
REM ==========================================================
echo.
echo Checking backend (port 3000)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Backend is already running.
) else (
    echo [INFO] Starting backend...
    start "Backend" cmd /k "title Backend && cd /d %PROJECT_ROOT%\backend && npm run dev"
    echo Waiting for backend (port 3000)...
    set WAIT_COUNT=0
    :wait_backend
    if %WAIT_COUNT% geq 30 goto backend_timeout
    timeout /t 2 >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
    if %ERRORLEVEL% equ 0 goto backend_ready
    set /a WAIT_COUNT=%WAIT_COUNT%+1
    goto wait_backend

    :backend_timeout
    echo [WARNING] Backend did not respond in 60s. Proceeding anyway...
    goto backend_done

    :backend_ready
    echo [OK] Backend is ready.
)
:backend_done

REM ==========================================================
REM === Start frontend =======================================
REM ==========================================================
echo.
echo Checking frontend (port 4200)...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Frontend is already running.
) else (
    echo [INFO] Starting frontend...
    start "Frontend" cmd /k "title Frontend && cd /d %PROJECT_ROOT%\frontend && ng serve --poll 2000"
    echo Waiting for frontend (port 4200) - may take 1-2 minutes...
    set WAIT_COUNT=0
    :wait_frontend
    if %WAIT_COUNT% geq 60 goto frontend_timeout
    timeout /t 2 >nul
    powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:4200' -UseBasicParsing -TimeoutSec 2 2>$null; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1" >nul 2>&1
    if %ERRORLEVEL% equ 0 goto frontend_ready
    set /a WAIT_COUNT=%WAIT_COUNT%+1
    goto wait_frontend

    :frontend_timeout
    echo [WARNING] Frontend did not respond in 120s. Proceeding anyway...
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
echo  Starting E2E harness...
echo ============================================
echo.
echo  Logs: tests\e2e\logs\e2e-qa-harness_XXXXX\
echo  Fixer prompt: tests\e2e\.fixer-prompt.txt
echo.
echo ============================================
echo.

cd /d "%PROJECT_ROOT%\tests\e2e"
powershell -ExecutionPolicy Bypass -File auto-fix-loop.ps1 %*

pause
