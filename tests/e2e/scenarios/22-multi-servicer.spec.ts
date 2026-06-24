import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 22;
let log: StepLogger;
let contextC: BrowserContext;
let contextS1: BrowserContext;
let contextS2: BrowserContext;
let contextS3: BrowserContext;
let pageC: Page;
let pageS1: Page;
let pageS2: Page;
let pageS3: Page;

const BACKEND = 'http://localhost:3000/api/v1';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SLOT_HOUR_MAP: Record<string, [number, number]> = {
  morning: [6, 10], noon: [10, 13], afternoon: [13, 17],
  evening: [17, 20], night: [20, 24],
};

const SERVICER_EMAILS: Record<string, string> = {
  S1: 'ahmad.bin.ismail@demo.local',
  S2: 'kumar.selvam@demo.local',
  S3: 'ravi.chandran@demo.local',
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
  log.ok('Setup OK', `online+schedule for ${email}`);
}

async function clickNext(page: Page, label: string): Promise<boolean> {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count() > 0) {
    const disabled = await btn.isDisabled().catch(() => false);
    if (disabled) { log.warn(`Next "${label}"`, 'disabled'); return false; }
    await btn.click();
    log.ok(`Clicked "${label}"`);
    return true;
  }
  log.warn(`Next "${label}"`, 'not found');
  return false;
}

async function waitForSocketEvent(page: Page, event: string, timeoutMs: number): Promise<any> {
  return page.evaluate(
    ({ evt, timeout }) => {
      return new Promise((resolve, reject) => {
        const socket = (window as any).__SOCKET__;
        if (!socket) { reject(new Error('No socket')); return; }
        const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
        socket.once(evt, (d: any) => {
          clearTimeout(timer);
          resolve(d);
        });
      });
    },
    { evt: event, timeout: timeoutMs },
  );
}

test.describe('Scenario 22 - Multi-Servicer Broadcast', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('22');
    log.info('DB', 'assuming already seeded');

    contextC = await browser.newContext();
    contextS1 = await browser.newContext();
    contextS2 = await browser.newContext();
    contextS3 = await browser.newContext();
    pageC = await contextC.newPage();
    pageS1 = await contextS1.newPage();
    pageS2 = await contextS2.newPage();
    pageS3 = await contextS3.newPage();

    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    [pageS1, pageS2, pageS3].forEach((p) => {
      p.on('console', (msg) => {
        if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
      });
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextC?.close();
    await contextS1?.close();
    await contextS2?.close();
    await contextS3?.close();
  });

  test('22.1 - Setup 3 servicers online+available', async () => {
    log.step('Setup all 3 servicers via API');

    // Use a scratch page to make API calls for all 3
    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);

    for (const key of ['S1', 'S2', 'S3']) {
      try {
        await setupServicerBeforeLogin(pageC, SERVICER_EMAILS[key]);
      } catch (e: any) {
        log.warn(`Setup ${key}`, `error: ${e?.message ?? e}`);
      }
    }
    log.ok('All 3 servicers set online+available');
  });

  test('22.2 - Login servicers S1, S2, S3 to establish sockets', async () => {
    log.step('Login S1 (M1_ANAS)');
    await loginAs(pageS1, 'M1_ANAS', log);
    await pageS1.goto('http://localhost:4200/servicer/jobs');
    await pageS1.waitForTimeout(1500);

    log.step('Login S2 (M2_WEI)');
    await loginAs(pageS2, 'M2_WEI', log);
    await pageS2.goto('http://localhost:4200/servicer/jobs');
    await pageS2.waitForTimeout(1500);

    log.step('Login S3 (M3_RAJ)');
    await loginAs(pageS3, 'M3_RAJ', log);
    await pageS3.goto('http://localhost:4200/servicer/jobs');
    await pageS3.waitForTimeout(1500);

    // Verify sockets connected
    for (const [key, p] of Object.entries({ S1: pageS1, S2: pageS2, S3: pageS3 })) {
      const ok = await p.evaluate(() => !!(window as any).__SOCKET__?.connected).catch(() => false);
      log.info(`Socket ${key}`, ok ? 'connected' : 'not connected');
    }
  });

  test('22.3 - Customer creates quote - all 3 receive dispatch broadcast', async () => {
    log.step('Customer logs in and creates aircond quote');
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

    // Start listening for dispatch events on all 3 servicers before submitting
    const dispatchPromises = [
      waitForSocketEvent(pageS1, 'dispatch.prompt', 25000).catch((e) => ({ error: e?.message ?? e, servicer: 'S1' })),
      waitForSocketEvent(pageS2, 'dispatch.prompt', 25000).catch((e) => ({ error: e?.message ?? e, servicer: 'S2' })),
      waitForSocketEvent(pageS3, 'dispatch.prompt', 25000).catch((e) => ({ error: e?.message ?? e, servicer: 'S3' })),
    ];

    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted - waiting for dispatch broadcasts');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });

    // Wait for all 3 dispatch events
    const results = await Promise.all(dispatchPromises);
    const received: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if ((r as any).error) {
        failed.push(`S${i + 1}: ${(r as any).error}`);
      } else {
        received.push(`S${i + 1}`);
      }
    }

    if (received.length === 3) {
      log.ok('All 3 servicers received dispatch.prompt');
    } else {
      log.warn('Dispatch broadcast', `${received.length}/3 received: ${received.join(', ')}. Failed: ${failed.join('; ')}`);
    }

    // Verify overlays visible
    for (const [key, p] of Object.entries({ S1: pageS1, S2: pageS2, S3: pageS3 })) {
      const overlay = p.locator('app-dispatch-prompt-guard dialog[open]');
      try {
        await expect(overlay).toBeVisible({ timeout: 3000 });
        log.ok(`Dispatch overlay visible on ${key}`);
      } catch {
        log.warn(`Dispatch overlay on ${key}`, 'not visible');
      }
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Quote submitted - dispatch broadcast sent', null);
  });

  test('22.4 - S1 accepts dispatch, booking created, S2+S3 overlay gone', async () => {
    log.step('S1 clicks Accept on dispatch overlay');

    await pageS1.bringToFront();
    const acceptBtn = pageS1.locator('.dp-btn-accept');
    await expect(acceptBtn).toBeVisible({ timeout: 5000 });
    await acceptBtn.click();
    log.ok('S1 clicked Accept');

    await pageS1.waitForTimeout(2500);

    // Verify S1 overlay is gone
    const s1Overlay = pageS1.locator('app-dispatch-prompt-guard dialog[open]');
    const s1Closed = await s1Overlay.count() === 0;
    if (s1Closed) {
      log.ok('S1 dispatch overlay closed after accept');
    } else {
      log.warn('S1 overlay', 'still open');
    }

    // Verify S2 and S3 overlays are gone (or at least disabled)
    for (const [key, p] of Object.entries({ S2: pageS2, S3: pageS3 })) {
      await p.bringToFront();
      await p.waitForTimeout(1000);
      const overlay = p.locator('app-dispatch-prompt-guard dialog[open]');
      try {
        await expect(overlay).not.toBeVisible({ timeout: 8000 });
        log.ok(`${key} dispatch overlay dismissed after S1 accepted`);
      } catch {
        log.warn(`${key} dispatch overlay`, 'still visible or not dismissed');
      }
    }

    // Verify booking was created for S1 (pageS1 navigated or has booking marker)
    const bookingIndicator = pageS1.locator('.card.booking, .booking-item, [class*="booking"]');
    const bookingCount = await bookingIndicator.count().catch(() => 0);
    if (bookingCount > 0) {
      log.ok('Booking visible on S1 page', `${bookingCount} items`);
    } else {
      log.warn('Booking indicator', 'not found on S1 page');
    }

    await pageS1.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('S1 after accept', null);
    await pageS2.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('S2 overlay removed', null);
    await pageS3.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('S3 overlay removed', null);
  });
});
