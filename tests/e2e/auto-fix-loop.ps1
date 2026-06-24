# tests/e2e/auto-fix-loop.ps1
# Runs each E2E scenario, captures failures, writes .fixer-prompt.txt, waits for human fix, re-runs.
param(
  [string]$ScenarioPattern = "*",
  [int]$MaxRetries = 3,
  [string]$LogDir = "logs"
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$E2eDir = $PSScriptRoot
$FixerPromptFile = Join-Path $E2eDir ".fixer-prompt.txt"
$ScenarioDir = Join-Path $E2eDir "scenarios"

function Get-LatestRunDir {
  $dirs = Get-ChildItem -Path (Join-Path $E2eDir $LogDir) -Directory -Filter "e2e-qa-harness_*" | Sort-Object LastWriteTime -Descending
  if ($dirs) { return $dirs[0].FullName }
  return $null
}

function Get-FailingScenarios($runDir) {
  $failing = @()
  if (-not $runDir) { return $failing }
  Get-ChildItem -Path $runDir -Filter "scenario-*.log" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if ($content -match "FAIL" -or $content -match "ROOT CAUSE") {
      $scId = [regex]::Match($_.Name, '\d+').Value
      $failing += @{ Id = $scId; Path = $_.FullName }
    }
  }
  return $failing
}

function Write-FixerPrompt($failure) {
  $scId = $failure.Id
  $logContent = Get-Content $failure.Path -Raw

  # Extract error details
  $errorMsg = ""
  $stepName = ""
  if ($logContent -match '(?:✗|rootCause)\s*(.+?)(?::\s+(.+))?$') {
    $errorMsg = "$($Matches[1]): $($Matches[2])"
  }
  if ($logContent -match 'STEP\s+\d+\s*[-]\s*(.+?)\s*\[') {
    $stepName = $Matches[1].Trim()
  }

  $prompt = @"
## Fixer Task: Scenario $scId

**Step:** $stepName
**Error:** $errorMsg

**Instructions:**

1. Read the full log at `$($failure.Path)`.
2. Check screenshots in the run directory matching scenario $scId (`$((Get-LatestRunDir))\scenario-$scId-*.png`).
3. Fix the test at `tests/e2e/scenarios/$scId-*.spec.ts`.
4. Run `npx tsc --noEmit` in `tests/e2e/`.
5. Re-run: `npx playwright test "tests/e2e/scenarios/0$scId-*.spec.ts"`.
6. If green, commit as `fix(scenario-$scId): description`.

Common issues:
- Button text changed (→ emoji, case, whitespace) → update `has-text()`
- API field missing → check response shape, update test or backend
- Dispatch event not received → check isOnline/schedule setup
- Dialog not found → check component uses native `<dialog>`

UI DESIGN GUARDRAIL — DO NOT REVERT INTENTIONAL DESIGN
If the failure is a visual/layout mismatch (screenshot diff, wrong dimensions,
wrong text position, wrong button order):
- The current UI may have been intentionally redesigned.
- Do NOT revert the component code to match outdated test expectations.
- Update the test (selector, snapshot reference, expected text/order) instead.
- Only touch component code if it's a proven functional bug (broken interaction,
  missing data, crash), not a style/layout choice.
"
  $prompt | Out-File -FilePath $FixerPromptFile -Encoding utf8
  return $FixerPromptFile
}

function Invoke-Test($pattern) {
  Write-Host "`n=== Running: $pattern ===" -ForegroundColor Cyan
  $specs = Get-ChildItem -Path $ScenarioDir -Filter "$pattern" | ForEach-Object { $_.FullName }
  if ($specs.Count -eq 0) {
    Write-Host "No specs matching '$pattern'" -ForegroundColor Yellow
    return $true
  }
  $specList = $specs -join " "
  $result = & "npx" "playwright" "test" $specList "--reporter=list" 2>&1
  $exitCode = $LASTEXITCODE
  Write-Host ($result | Out-String)
  return $exitCode -eq 0
}

# --- Main loop ---
Write-Host "=== E2E Auto-Fix Loop ===" -ForegroundColor Magenta
Write-Host "Scenario pattern: $ScenarioPattern"
Write-Host "Max retries: $MaxRetries"
Write-Host ""

$allPassed = $true
$pending = @(Get-ChildItem -Path $ScenarioDir -Filter "$ScenarioPattern" | Sort-Object Name)

foreach ($spec in $pending) {
  $scId = [regex]::Match($spec.Name, '\d+').Value
  $pattern = $spec.Name
  $passed = $false
  $attempts = 0

  while (-not $passed -and $attempts -le $MaxRetries) {
    $attempts++
    Write-Host "`n--- Scenario $scId (attempt $attempts/$MaxRetries) ---" -ForegroundColor Green

    $ok = Invoke-Test $pattern
    if ($ok) {
      Write-Host "✓ Scenario $scId PASSED" -ForegroundColor Green
      $passed = $true
    } else {
      Write-Host "✗ Scenario $scId FAILED (attempt $attempts)" -ForegroundColor Red

      if ($attempts -le $MaxRetries) {
        $runDir = Get-LatestRunDir
        $failing = Get-FailingScenarios $runDir
        $failure = $failing | Where-Object { $_.Id -eq $scId } | Select-Object -First 1
        if (-not $failure) {
          Write-Host "No failure entry found in logs for scenario $scId" -ForegroundColor Yellow
          continue
        }

        $promptFile = Write-FixerPrompt $failure
        Write-Host "`nFixer prompt written to: $promptFile" -ForegroundColor Yellow
        Write-Host "`n=== WAITING FOR HUMAN FIX ===" -ForegroundColor Yellow
        Write-Host "Fix the issue, then press ENTER to re-run (or type 'skip' to skip, 'exit' to abort): " -ForegroundColor Yellow -NoNewline

        $input = Read-Host
        if ($input -eq 'exit') { exit 1 }
        if ($input -eq 'skip') { break }
      }
    }
  }

  if (-not $passed) {
    $allPassed = $false
    Write-Host "✗ Scenario $scId FAILED after $MaxRetries attempts" -ForegroundColor Red
  } else {
    Write-Host "✓ Scenario $scId PASSED" -ForegroundColor Green
  }
}

if ($allPassed) {
  Write-Host "`n=== ALL SCENARIOS PASSED ===" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n=== SOME SCENARIOS FAILED ===" -ForegroundColor Red
  exit 1
}
