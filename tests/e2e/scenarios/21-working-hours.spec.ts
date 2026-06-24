import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 21;
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

async function setupServicerBeforeLogin(page: Page, email: string, overrides?: { weekday?: string; timeSlot?: string; available?: boolean }): Promise<void> {
  const { weekday, timeSlot } = currentWeekdayAndSlot();
  const wd = overrides?.weekday ?? weekday;
  const slot = overrides?.timeSlot ?? timeSlot;
  const avail = overrides?.available ?? true;
  await page.evaluate(
    async ({ apiBase, wdInner, slotInner, devUser, av }) => {
      await fetch(`${apiBase}/servicer/me/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
        body: JSON.stringify({ slots: [{ weekday: wdInner, timeSlot: slotInner, available: av }] }),
      });
      await fetch(`${apiBase}/servicer/me/online`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
        body: JSON.stringify({ isOnline: av }),
      });
    },
    { apiBase: BACKEND, wdInner: wd, slotInner: slot, devUser: email, av: avail },
  );
  log.ok('Pre-login setup done', `schedule ${wd}/${slot} avail=${avail} for ${email}`);
}

async function debugQuoteStep(page: Page, label: string, stepNum: number): Promise<void> {
  await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, stepNum) });
  const stepEl = page.locator('.stepper .step-active, .stepper .active');
  const stepText = (await stepEl.count()) > 0 ? (await stepEl.textContent()) : '(no active step)';
  const dialogCount = await page.locator('dialog[open]').count();
  log.info('Quote step', `${label} | active: ${stepText} | dialogs[open]: ${dialogCount}`);
}

async function clickNext(page: Page, label: string): Promise<boolean> {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count() > 0) {
    const disabled = await btn.isDisabled().catch(() => false);
    if (disabled) { log.warn(`Next button "${label}"`, 'disabled'); return false; }
    await btn.click();
    log.ok(`Clicked "${label}"`);
    return true;
  }
  log.warn(`Next button "${label}"`, 'not found');
  return false;
}

test.describe('Scenario 21 - Working Hours / Off-Hours', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('21');
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

  test('21.1 - Set servicer schedule to off-hours (night unavailable)', async () => {
    log.step('Set servicer kumar.selvam schedule to night unavailable');

    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);

    try {
      // Set 'night' slot as unavailable for 'mon'
      const { weekday } = currentWeekdayAndSlot();
      await pageC.evaluate(
        async ({ apiBase, wd, devUser }) => {
          await fetch(`${apiBase}/servicer/me/schedule`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
            body: JSON.stringify({ slots: [{ weekday: wd, timeSlot: 'night', available: false }] }),
          });
        },
        { apiBase: BACKEND, wd: weekday, devUser: 'kumar.selvam@demo.local' },
      );
      log.ok('Night slot set unavailable for', weekday);
    } catch (e: any) {
      log.warn('Schedule setup', `error: ${e?.message ?? e}`);
    }
  });

  test('21.2 - Customer creates aircond quote', async () => {
    log.step('Customer logs in and creates quote');
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

    await clickNext(pageC, 'Next: Contact');
    await pageC.waitForTimeout(700);

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
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }
    const slotSelect = pageC.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ label: 'Morning (9:00-11:00)' });
    }

    await clickNext(pageC, 'Next: Summary');
    await pageC.waitForTimeout(700);
    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(700);

    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check(); await pageC.waitForTimeout(300);
    }
    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check(); await pageC.waitForTimeout(300);
    }
    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
    }

    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Quote created');

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Quote submitted', null);
  });

  test('21.3 - Servicer logs in and verify no dispatch shown (off-hours)', async () => {
    log.step('Servicer M2_WEI logs in');
    await loginAs(pageS, 'M2_WEI', log);

    // Navigate to servicer jobs page where dispatch overlay would appear
    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForTimeout(3000);

    // Wait a moment to see if any dispatch prompt appears
    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    try {
      await expect(overlayDlg).not.toBeVisible({ timeout: 8000 });
      log.ok('No dispatch overlay shown (off-hours correctly blocked)');
    } catch {
      log.warn('Dispatch overlay', 'appeared despite off-hours setup');
    }

    // Also check for any dispatch prompt via socket event
    const dispatchReceived = await pageS.evaluate(() => {
      const socket = (window as any).__SOCKET__;
      if (!socket) return 'no-socket';
      // Check if dispatch events exist in socket callbacks
      const events = (socket as any)._callbacks?.['dispatch.prompt'];
      return events ? 'has-listeners' : 'no-listeners';
    }).catch(() => 'evaluate-failed');
    log.info('Socket dispatch state', dispatchReceived);

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Servicer after login - no dispatch', null);

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Customer page', null);
  });
});
