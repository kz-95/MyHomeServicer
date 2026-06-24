// tests/e2e/helpers/auth-helpers.ts
import { Page, BrowserContext } from '@playwright/test';

const BASE = 'http://localhost:4200';
const DEMO_PASSWORD = 'Demo@2026';

const DEMO_USERS: Record<string, { email: string; role: string }> = {
  C_FRESH:  { email: 'david.tan@demo.local', role: 'customer' },
  C_ACTIVE: { email: 'david.tan@demo.local', role: 'customer' },
  C_LOYAL:  { email: 'david.tan@demo.local', role: 'customer' },
  M1_ANAS:  { email: 'ahmad.bin.ismail@demo.local', role: 'servicer' },
  M2_WEI:   { email: 'kumar.selvam@demo.local', role: 'servicer' },
  M3_RAJ:   { email: 'ravi.chandran@demo.local', role: 'servicer' },
  M4_AMY:   { email: 'nurul.aini@demo.local', role: 'servicer' },
  ADMIN:    { email: 'admin@demo.local', role: 'admin' },
};

export async function loginAs(
  page: Page,
  userKey: string,
  log: { ok: (l: string, d?: string) => void; fail: (l: string, d?: string) => void }
): Promise<void> {
  const user = DEMO_USERS[userKey];
  if (!user) { log.fail('Unknown user', userKey); return; }

  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(500);

  // Fill login form. The email input uses name="email", not type="email"
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);

  // Handle possible demo PIN prompt
  const pinDialog = page.locator('text=Enter your PIN, app-pin-prompt');
  if (await pinDialog.count() > 0) {
    log.ok('PIN prompt', 'dismissing');
    // Try to dismiss/close the PIN prompt
    const pinClose = page.locator('app-pin-prompt button, dialog button:has-text("Cancel"), button:has-text("Close")').first();
    if (await pinClose.count() > 0) await pinClose.click();
    await page.waitForTimeout(300);
  }

  // Click "Sign in" button (NOT type="submit" - it's a click-handler button)
  await page.click('button:has-text("Sign in")');

  // Wait for redirect (nav away from /login)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  log.ok('Logged in', `${userKey} (${user.role})`);
}

export async function logout(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  // Click logout if navbar has it, otherwise just clear state
  const logoutBtn = page.locator('text=Logout, text=Sign out, button:has-text("Log")');
  if (await logoutBtn.count() > 0) await logoutBtn.first().click();
}

export function getScreenshotPath(scenarioId: number, stepNum: number): string {
  const runDir = process.env.E2E_RUN_DIR || 'logs/e2e-default';
  return `${runDir}/scenario-${String(scenarioId).padStart(2, '0')}-step-${String(stepNum).padStart(2, '0')}.png`;
}
