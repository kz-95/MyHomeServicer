@echo off
setlocal

REM ==========================================================
REM === MyHomeServicer — Clean Launcher (no demo data) ========
REM === Fresh schema + non-demo admin — test registration ====
REM ==========================================================
if "%~1"=="" goto :main
if /i "%~1"=="backend_only"  goto :backend_only
if /i "%~1"=="frontend_only" goto :frontend_only
echo Unknown argument: %~1
exit /b 1

REM ==========================================================
REM === Infrastructure check (Docker) =========================
REM ==========================================================
:ensure_infra
echo.
echo ============================================
echo  Checking Docker infrastructure...
echo ============================================
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
echo.

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
exit /b 0

REM ==========================================================
REM === Main launcher ========================================
REM ==========================================================
:main
echo.
echo ============================================
echo  MyHomeServicer — Clean Mode
echo  Fresh schema + non-demo admin account
echo ============================================
call :ensure_infra
if errorlevel 1 exit /b 1

echo.
echo Launching Frontend + Backend in separate terminals...
echo.
start "Backend (Clean)" cmd /k call "%~f0" backend_only
timeout /t 1 >nul
start "Frontend (Clean)" cmd /k call "%~f0" frontend_only
echo.
echo Waiting for frontend to build, then opening browser...
echo.
powershell -NoProfile -Command ^
  "$u='http://localhost:4200'; ^
   do { ^
     try { ^
       $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 3; ^
       if ($r.StatusCode -eq 200) { ^
         Start-Process $u; ^
         Write-Host 'Frontend ready! Browser opened: http://localhost:4200'; ^
         break ^
       } ^
     } catch {} ^
     Write-Host '.' -NoNewline; ^
     Start-Sleep -Seconds 2 ^
   } while ($true)"
echo.
echo Both terminals are running. Close them to stop the servers.
exit /b 0

REM ==========================================================
REM === BACKEND (clean — admin-only seed) =====================
REM ==========================================================
:backend_only
cd /d "%~dp0backend"

REM --- .env check (copied from Run.bat) ---
if exist ".env" (
    echo [OK] .env file found.
) else (
    echo.
    echo [MISSING] Creating .env file from template...
    echo.

    REM --- Generate two distinct random 64-char secrets ---
    powershell -NoProfile -Command "-join ((1..64) | ForEach-Object {[char](Get-Random -InputObject ((48..57)+(65..90)+(97..122)))})" > "%TEMP%\jwt.txt"
    set /p JWT_SECRET=<"%TEMP%\jwt.txt"

    powershell -NoProfile -Command "-join ((1..64) | ForEach-Object {[char](Get-Random -InputObject ((48..57)+(65..90)+(97..122)))})" > "%TEMP%\refresh.txt"
    set /p REFRESH_SECRET=<"%TEMP%\refresh.txt"

    del "%TEMP%\jwt.txt" "%TEMP%\refresh.txt" >nul 2>&1

    REM --- Write .env file ---
    (
        echo # ---------- Runtime ----------
        echo NODE_ENV=development
        echo PORT=3000
        echo HOST=0.0.0.0
        echo.
        echo # ---------- Timezone ----------
        echo TZ=Asia/Kuala_Lumpur
        echo.
        echo # ---------- Frontend / CORS ----------
        echo APP_URL=http://localhost:4200
        echo CORS_EXTRA_ORIGINS=
        echo.
        echo # ---------- Database ----------
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/homeservices
        echo.
        echo # ---------- Redis ----------
        echo REDIS_URL=redis://localhost:6379
        echo.
        echo # ---------- Auth ^(JWT^) ----------
        echo JWT_SECRET=%JWT_SECRET%
        echo REFRESH_SECRET=%REFRESH_SECRET%
        echo JWT_EXPIRES_IN=15m
        echo REFRESH_TOKEN_EXPIRES_IN=7d
        echo.
        echo # ---------- S3 / Object storage ^(optional - fill in if needed^) ----------
        echo S3_BUCKET=
        echo S3_REGION=auto
        echo S3_ACCESS_KEY=
        echo S3_SECRET_KEY=
        echo S3_BASE_URL=
        echo.
        echo # ---------- AI Chatbot ^(optional - fill in if needed^) ----------
        echo AICHAT_LLM_API_KEY=
        echo AICHAT_LLM_FALLBACK_API_KEY=
    ) > .env

    echo [OK] .env created.
    echo      Optional keys ^(S3, AI chat LLM^) left blank - edit .env to fill them.
    echo.
)

REM --- Check required .env vars ---
call :check_env
if errorlevel 1 exit /b 1

REM --- Install backend deps (reinstall if package-lock.json is newer than installed state) ---
powershell -NoProfile -Command ^
  "if (!(Test-Path 'node_modules\.package-lock.json') -or ((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime)) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Installing backend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Backend npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [OK] Backend dependencies present.
)

REM --- Force-kill any stale node processes (frees Prisma DLL lock) ---
echo [CLEAN] Stopping any stale node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 >nul

REM --- Stale Prisma client cleanup (prevents Windows DLL lock error) ---
if exist "node_modules\.prisma\client" (
    echo [CLEAN] Removing stale Prisma client...
    rmdir /s /q "node_modules\.prisma\client" 2>nul
)

REM --- Apply migrations ONLY (reset wipes any old demo data, no seed) ---
echo.
echo ============================================
echo  Applying database migrations...
echo ============================================
echo [INFO] Resetting DB and applying migrations from prisma/migrations...
call npx prisma migrate reset --force --skip-seed
if errorlevel 1 (
    echo.
    echo [ERROR] Database setup failed. Make sure Docker is running and Postgres is ready.
    pause
    exit /b 1
)
echo [OK] Database schema applied.

REM --- Regenerate Prisma client ---
echo [INFO] Regenerating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo [ERROR] Prisma client generation failed.
    pause
    exit /b 1
)
echo [OK] Prisma client generated.

REM --- Seed a single non-demo admin account (isDemo=false) ---
echo.
echo ============================================
echo  Seeding admin account (non-demo)...
echo ============================================
echo [INFO] Creating admin@demo.local (Password: Demo@2026, PIN: 1234) — this is NOT a demo account.
call npm run seed:admin
if errorlevel 1 (
    echo [WARN] Admin seed had an issue — continuing anyway.
)
echo [OK] Admin account ready.

REM --- Seed platform settings (budget ranges, chat config, greeting tiers) ---
REM Clean mode skips the demo seed, so these would otherwise be missing and the
REM chat (budget brackets, greetings) would fall back to bare defaults.
echo.
echo ============================================
echo  Seeding platform settings...
echo ============================================
echo [INFO] Budget ranges + chat config + greeting tiers (non-destructive)...
call npm run seed:settings
if errorlevel 1 (
    echo [WARN] Settings seed had an issue - continuing anyway.
)
echo [OK] Platform settings ready.
echo.

call npx ts-node-dev --respawn --transpile-only src/index.ts
pause
exit /b 0

REM ==========================================================
REM === FRONTEND ==============================================
REM ==========================================================
:frontend_only
cd /d "%~dp0frontend"
echo === Frontend setup ===

powershell -NoProfile -Command ^
  "if (!(Test-Path 'node_modules\.package-lock.json') -or ((Get-Item 'package-lock.json').LastWriteTime -gt (Get-Item 'node_modules\.package-lock.json').LastWriteTime)) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
    echo [MISSING] Installing frontend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Frontend npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [OK] Frontend dependencies present.
)

echo.
echo ==============================================
echo  Starting frontend dev server...
echo  http://localhost:4200
echo ==============================================
echo.

call npm start
pause
exit /b 0

REM ==========================================================
REM === ENV VARS CHECK =======================================
REM ==========================================================
:check_env
:check_env_retry
powershell -NoProfile -Command "$f='%~dp0backend\.env'; if(!(Test-Path $f)){Write-Host '[ERROR] backend\.env not found'; exit 1}; $e=@{}; gc $f | Where-Object {$_ -match '^[A-Z_]+=.'} | ForEach-Object {$p=$_ -split '=',2; $e[$p[0].Trim()]=$p[1].Trim()}; $req=@('DATABASE_URL','REDIS_URL','JWT_SECRET','REFRESH_SECRET','NODE_ENV','PORT'); $miss=$req | Where-Object {!$e[$_]}; if($miss){Write-Host ''; Write-Host '[ERROR] Missing or empty .env variables:'; $miss | ForEach-Object {Write-Host ('  - ' + $_)}; Write-Host ''; exit 1}; exit 0"
if not errorlevel 1 (
    echo [OK] All required .env vars present.
    exit /b 0
)
echo    Tip: run set-local-env.bat to restore non-secret values,
echo    then add any missing secrets ^(JWT_SECRET, REFRESH_SECRET^) to backend\.env manually.
echo.
choice /c RQ /n /m "Press R to retry, Q to quit: "
if errorlevel 2 exit /b 1
goto :check_env_retry
