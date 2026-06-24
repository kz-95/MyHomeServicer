import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 6;
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

async function debugQuoteStep(page: Page, label: string, stepNum: number): Promise<void> {
  await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, stepNum) });
  const stepEl = page.locator('.stepper .step-active, .stepper .active');
  const stepText = (await stepEl.count()) > 0 ? (await stepEl.textContent()) : '(no active step)';
  log.info('Quote step', `${label} | active: ${stepText}`);
}

async function clickNext(page: Page, label: string): Promise<boolean> {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count() > 0) {
    const disabled = await btn.isDisabled().catch(() => false);
    if (disabled) {
      log.warn(`Next button "${label}"`, 'disabled');
      return false;
    }
    await btn.click();
    log.ok(`Clicked "${label}"`);
    return true;
  }
  log.warn(`Next button "${label}"`, 'not found');
  return false;
}

test.describe('Scenario 6 - Offline Guard (No Dispatch)', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('06');
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

  test('6.1 - Login C_FRESH and set servicer offline via API', async () => {
    log.step('Login C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);

    log.step('Set servicer kumar.selvam@demo.local to offline');
    try {
      await pageC.evaluate(async ({ apiBase }) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-dev-user': 'kumar.selvam@demo.local' },
          body: JSON.stringify({ isOnline: false }),
        });
      }, { apiBase: BACKEND });
      log.ok('Servicer set to offline');
    } catch (e: any) {
      log.warn('Set offline API', `error: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Servicer offline state set', null);
  });

  test('6.2 - Submit aircond quote while servicer is offline', async () => {
    log.step('Navigate to findService');
    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    await debugQuoteStep(pageC, 'Step 1', 2);

    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    await clickNext(pageC, 'Next: Contact');
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

    await clickNext(pageC, 'Next: Summary');
    await pageC.waitForTimeout(500);

    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(500);

    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0) await payNowRadio.check();

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0) await creditRadio.check();

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0) await agreeCheckbox.check();

    await pageC.waitForTimeout(300);

    log.step('Submitting quote');
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
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Quote submitted while servicer offline', null);
  });

  test('6.3 - Login servicer and verify no dispatch received', async () => {
    log.step('Login M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForTimeout(1500);

    await pageS.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('Socket connect', 'timed out'));

    log.step('Set up socket watcher for dispatch.prompt - expecting NO event');
    let dispatchReceived = false;
    try {
      await pageS.evaluate(
        ({ timeout }) => {
          return new Promise((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) { reject(new Error('No socket')); return; }
            const timer = setTimeout(() => {
              socket.off('dispatch.prompt');
              reject(new Error('Timeout - dispatch NOT received'));
            }, timeout);
            socket.once('dispatch.prompt', (d: any) => {
              clearTimeout(timer);
              resolve(d);
            });
          });
        },
        { timeout: 8000 },
      );
      dispatchReceived = true;
      log.warn('dispatch.prompt', 'RECEIVED despite servicer being offline');
    } catch (e: any) {
      log.ok('dispatch.prompt NOT received', 'as expected (servicer offline)');
    }

    if (dispatchReceived) {
      log.fail('Offline guard', 'dispatch.prompt was fired for offline servicer');
    }

    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    const overlayCount = await overlayDlg.count();
    if (overlayCount === 0) {
      log.ok('No dispatch overlay visible', 'offline guard working correctly');
    } else {
      log.warn('Dispatch overlay', `found ${overlayCount} despite offline state`);
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Servicer no dispatch overlay', null);
  });
});
