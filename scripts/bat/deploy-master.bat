@echo off
setlocal EnableDelayedExpansion
REM ============================================================================
REM  deploy-master.bat  --  verify, merge, push, and watch Railway deploy.
REM
REM  Flow:
REM    1. Check git is clean (no uncommitted changes)
REM    2. Verify TypeScript compiles (backend + frontend)
REM    3. Get source branch (current branch or first argument)
REM    4. Checkout master + pull latest
REM    5. Merge source branch into master
REM    6. Push master (triggers Railway auto-deploy)
REM    7. Show Railway deploy status
REM
REM  Usage:
REM    deploy-master.bat               merges the CURRENT branch into master
REM    deploy-master.bat feat/myfix    merges feat/myfix into master
REM
REM  PREREQ (one time):
REM    railway login
REM    railway link  (if not already linked)
REM ============================================================================
cd /d "%~dp0..\.."

echo.
echo ============================================================
echo  DEPLOY TO MASTER ^(Railway^)
echo ============================================================
echo.

REM ── 1. Git must be available ────────────────────────────────────────────────
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not available in this terminal.
    pause
    exit /b 1
)

REM ── 2. Get source branch ────────────────────────────────────────────────────
set "SOURCE="
if not "%~1"=="" (
    set "SOURCE=%~1"
    echo Source branch ^(from argument^): !SOURCE!
) else (
    for /f "tokens=*" %%b in ('git branch --show-current') do set "SOURCE=%%b"
    echo Source branch ^(current^): !SOURCE!
)
if "!SOURCE!"=="" (
    echo [ERROR] Could not determine source branch. Pass it as an argument:
    echo          deploy-master.bat feat/my-feature
    pause
    exit /b 1
)

REM ── 3. Warn if on master ────────────────────────────────────────────────────
if /i "!SOURCE!"=="master" (
    echo.
    echo [WARN] You are already on master. This script merges a branch INTO master.
    echo        To deploy current master without merging, skip to push.
    echo.
    choice /c MPQ /n /m "Push master as-is [P], or Quit [Q]? "
    if errorlevel 3 exit /b 1
    if errorlevel 2 exit /b 1
    REM errorlevel 1 = P - skip merge, go straight to push
    goto :push
)

REM ── 4. Check working tree is clean ──────────────────────────────────────────
echo.
echo [CHECK] Working tree status...
git diff-index --quiet HEAD --
if errorlevel 1 (
    echo.
    echo [WARN] Working tree is DIRTY - there are uncommitted changes.
    echo.
    choice /c CQ /n /m "Continue anyway [C], or Quit [Q]? "
    if errorlevel 2 exit /b 1
) else (
    echo [OK] Working tree clean.
)

REM ── 5. Verify TypeScript compiles ───────────────────────────────────────────
echo.
echo [CHECK] Backend TypeScript...
cd backend
call npx tsc --noEmit
if errorlevel 1 (
    echo.
    echo [ERROR] Backend TypeScript has errors - fix them before deploying.
    cd ..
    pause
    exit /b 1
)
echo [OK] Backend tsc passed.
cd ..

echo [CHECK] Frontend TypeScript...
cd frontend
call npx tsc --noEmit
if errorlevel 1 (
    echo.
    echo [ERROR] Frontend TypeScript has errors - fix them before deploying.
    cd ..
    pause
    exit /b 1
)
echo [OK] Frontend tsc passed.
cd ..

REM ── 6. Checkout master + pull ───────────────────────────────────────────────
echo.
echo [GIT] Switching to master...
git checkout master
if errorlevel 1 (
    echo [ERROR] Failed to checkout master.
    pause
    exit /b 1
)

echo [GIT] Pulling latest master...
git pull origin master
if errorlevel 1 (
    echo [ERROR] Failed to pull master. Resolve conflicts or check network.
    git checkout !SOURCE!
    pause
    exit /b 1
)
echo [OK] Master is up to date.

REM ── 7. Merge source branch ──────────────────────────────────────────────────
echo.
echo [GIT] Merging !SOURCE! into master...
git merge !SOURCE!
if errorlevel 1 (
    echo.
    echo [ERROR] Merge conflict or failure.
    echo        Run: git merge --abort   to undo the merge attempt.
    echo        Resolve conflicts manually, then re-run this script or push.
    pause
    exit /b 1
)
echo [OK] Merge succeeded.

REM ── 8. Push master ──────────────────────────────────────────────────────────
:push
echo.
echo [GIT] Pushing master to origin...
git push origin master
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Check network or remote permissions.
    echo        Your merge is committed locally but NOT pushed.
    pause
    exit /b 1
)
echo [OK] Push succeeded - Railway will auto-deploy.

REM ── 9. Railway status ──────────────────────────────────────────────────────
echo.
echo ============================================================
echo  Railway Deploy Status
echo ============================================================
echo.

railway whoami >nul 2>&1
if errorlevel 1 (
    echo [INFO] Railway CLI not logged in. Run `railway login` to check status.
    echo        The deploy will happen automatically - check:
    echo        https://myhomeservicerdemo.up.railway.app
    goto :done
)

echo Recent deployments:
railway deployment list 2>nul | findstr /v "──" | findstr /v "Recent"
echo.
echo Watching deploy (press Ctrl+C to stop)...
echo.
railway status 2>nul | findstr "status"

:done
echo.
echo ============================================================
echo  DONE - Deployed to https://myhomeservicerdemo.up.railway.app
echo ============================================================
echo.
pause
endlocal
exit /b 0
