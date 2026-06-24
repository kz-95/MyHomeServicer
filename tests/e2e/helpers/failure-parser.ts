import * as fs from 'fs';

export interface FailureInfo {
  scenarioId: string;
  testName: string;
  errorType: string;
  errorMessage: string;
  selector?: string;
  rootCause: string;
  fixSuggestion: string;
}

const KNOWN_PATTERNS: { re: RegExp; category: string; suggestion: string }[] = [
  { re: /Timeout.*\b(\d+ms)\b/, category: 'TIMEOUT', suggestion: 'Increase timeout or check if the page/component loaded. The selector may be incorrect or the DOM structure changed.' },
  { re: /locator\s*:\s*["'](.+?)["']/i, category: 'SELECTOR', suggestion: 'The selector did not match any element. Inspect the DOM at the failure point. Update the selector to match the current template.' },
  { re: /has-text\(["'](.+?)["']\)/, category: 'TEXT_SELECTOR', suggestion: 'The button/label text may differ from expected. Check the rendered HTML for the exact text content (including whitespace, arrow chars, emoji).' },
  { re: /Cannot read propert[ya]\s+['"]?(\w+)['"]?\s+of\s+(null|undefined)/, category: 'NULL_DEREF', suggestion: 'An API response field is missing or null. Verify the API returns the expected shape. Update frontend template to handle null safely.' },
  { re: /TypeError:\s*(.+)/, category: 'TYPE_ERROR', suggestion: 'A value has the wrong type. Check that API response fields match the frontend interface.' },
  { re: /Expected\s+(.+?)\s+to\s+be\s+(.+)/i, category: 'ASSERTION', suggestion: 'The expected condition was not met. Check the page state at the assertion point.' },
  { re: /404\s+.*?(\/api\/)/, category: 'API_404', suggestion: 'The API endpoint does not exist or returned 404. Check the route registration and URL.' },
  { re: /500\s+.*?(\/api\/)/, category: 'API_500', suggestion: 'The API endpoint returned a 500 error. Check backend logs for the exception stack trace.' },
  { re: /dialog\[open\]/, category: 'DIALOG_NOT_FOUND', suggestion: 'No open native <dialog> was found. The component may not use a native dialog element, or the selector is wrong.' },
  { re: /Socket/, category: 'SOCKET_ERROR', suggestion: 'Socket.io connection or event did not fire. Check that __SOCKET__ is exposed on window and the server room/namespace is correct.' },
  { re: /dispatch\.prompt/, category: 'DISPATCH_EVENT', suggestion: 'The dispatch.prompt socket event was not received. The servicer may not be online/available, or the dispatch logic did not select them.' },
  { re: /booking\.confirmed/, category: 'BOOKING_EVENT', suggestion: 'The booking.confirmed socket event was not received. The booking may not have been created, or the socket room join failed.' },
  { re: /no matching set/, category: 'NO_MATCHING', suggestion: 'The form state is not ready for the requested operation. A prior step may have failed silently.' },
];

export function parseFailureLog(logPath: string): FailureInfo | null {
  if (!fs.existsSync(logPath)) return null;
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  let scenarioId = '';
  let testName = '';
  let errorMessage = '';
  const errorLines: string[] = [];

  for (const line of lines) {
    const stepMatch = line.match(/STEP\s+\d+\s*[-]\s*(.+?)\s*\[/);
    if (stepMatch) testName = stepMatch[1].trim();

    const failMatch = line.match(/[\u2717]+\s+(.+?)(?::\s+(.+))?$/);
    if (failMatch) {
      const label = failMatch[1].trim();
      const detail = (failMatch[2] ?? '').trim();
      errorLines.push(`${label}: ${detail}`);
      if (!errorMessage) errorMessage = `${label}: ${detail}`;
    }

    const rootCauseMatch = line.match(/ROOT CAUSE:\s*(.+)/);
    if (rootCauseMatch) {
      scenarioId = rootCauseMatch[1].trim();
    }
  }

  if (!errorMessage) return null;

  scenarioId = scenarioId || (() => {
    const m = logPath.match(/scenario-(\d+)/);
    return m ? m[1] : '??';
  })();

  // Extract error type from message
  let errorType = 'UNKNOWN';
  let selector: string | undefined;
  let rootCause = '';
  let fixSuggestion = 'Review the scenario log and screenshots to determine the correct fix.';

  for (const pattern of KNOWN_PATTERNS) {
    const match = errorMessage.match(pattern.re);
    if (match) {
      errorType = pattern.category;
      rootCause = pattern.category;
      fixSuggestion = pattern.suggestion;
      if (pattern.re.toString().includes('locator') && match[1]) {
        selector = match[1];
      }
      break;
    }
  }

  return {
    scenarioId,
    testName,
    errorType,
    errorMessage: errorLines.join('; '),
    selector,
    rootCause: rootCause || errorType,
    fixSuggestion,
  };
}

export function formatFixerPrompt(failure: FailureInfo): string {
  return [
    `## Fixer Task: Scenario ${failure.scenarioId}`,
    '',
    `**Error:** ${failure.errorType}`,
    `**Message:** ${failure.errorMessage}`,
    failure.selector ? `**Selector:** \`${failure.selector}\`` : '',
    '',
    `**Root cause:** ${failure.rootCause}`,
    '',
    `**Suggested fix:** ${failure.fixSuggestion}`,
    '',
    '### Instructions',
    '',
    '1. Read the scenario log at `tests/e2e/logs/` to find the exact failure point.',
    '2. Look at screenshots captured at the failure step.',
    '3. Fix the underlying issue (DOM selector, API response, timing, or test logic).',
    '4. Run `npx tsc --noEmit` in the affected directory.',
    '5. Re-run the failing scenario.',
    '6. If it passes, commit with the scenario ID in the message.',
    '',
  ].filter(Boolean).join('\n');
}

export function scenarioPassed(logPath: string): boolean {
  if (!fs.existsSync(logPath)) return false;
  const content = fs.readFileSync(logPath, 'utf-8');
  return content.includes('0 failures') && !content.includes('ROOT CAUSE');
}
