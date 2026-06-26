// tests/e2e/scripts/summarize.js
// Reads the latest harness log directory, extracts failures,
// writes failure-summary.json for the /e2e-fix pipeline.
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');
const OUTPUT_FILE = path.join(LOGS_DIR, 'failure-summary.json');

function findLatestRunDir() {
  if (!fs.existsSync(LOGS_DIR)) return null;
  const dirs = fs.readdirSync(LOGS_DIR)
    .filter(d => d.startsWith('e2e-qa-harness_') || d.startsWith('e2e-default'))
    .map(d => path.join(LOGS_DIR, d))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || null;
}

function parseLogFile(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  let scenarioId = '';
  let testName = '';
  let errorMessage = '';
  let stepCount = 0;
  let failureCount = 0;
  let warningCount = 0;
  const errorLines = [];
  const stepErrors = [];

  // Extract scenario ID from filename: scenario-01.log → "01"
  const nameMatch = path.basename(logPath).match(/scenario-(\d+)/);
  if (nameMatch) scenarioId = nameMatch[1];

  for (const line of lines) {
    // Step header
    const stepMatch = line.match(/STEP\s+(\d+)\s*[-]\s*(.+?)\s*\[/);
    if (stepMatch) {
      stepCount++;
      testName = stepMatch[2].trim();
    }

    // Failure entries
    const failMatch = line.match(/[\u2717]\s+(.+)$/);
    if (failMatch) {
      failureCount++;
      const msg = failMatch[1].trim();
      errorLines.push(msg);
      if (!errorMessage) errorMessage = msg;
      stepErrors.push({ step: stepCount, stepName: testName, error: msg });
    }

    // Warning entries
    if (line.match(/[\u26A0]\s+/)) {
      warningCount++;
    }

    // Root cause
    const rcMatch = line.match(/ROOT CAUSE:\s*(.+)/);
    if (rcMatch) {
      // Attach to last step error
      if (stepErrors.length > 0) {
        stepErrors[stepErrors.length - 1].rootCause = rcMatch[1].trim();
      }
    }

    // Summary line
    const sumMatch = line.match(/SUMMARY:\s*(\d+)\s*steps?,\s*(\d+)\s*failures?,\s*(\d+)\s*warnings?/);
    if (sumMatch) {
      stepCount = parseInt(sumMatch[1]) || stepCount;
      failureCount = parseInt(sumMatch[2]) || failureCount;
      warningCount = parseInt(sumMatch[3]) || warningCount;
    }
  }

  // Determine if passed
  const passed = failureCount === 0;

  return {
    scenarioId,
    passed,
    stepCount,
    failureCount,
    warningCount,
    errorMessage: errorMessage || (passed ? 'All steps passed' : 'Unknown error'),
    stepErrors,
    logPath,
  };
}

function classifyError(errorMessage) {
  const patterns = [
    { re: /Screenshot|snapshot.*diff|image.*comparison/i, cat: 'SCREENSHOT_DIFF' },
    { re: /Timeout.*\d+ms/i, cat: 'TIMEOUT' },
    { re: /locator\s*:\s*["'].+?["']/i, cat: 'SELECTOR' },
    { re: /has-text/i, cat: 'TEXT_SELECTOR' },
    { re: /Cannot read propert/i, cat: 'NULL_DEREF' },
    { re: /TypeError/i, cat: 'TYPE_ERROR' },
    { re: /Expected\s+.+?\s+to\s+be\s+/i, cat: 'ASSERTION' },
    { re: /404\s+.*?\/api\//i, cat: 'API_404' },
    { re: /500\s+.*?\/api\//i, cat: 'API_500' },
    { re: /dialog\[open\]/i, cat: 'DIALOG_NOT_FOUND' },
    { re: /Socket/i, cat: 'SOCKET_ERROR' },
    { re: /dispatch\.prompt/i, cat: 'DISPATCH_EVENT' },
    { re: /booking\.confirmed/i, cat: 'BOOKING_EVENT' },
  ];
  for (const p of patterns) {
    if (p.re.test(errorMessage)) return p.cat;
  }
  return 'UNKNOWN';
}

function main() {
  const runDir = findLatestRunDir();
  if (!runDir) {
    console.log(JSON.stringify({ error: 'No harness log directory found', scenarios: [] }, null, 2));
    process.exit(1);
  }

  console.error(`[summarize] Reading logs from: ${runDir}`);

  const logFiles = fs.readdirSync(runDir)
    .filter(f => f.match(/^scenario-\d+.*\.log$/))
    .sort();

  const scenarios = [];
  for (const logFile of logFiles) {
    const result = parseLogFile(path.join(runDir, logFile));
    if (result) {
      result.errorCategory = classifyError(result.errorMessage);
      scenarios.push(result);
    }
  }

  // Also check Playwright test-results for additional failures
  const testResultsDir = path.join(__dirname, '..', 'test-results');
  let playwrightFailures = [];
  if (fs.existsSync(testResultsDir)) {
    const entries = fs.readdirSync(testResultsDir, { withFileTypes: true });
    playwrightFailures = entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  }

  const summary = {
    runDir,
    generatedAt: new Date().toISOString(),
    totalScenarios: scenarios.length,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    playwrightFailures,
    scenarios,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ok: true, output: OUTPUT_FILE, ...summary }, null, 2));
}

main();
