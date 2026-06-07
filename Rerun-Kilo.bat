@echo off
title Kilo CEO Orchestrator Dual Runner

REM =====================================
REM Change to repo root
REM =====================================
cd /d "%~dp0"

REM =====================================
REM Runner 1 — Executive (CEO Orchestrator)
REM =====================================
start "Kilo Executive" powershell -NoExit -ExecutionPolicy Bypass -Command ^
"cd '%~dp0'; ^
Write-Host '==============================='; ^
Write-Host ' WINDOW 1 - EXECUTIVE (PRIMARY)'; ^
Write-Host ' Session was corrupted on terminal'; ^
Write-Host ' Continuing execution here'; ^
Write-Host ' Parallel brainstormer is active'; ^
Write-Host '==============================='; ^
Write-Host ''; ^
$p='The previous session terminal got corrupted and we lost the interactive context. Continue here as the CEO orchestrator - you are the primary executive. A parallel brainstormer instance is running alongside you. Review TODO.md and drive the project forward.'; ^
kilo --agent ceo-orchestrator --prompt $p"

REM =====================================
REM Runner 2 — Brainstormer (Parallel)
REM =====================================
start "Kilo Brainstormer" powershell -NoExit -ExecutionPolicy Bypass -Command ^
"cd '%~dp0'; ^
Write-Host '==============================='; ^
Write-Host ' WINDOW 2 - BRAINSTORMER'; ^
Write-Host ' Session was corrupted on terminal'; ^
Write-Host ' Mirroring CEO decisions'; ^
Write-Host ' Executing tasks in parallel'; ^
Write-Host '==============================='; ^
Write-Host ''; ^
$p='The previous session terminal got corrupted and we lost the interactive context. Continue here as the parallel brainstormer - mirror the executive CEO orchestrator, execute delegated tasks, and feed results back. Another CEO instance is active.'; ^
kilo --agent ceo-orchestrator --prompt $p"
