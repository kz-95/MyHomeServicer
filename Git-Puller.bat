@echo off
title Git Auto Sync / Setup (Safe)

echo ============================
echo      Git Auto Tool
echo ============================
echo.

if exist ".git" (
    echo Updating existing repo...
    git pull
    pause
    exit /b
)

echo No git repo detected.
echo.

set /p REPO_URL=Repo URL: 
set /p FOLDER=Folder name (optional): 

if "%FOLDER%"=="" (
    git clone %REPO_URL%
) else (
    git clone %REPO_URL% %FOLDER%
)

echo Done.
pause