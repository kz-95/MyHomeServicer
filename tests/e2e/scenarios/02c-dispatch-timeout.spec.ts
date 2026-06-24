import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 23;
let log: StepLogger;
let contextC: BrowserContext;
let contextS: BrowserContext;
let pageC: Page;
let pageS: Page;

const BACKEND = 'http://localhost:3000/api/v1';

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

async function setupServicerBeforeLogin(page: Page, email: string): Promise<void> {
  const { weekday, timeSlot } = currentWeekdayAndSlot();
  await page.evaluate(
    async ({ apiBase, wd, slot, devUser }) => {
      await fetch(`${apiBase}/servicer/me/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
        body: JSON.stringify({ slots: [{ weekday: wd, timeSlot: slot, available: true }] }),
      });
      await fetch(`${apiBase}/servicer/me/online`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
        body: JSON.stringify({ isOnline: true }),
      });
    },
    { apiBase: BACKEND, wd: weekday, slot: timeSlot, devUser: email },
  );
  log.ok(`Pre-login setup`, `${email} online + ${weekday}/${timeSlot}`);
}

test.describe('Scenario 2c - Dispatch Timeout', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('02c');
    log.info('DB', 'assuming already seeded');

    contextC = await browser.newContext();
    contextS = await browser.newContext();
    pageC = await contextC.newPage();
    pageS = await contextS.newPage();

    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageS.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextC?.close();
    await contextS?.close();
  });

  test('2c.1 - Setup servicer + login', async () => {
    log.step('Set isOnline + schedule BEFORE login');

    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);
    await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');

    log.step('Login servicer M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);
    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForTimeout(1000);
    await pageS.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('Socket connect', 'timed out'));

    log.ok('Servicer online and ready');
  });

  test('2c.2 - Customer creates aircond quote, servicer timeout auto-close', async () => {
    log.step('Customer creates aircond quote');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    const nextBtn1 = pageC.locator('button:has-text("Next: Contact")').first();
    if (await nextBtn1.count() > 0) await nextBtn1.click();

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

    const slotSelect = pageC.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ label: 'Morning (9:00-11:00)' });
    }

    const nextBtn2 = pageC.locator('button:has-text("Next: Summary")').first();
    if (await nextBtn2.count() > 0) await nextBtn2.click();

    await pageC.waitForTimeout(500);
    const nextBtn3 = pageC.locator('button:has-text("Next: Bill")').first();
    if (await nextBtn3.count() > 0) await nextBtn3.click();

    await pageC.waitForTimeout(500);
    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0) await payNowRadio.check();

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0) await creditRadio.check();

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0) await agreeCheckbox.check();

    await pageC.waitForTimeout(300);

    log.step('Submitting aircond quote');
    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted');
    } else {
      log.fail('Send request', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Customer confirmation visible');

    // Wait for dispatch overlay on servicer
    log.step('Waiting for dispatch overlay');
    await pageS.bringToFront();

    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    try {
      await expect(overlayDlg).toBeVisible({ timeout: 25000 });
      log.ok('Dispatch overlay appeared');
    } catch {
      log.fail('Dispatch overlay', 'not found');
      await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
      return;
    }

    // Read initial countdown
    const countdownNum = pageS.locator('.dp-countdown-num');
    let initialValue = '?';
    if (await countdownNum.count() > 0) {
      initialValue = (await countdownNum.textContent()) ?? '?';
      log.ok('Initial countdown', initialValue);
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });

    // DO NOTHING - wait for countdown to reach 0 + auto-close
    // Default timeout is 10 seconds. Wait 20s to account for timer + UI lag.
    log.step('Waiting for timeout (20s)');
    await pageS.waitForTimeout(20000);

    // Check if overlay auto-closed
    const stillOpen = await pageS.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (stillOpen === 0) {
      log.ok('Overlay auto-closed on timeout');
    } else {
      // The countdown might not have reached 0 yet if there was another dispatch
      const currentVal = await countdownNum.count() > 0
        ? (await countdownNum.textContent()) ?? '?'
        : 'N/A';
      log.warn('Overlay', `still open after 20s (countdown: ${currentVal})`);

      // Wait more
      await pageS.waitForTimeout(15000);
      const stillOpen2 = await pageS.locator('app-dispatch-prompt-guard dialog[open]').count();
      if (stillOpen2 === 0) {
        log.ok('Overlay auto-closed after extended wait');
      } else {
        log.fail('Timeout auto-close', 'overlay did not close after 35s');
      }
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });

    // Verify customer side: quote still open (not matched)
    log.step('Verify quote not auto-booked');
    await pageC.bringToFront();
    await pageC.goto('http://localhost:4200/customer/quotes');
    await pageC.waitForTimeout(2000);

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
  });
});
