@echo off
REM ============================================================================
REM  railway-dbreset.bat  --  DESTRUCTIVE reset + reseed of the Railway DEMO DB.
REM
REM  Drops ALL data, re-applies every migration, then reseeds demo data.
REM
REM  WHY NOT `railway run npm run db:reset`:
REM   - Railway injects the service's INTERNAL DATABASE_URL
REM     (postgres.railway.internal:5432), which is NOT reachable from a laptop
REM     -> prisma fails with P1001. So this script pulls the Postgres service's
REM     PUBLIC url and points prisma at that instead.
REM   - prisma migrate reset has no seed configured in package.json, so the seed
REM     is run explicitly afterwards.
REM
REM  PREREQ (one time): log in + link the CLI to the demo project:
REM      railway login
REM      railway link -p agile-cat -e production -s "My Home Servicer Demo"
REM
REM  NOTES:
REM   - DATABASE_URL is overridden in this shell; prisma's dotenv will NOT
REM     override an already-set env var, so the demo (not local) DB is used.
REM   - Other seed values (admin password, unlock phrase, etc.) come from
REM     backend\.env locally. Set them there if the demo needs specific values.
REM   - Edit DB_SERVICE / APP_SERVICE below if the Railway service names change.
REM
REM  WARNING: only ever run this against the DEMO project (agile-cat). Never prod.
REM ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0backend"

set "DB_SERVICE=Postgres Demo"

echo ============================================================
echo  RAILWAY DEMO DB RESET  (DESTRUCTIVE)
echo ============================================================
echo.

REM --- must be logged in -------------------------------------------------------
railway whoami >nul 2>&1
if errorlevel 1 (
  echo [X] Not logged in to Railway.  Run:  railway login
  exit /b 1
)

REM --- pull the PUBLIC postgres url (internal host is unreachable locally) ------
set "DATABASE_URL="
for /f "usebackq tokens=1* delims==" %%a in (`railway variables --service "%DB_SERVICE%" --kv 2^>nul ^| findstr /b "DATABASE_PUBLIC_URL="`) do set "DATABASE_URL=%%b"

if not defined DATABASE_URL (
  echo [X] Could not read DATABASE_PUBLIC_URL from the "%DB_SERVICE%" service.
  echo     Check:  railway status   ^(must be linked to project agile-cat^)
  echo     and that the Postgres service exposes a public networking URL.
  exit /b 1
)

REM Show only the host (after '@') so the password is never printed.
for /f "tokens=2 delims=@" %%h in ("!DATABASE_URL!") do set "DBHOST=%%h"
echo Target database host:  !DBHOST!
echo (This must be the DEMO Postgres - a *.proxy.rlwy.net / *.railway.app host.)
echo.
echo This WIPES ALL DATA on that database and reseeds demo data.
echo.

set "CONFIRM="
set /p CONFIRM="Type  RESET  to proceed (anything else aborts): "
if /I not "!CONFIRM!"=="RESET" (
  echo Aborted. Nothing was changed.
  exit /b 1
)

echo.
echo [1/2] Dropping + re-applying all migrations (skip-seed)...
call npx prisma migrate reset --force --skip-seed
if errorlevel 1 (
  echo [X] migrate reset FAILED - do NOT assume the DB is in a clean state.
  exit /b 1
)

echo.
echo [2/2] Seeding demo data...
call npm run seed
if errorlevel 1 (
  echo [X] Seed FAILED. Migrations applied but demo data missing - re-run:  npm run seed
  exit /b 1
)

echo.
echo [OK] Demo database reset + reseeded.
endlocal
