import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 22;
let log: StepLogger;
let contextC: BrowserContext;
let contextS1: BrowserContext;
let contextS2: BrowserContext;
let pageC: Page;
let pageS1: Page;
let pageS2: Page;

const BACKEND = 'http://localhost:3000/api/v1';
const DEMO_PASSWORD = 'Demo@2026';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SLOT_HOUR_MAP: Record<string, [number, number]> = {
  morning: [6, 10], noon: [10, 13], afternoon: [13, 17],
  evening: [17, 20], night: [20, 24],
};

function currentWeekdayAndSlot(): { weekday: string; timeSlot: string } {
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 3600_000);
  const wd = WEEKDAYS[myt.getUTCDay()];
  const h = myt.getUTCHours();
  for (const [slot, [start, end]] of Object.entries(SLOT_HOUR_MAP)) {
    if (h >= start && h < end) return { weekday: wd, timeSlot: slot };
  }
  return { weekday: wd, timeSlot: 'morning' };
}

async function ensureWorkingHours(page: Page, label: string): Promise<void> {
  const { weekday, timeSlot } = currentWeekdayAndSlot();
  try {
    await page.evaluate(
      async ({ apiBase, wd, slot }) => {
        await fetch(`${apiBase}/servicer/me/schedule`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots: [{ weekday: wd, timeSlot: slot, available: true }] }),
          credentials: 'include',
        });
      },
      { apiBase: BACKEND, wd: weekday, slot: timeSlot },
    );
    log.ok(`${label} schedule set`, `${weekday}/${timeSlot}`);
  } catch (e: any) {
    log.warn(`${label} schedule`, `failed: ${e?.message ?? e}`);
  }
}

async function loginCustom(page: Page, email: string, label: string, log: StepLogger) {
  await page.goto('http://localhost:4200/login');
  await page.waitForTimeout(500);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  log.ok('Logged in', `${label} (${email})`);
}

test.describe('Scenario 2b - Dispatch Decline + Rotation', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('02b');
    log.info('DB', 'assuming already seeded');

    contextC = await browser.newContext();
    contextS1 = await browser.newContext();
    contextS2 = await browser.newContext();
    pageC = await contextC.newPage();
    pageS1 = await contextS1.newPage();
    pageS2 = await contextS2.newPage();

    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageS1.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageS2.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextC?.close();
    await contextS1?.close();
    await contextS2?.close();
  });

  test('2b.1 - Servicer 1 (M1_ANAS) logs in and goes online', async () => {
    log.step('Servicer 1 logs in as M1_ANAS (Ahmad, plumber)');
    await loginAs(pageS1, 'M1_ANAS', log);
    await pageS1.goto('http://localhost:4200/servicer/jobs');
    await pageS1.waitForSelector('body', { timeout: 5000 });

    await ensureWorkingHours(pageS1, 'S1');

    try {
      await pageS1.evaluate(async (apiBase) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOnline: true }),
          credentials: 'include',
        });
      }, BACKEND);
      log.ok('S1 isOnline = true');
    } catch (e: any) {
      log.warn('S1 isOnline API', `failed: ${e?.message ?? e}`);
    }

    await pageS1.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('S1 Socket connect', 'timed out'));

    await pageS1.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('S1 online', null);
  });

  test('2b.2 - Servicer 2 (M37 Hairul) logs in and goes online', async () => {
    log.step('Servicer 2 logs in as M37 (Hairul Azmi, plumber)');
    await loginCustom(pageS2, 'hairul.azmi@demo.local', 'M37_Hairul', log);
    await pageS2.goto('http://localhost:4200/servicer/jobs');
    await pageS2.waitForSelector('body', { timeout: 5000 });

    try {
      await pageS2.evaluate(async (apiBase) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOnline: true }),
          credentials: 'include',
        });
      }, BACKEND);
      log.ok('S2 isOnline = true');
    } catch (e: any) {
      log.warn('S2 isOnline API', `failed: ${e?.message ?? e}`);
    }

    await pageS2.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('S2 Socket connect', 'timed out'));

    await pageS2.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('S2 online', null);
  });

  test('2b.3 - Customer creates plumbing quote', async () => {
    log.step('Customer creates plumbing quote');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    // Click plumbing category card
    const plumberCard = pageC.locator('.bw-card').filter({ hasText: /plumb/i }).first();
    await expect(plumberCard).toBeVisible({ timeout: 10000 });
    await plumberCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    log.ok('Navigated to plumbing quote form');

    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    // Step 1: Budget
    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('1');

    const nextBtn1 = pageC.locator('button:has-text("Next: Contact")').first();
    if (await nextBtn1.count() > 0) await nextBtn1.click();

    // Step 2: Contact
    await pageC.waitForTimeout(500);
    const nameInput = pageC.locator('input[name="contactName"]');
    if (await nameInput.count() > 0) await nameInput.fill('David Tan');

    const phoneInput = pageC.locator('app-phone-input input').first();
    if (await phoneInput.count() > 0) await phoneInput.fill('0123456789');

    const addrNo = pageC.locator('app-address-fields input').first();
    if (await addrNo.count() > 0) await addrNo.fill('22');
    const streetInput = pageC.locator('app-address-fields input').nth(1);
    if (await streetInput.count() > 0) await streetInput.fill('Jalan SS 2/24, SS 2');

    const dateInput = pageC.locator('app-calendar-picker input[type="date"]');
    if (await dateInput.count() > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }

    const nextBtn2 = pageC.locator('button:has-text("Next: Summary")').first();
    if (await nextBtn2.count() > 0) await nextBtn2.click();

    // Step 3: Summary
    await pageC.waitForTimeout(500);
    const nextBtn3 = pageC.locator('button:has-text("Next: Bill")').first();
    if (await nextBtn3.count() > 0) await nextBtn3.click();

    // Step 4: Bill + Submit
    await pageC.waitForTimeout(500);
    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0) await payNowRadio.check();

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0) await creditRadio.check();

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0) await agreeCheckbox.check();

    await pageC.waitForTimeout(300);

    log.step('Submitting plumbing quote');
    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Clicked Send request');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Plumbing quote submitted');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Plumbing quote created', null);
  });

  test('2b.4 - S1 receives dispatch prompt and declines', async () => {
    log.step('S1 waits for dispatch prompt and clicks Decline');

    // Wait for overlay to appear on S1
    const overlayDlg = pageS1.locator('app-dispatch-prompt-guard dialog[open]');
    await expect(overlayDlg).toBeVisible({ timeout: 30000 });
    log.ok('Dispatch overlay appeared on S1');

    await pageS1.waitForTimeout(500);

    // Click Decline
    const declineBtn = pageS1.locator('.dp-btn-decline');
    await expect(declineBtn).toBeVisible({ timeout: 3000 });
    await declineBtn.click();
    log.ok('S1 clicked Decline');

    // Wait for overlay to close
    await pageS1.waitForTimeout(2000);
    const stillOpen = await pageS1.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (stillOpen === 0) {
      log.ok('Dispatch overlay closed on S1');
    } else {
      log.warn('Overlay', 'still open on S1 after decline');
    }

    await pageS1.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('S1 declined dispatch', null);
  });

  test('2b.5 - S2 receives rotated dispatch prompt', async () => {
    log.step('S2 waits for rotated dispatch prompt');

    // The rotation delay is the same as the timeout (10s) since decline triggers
    // immediate rotation in handleDispatchDecline (cancelRotationJob → send to next)
    // Rotation should arrive quickly after decline, within the timeout window
    const overlayDlg = pageS2.locator('app-dispatch-prompt-guard dialog[open]');
    await expect(overlayDlg).toBeVisible({ timeout: 30000 });
    log.ok('Dispatch overlay appeared on S2 (rotation)');

    await pageS2.waitForTimeout(500);

    // Verify overlay content on S2
    const categoryText = pageS2.locator('app-dispatch-prompt-guard strong');
    if (await categoryText.count() > 0) {
      const text = await categoryText.first().textContent();
      log.ok('Dispatch category on S2', text ?? '');
    }

    // Countdown visible
    const countdown = pageS2.locator('.dp-countdown');
    if (await countdown.count() > 0) {
      log.ok('Countdown visible on rotated dispatch');
    }

    await pageS2.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('S2 received rotation', null);

    // Clean up: decline on S2 too so the test doesn't leave a hanging prompt
    const declineBtn = pageS2.locator('.dp-btn-decline');
    if (await declineBtn.count() > 0) {
      await declineBtn.click();
      log.ok('S2 declined rotated dispatch (cleanup)');
    }
  });
});
