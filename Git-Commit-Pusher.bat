@echo off
title Git Commit ^& Push Tool
setlocal

REM ===========================================================================
REM  Git Commit + Push Tool  (human + agent friendly)
REM
REM  HUMAN (interactive):   Git-Commit-Pusher.bat
REM      -> prompts for a commit message, commits, rebases, pushes current branch.
REM
REM  AGENT (non-interactive):
REM      Git-Commit-Pusher.bat "commit message"
REM          -> commits + pushes the CURRENT branch, no prompts, no pause.
REM      Git-Commit-Pusher.bat "commit message" kilo/backend-epic
REM          -> switches to (or creates) that branch first, then commits + pushes.
REM
REM  Parallel rule: each agent works on its OWN branch (see orchestration-plan.md
REM  section 4). Pass your branch as arg 2 the first time to create it.
REM ===========================================================================

if not exist ".git" goto :norepo

set "MSG=%~1"
set "TARGET=%~2"

if "%MSG%"=="" set /p MSG=Enter commit message:
if "%MSG%"=="" goto :nomsg

REM --- Optional: switch to / create the agent's own branch ---
if not "%TARGET%"=="" (
    git checkout "%TARGET%" 2>nul || git checkout -b "%TARGET%"
)

for /f "delims=" %%b in ('git branch --show-current') do set "BRANCH=%%b"
echo.
echo Branch: %BRANCH%

echo Staging changes...
git add -A

echo Committing...
git commit -m "%MSG%"

REM --- Rebase on the remote branch first so concurrent pushes don't get rejected.
REM     Skipped automatically for a brand-new branch not yet on the remote. ---
git ls-remote --exit-code --heads origin "%BRANCH%" >nul 2>&1 && (
    echo Syncing with remote ^(pull --rebase^)...
    git pull --rebase origin "%BRANCH%"
) || (
    echo New branch - no remote yet, skipping pull.
)
if errorlevel 1 goto :conflict

echo Pushing to origin/%BRANCH%...
git push -u origin "%BRANCH%"
if errorlevel 1 goto :pushfail

echo.
echo Done.
if "%~1"=="" pause
exit /b 0

:conflict
echo.
echo *** Rebase hit conflicts. Resolve them, then re-run. NOTHING was pushed. ***
if "%~1"=="" pause
exit /b 1

:pushfail
echo.
echo *** Push failed. Pull/rebase and retry, or check your remote/branch. ***
if "%~1"=="" pause
exit /b 1

:norepo
echo ERROR: No git repository found. Run this inside the project folder.
if "%~1"=="" pause
exit /b 1

:nomsg
echo ERROR: empty commit message.
if "%~1"=="" pause
exit /b 1
