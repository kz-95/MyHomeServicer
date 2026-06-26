@echo off
setlocal

REM Change to project root so docker-compose.yml is found
cd /d "%~dp0..\.."

REM ==========================================================
REM === Dispatch =============================================
REM ==========================================================
if "%~1"=="" goto :main
if /i "%~1"=="reset"         goto :main
if /i "%~1"=="backend_only"  goto :backend_only
if /i "%~1"=="frontend_only" goto :frontend_only
echo Unknown argument: %~1
echo Usage: Run.bat [reset^|backend_only^|frontend_only]
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
echo  MyHomeService — Full-stack Launcher
echo ============================================
set "RESETARG="
if /i "%~1"=="reset" (
    set "RESETARG=reset"
    echo [MODE] Forced DB reset requested - will wipe + reseed.
)
call :ensure_infra
if errorlevel 1 exit /b 1

echo.
echo Launching Frontend + Backend in separate terminals...
echo.
start "Backend"  cmd /k call "%~f0" backend_only %RESETARG%
timeout /t 3 >nul
start "Frontend" cmd /k call "%~f0" frontend_only
echo.
echo Waiting for frontend to build, then opening browser...
echo.
powershell -NoProfile -Command ^
  "$u='http://localhost:4200'; $n=0; ^
   do { ^
     try { ^
       $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 3; ^
       if ($r.StatusCode -eq 200) { ^
         Start-Process $u; ^
         Write-Host 'Frontend ready! Browser opened: http://localhost:4200'; ^
         break ^
       } ^
     } catch {} ^
     $n++; ^
     if ($n -ge 90) { ^
       Write-Host ''; ^
       Write-Host 'Frontend did not respond after ~3 min - open http://localhost:4200 manually once it builds.'; ^
       break ^
     } ^
     Write-Host '.' -NoNewline; ^
     Start-Sleep -Seconds 2 ^
   } while ($true)"
echo.
echo Both terminals are running. Close them to stop the servers.
exit /b 0

REM ==========================================================
REM === BACKEND ==============================================
REM ==========================================================
:backend_only
cd /d "%~dp0..\..\backend"

set "DO_RESET="
if /i "%~2"=="reset" set "DO_RESET=1"

REM --- .env check ---
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

REM --- Free Prisma engine lock: kill ONLY the process on backend port 3000 ---
REM    (a running backend holds query_engine-windows.dll.node; nuking all node
REM     would also kill unrelated terminals/automation and corrupt a live seed)
echo [CLEAN] Releasing port 3000 if a previous backend is still running...
call :kill_port 3000
REM Give Windows a moment to release the query-engine DLL file handle
timeout /t 2 >nul

REM --- Ensure Prisma client exists / is current (idempotent; fixes "Cannot find
REM     module .prisma/client/default"). Retry once if the DLL was still locked. ---
echo [PRISMA] Generating Prisma client...
call npx prisma generate
if errorlevel 1 (
    echo [WARN] prisma generate failed once ^(DLL may still be locked^). Retrying...
    timeout /t 3 >nul
    call npx prisma generate
    if errorlevel 1 (
        echo [ERROR] prisma generate failed. Close any node/backend holding the engine, then re-run.
        pause
        exit /b 1
    )
)

REM --- Guard: fail fast if any tracked JSON/TS has a UTF-8 BOM (crashes Node JSON.parse) ---
echo [CHECK] Scanning tracked json/ts files for UTF-8 BOM...
call node "%~dp0..\check-no-bom.mjs"
if errorlevel 1 (
    echo.
    echo [ERROR] A tracked file has a UTF-8 BOM and will crash the backend. Strip it (see message above) then re-run.
    pause
    exit /b 1
)

REM --- Database: full reset only when forced (Run.bat reset) or when DB is empty.
REM     Otherwise apply pending migrations non-destructively and keep existing data. ---
echo.
echo ============================================
echo  Preparing database...
echo ============================================

if defined DO_RESET (
    echo [DB] Forced reset - wiping + reseeding...
    call npm run db:reset
    if errorlevel 1 goto :db_fail
    goto :db_done
)

REM Apply migrations without dropping data (also creates tables on a fresh DB) + regen client
call npm run db:deploy
if errorlevel 1 goto :db_fail

REM Probe whether the DB has been seeded (row count in the users table, via the
REM app's own Prisma client so it hits the real DATABASE_URL). Prints a number or ERR.
set "USERCOUNT="
for /f "usebackq delims=" %%C in (`node "%~dp0..\check-db-seeded.cjs" 2^>nul`) do set "USERCOUNT=%%C"
if defined USERCOUNT set "USERCOUNT=%USERCOUNT: =%"

if not defined USERCOUNT (
    echo [DB] Could not read DB state - reseeding fresh...
    call npm run db:reset
    if errorlevel 1 goto :db_fail
) else if /i "%USERCOUNT%"=="ERR" (
    echo [DB] Could not read DB state - reseeding fresh...
    call npm run db:reset
    if errorlevel 1 goto :db_fail
) else if "%USERCOUNT%"=="0" (
    echo [DB] Database empty - seeding...
    call npm run seed
    if errorlevel 1 goto :db_fail
) else (
    echo [OK] Database already seeded ^(%USERCOUNT% users^) - keeping data. Use "Run.bat reset" to wipe.
)

:db_done
echo [OK] Database ready.

echo.
echo ============================================
echo  Starting backend server...
echo  http://localhost:3000
echo ============================================
echo.
call npx ts-node-dev --respawn --transpile-only src/index.ts
pause
exit /b 0

:db_fail
echo.
echo [ERROR] Database setup failed. Make sure Docker is running and Postgres is ready.
pause
exit /b 1

REM ==========================================================
REM === FRONTEND =============================================
REM ==========================================================
:frontend_only
cd /d "%~dp0..\..\frontend"
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
powershell -NoProfile -Command "$f='%~dp0..\..\backend\.env'; if(!(Test-Path $f)){Write-Host '[ERROR] backend\.env not found'; exit 1}; $e=@{}; gc $f | Where-Object {$_ -match '^[A-Z_]+=.'} | ForEach-Object {$p=$_ -split '=',2; $e[$p[0].Trim()]=$p[1].Trim()}; $req=@('DATABASE_URL','REDIS_URL','JWT_SECRET','REFRESH_SECRET','NODE_ENV','PORT'); $miss=$req | Where-Object {!$e[$_]}; if($miss){Write-Host ''; Write-Host '[ERROR] Missing or empty .env variables:'; $miss | ForEach-Object {Write-Host ('  - ' + $_)}; Write-Host ''; exit 1}; exit 0"
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

REM ==========================================================
REM === Kill the LISTENING process on a given port ===========
REM ==========================================================
:kill_port
setlocal enabledelayedexpansion
set "_KP=%~1"
set "_HIT="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%_KP% " ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        echo   Killing PID %%P on port %_KP% ...
        taskkill /F /PID %%P >nul 2>&1
        set "_HIT=1"
    )
)
if not defined _HIT echo   Nothing listening on port %_KP%.
endlocal
exit /b 0
