@echo off
setlocal enabledelayedexpansion

set "PORT=%~1"
if "%PORT%"=="" set /p "PORT=Enter port to kill: "

if "%PORT%"=="" (
    echo No port entered.
    goto :end
)

set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    if not "%%P"=="0" (
        echo Killing PID %%P on port %PORT% ...
        taskkill /F /PID %%P >nul 2>&1
        if !errorlevel! equ 0 (
            echo   Killed PID %%P.
            set "FOUND=1"
        ) else (
            echo   Failed to kill PID %%P.
        )
    )
)

if not defined FOUND echo Nothing listening on port %PORT%.

:end
endlocal
pause
