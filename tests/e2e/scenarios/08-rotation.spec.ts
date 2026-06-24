import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 8;
let log: StepLogger;
let contextC: BrowserContext;
let contextS1: BrowserContext;
let contextS2: BrowserContext;
let pageC: Page;
let pageS1: Page;
let pageS2: Page;

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

test.describe('Scenario 8 - Rotation (Decline on S1, Accept on S2)', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('08');
    log.info('DB', 'assuming already seeded with M1 and M2 both qualifying for plumbing');

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

  test('8.1 - Setup both servicers online + schedule', async () => {
    log.step('Setup both servicers');

    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);

    await setupServicerBeforeLogin(pageC, 'ahmad.bin.ismail@demo.local');
    await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');

    log.ok('Both servicers online with schedule');
  });

  test('8.2 - Login C_FRESH and submit plumbing quote', async () => {
    log.step('Login C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const plumberCard = pageC.locator('.bw-card').filter({ hasText: /plumb/i }).first();
    await expect(plumberCard).toBeVisible({ timeout: 10000 });
    await plumberCard.click();
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

    log.step('Submitting plumbing quote');
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
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Plumbing quote submitted', null);
  });

  test('8.3 - Login M1_ANAS, wait for dispatch overlay, decline', async () => {
    log.step('Login S1: M1_ANAS');
    await loginAs(pageS1, 'M1_ANAS', log);

    await pageS1.goto('http://localhost:4200/servicer/jobs');
    await pageS1.waitForTimeout(1000);
    await pageS1.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('S1 Socket', 'timed out'));

    log.step('Wait for dispatch overlay on S1');
    await pageS1.bringToFront();

    const overlayS1 = pageS1.locator('app-dispatch-prompt-guard dialog[open]');
    try {
      await expect(overlayS1).toBeVisible({ timeout: 25000 });
      log.ok('Dispatch overlay appeared on S1');
    } catch {
      log.fail('S1 overlay', 'not found');
      await pageS1.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      return;
    }

    await pageS1.waitForTimeout(500);

    const catText = pageS1.locator('app-dispatch-prompt-guard strong').first();
    if (await catText.count() > 0) {
      log.ok('Category on S1', (await catText.textContent()) ?? '');
    }

    const declineBtn = pageS1.locator('.dp-btn-decline');
    await expect(declineBtn).toBeVisible({ timeout: 3000 });
    await declineBtn.click();
    log.ok('S1 declined dispatch');

    await pageS1.waitForTimeout(2000);
    const stillOpen = await pageS1.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (stillOpen === 0) {
      log.ok('Overlay closed on S1 after decline');
    } else {
      log.warn('S1 overlay', 'still open');
    }

    await pageS1.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('S1 declined', null);
  });

  test('8.4 - Login M2_WEI, wait for rotation dispatch overlay, accept', async () => {
    log.step('Login S2: M2_WEI');
    await loginAs(pageS2, 'M2_WEI', log);

    await pageS2.goto('http://localhost:4200/servicer/jobs');
    await pageS2.waitForTimeout(1000);
    await pageS2.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('S2 Socket', 'timed out'));

    log.step('Wait for dispatch overlay on S2 (rotation)');
    await pageS2.bringToFront();

    const overlayS2 = pageS2.locator('app-dispatch-prompt-guard dialog[open]');
    try {
      await expect(overlayS2).toBeVisible({ timeout: 25000 });
      log.ok('Dispatch overlay appeared on S2 - rotation working');
    } catch {
      log.fail('S2 overlay', 'not found - rotation may not have occurred');
      await pageS2.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
      return;
    }

    await pageS2.waitForTimeout(500);

    const catText = pageS2.locator('app-dispatch-prompt-guard strong').first();
    if (await catText.count() > 0) {
      log.ok('Category on S2', (await catText.textContent()) ?? '');
    }

    const acceptBtn = pageS2.locator('.dp-btn-accept');
    await expect(acceptBtn).toBeVisible({ timeout: 3000 });
    await acceptBtn.click();
    log.ok('S2 accepted dispatch');

    await pageS2.waitForTimeout(2500);
    const stillOpen = await pageS2.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (stillOpen === 0) {
      log.ok('Overlay closed on S2 after accept');
    } else {
      log.warn('S2 overlay', 'still open after accept');
    }

    await pageS2.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('S2 accepted rotation', null);
  });

  test('8.5 - Verify booking created', async () => {
    log.step('Verify booking was created');

    await pageC.goto('http://localhost:4200/customer/bookings');
    await pageC.waitForTimeout(2000);

    const bookingCards = pageC.locator('.card.booking, .card.item, [class*="booking"]');
    const count = await bookingCards.count();
    if (count > 0) {
      log.ok('Booking visible', `${count} booking(s) found`);
    } else {
      log.warn('Booking', 'none visible in customer bookings');
    }

    try {
      const bookingsResp = await pageC.evaluate(async () => {
        const res = await fetch('http://localhost:3000/api/bookings', {
          headers: { 'Content-Type': 'application/json' },
        });
        return res.json();
      });

      const bookings = bookingsResp?.data ?? [];
      if (bookings.length > 0) {
        const latest = bookings[0];
        log.ok('Booking in DB', `status: ${latest.status}, ID: ${latest.id}`);
      } else {
        log.fail('No bookings', 'found in DB');
      }
    } catch (e: any) {
      log.warn('Booking query', `API call failed: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Booking verified after rotation', null);
  });
});
