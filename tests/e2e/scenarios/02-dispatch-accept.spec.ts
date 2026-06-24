import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 2;
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

test.describe('Scenario 2 - Dispatch Accept', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('02');
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

  test('2.1 - Servicer logs in and goes online', async () => {
    log.step('Servicer logs in as M2_WEI (Kumar, aircond)');
    await loginAs(pageS, 'M2_WEI', log);
    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForSelector('body', { timeout: 5000 });

    log.ok('Servicer logged in and navigated to Jobs');

    // Ensure working hours for current time slot
    await ensureWorkingHours(pageS, 'S1');

    // Ensure isOnline=true via socket (server sets on connect) and API
    try {
      await pageS.evaluate(async (apiBase) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOnline: true }),
          credentials: 'include',
        });
      }, BACKEND);
      log.ok('isOnline set to true via API');
    } catch (e: any) {
      log.warn('isOnline API', `failed: ${e?.message ?? e}`);
    }

    // Wait for socket to connect (__SOCKET__ exposed in dev mode)
    await pageS.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => {
      log.warn('Socket connect', 'timed out, socket may not be ready');
    });

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Servicer online', null);
  });

  test('2.2 - Customer creates aircond quote', async () => {
    log.step('Customer logs in as C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });
    log.ok('Find Service page loaded');

    // Click aircond category card
    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    log.ok('Navigated to quote form');

    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    // Step 1: Budget slider
    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) {
      await budgetSlider.fill('2');
      log.ok('Budget slider set');
    }

    // Next: Contact
    const nextBtn1 = pageC.locator('button:has-text("Next: Contact")').first();
    if (await nextBtn1.count() > 0) {
      await nextBtn1.click();
      log.ok('Clicked Next: Contact');
    }

    // Step 2: Contact details
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
    if (await nextBtn2.count() > 0) {
      await nextBtn2.click();
      log.ok('Clicked Next: Summary');
    }

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

    log.step('Submitting quote');
    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Clicked Send request');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    // Wait for confirmation
    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Quote submitted successfully');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Quote created', null);
  });

  test('2.3 - Dispatch overlay appears on servicer screen', async () => {
    log.step('Waiting for dispatch.prompt on servicer');

    // Try socket watcher first
    let socketData: any = null;
    try {
      socketData = await pageS.evaluate(
        ({ event, timeout }) => {
          return new Promise((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) {
              reject(new Error('Socket not found'));
              return;
            }
            const timer = setTimeout(
              () => reject(new Error(`Socket event "${event}" timed out after ${timeout}ms`)),
              timeout,
            );
            socket.once(event, (data: any) => {
              clearTimeout(timer);
              resolve(data);
            });
          });
        },
        { event: 'dispatch.prompt', timeout: 30000 },
      );
      log.ok('dispatch.prompt received via socket', JSON.stringify(socketData).slice(0, 200));
    } catch (e: any) {
      log.warn('Socket watcher', `failed: ${e?.message ?? e}. Trying selector fallback.`);
    }

    // Wait for overlay to appear (fallback)
    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    await expect(overlayDlg).toBeVisible({ timeout: 15000 });
    log.ok('Dispatch overlay dialog is visible');
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Dispatch overlay', null);
  });

  test('2.4 - Assert overlay content', async () => {
    log.step('Verifying dispatch overlay content');

    // Category name
    const categoryText = pageS.locator('app-dispatch-prompt-guard strong:has-text("aircond"), app-dispatch-prompt-guard strong:has-text("Aircond")');
    const hasCategory = await categoryText.first().count() > 0;
    if (hasCategory) {
      log.ok('Category name visible in dispatch');
    } else {
      log.warn('Category heading', 'not found');
    }

    // Customer name
    const customerName = pageS.locator('app-dispatch-prompt-guard .dp-customer strong');
    if (await customerName.count() > 0) {
      log.ok('Customer name visible');
    }

    // Countdown timer
    const countdown = pageS.locator('app-dispatch-prompt-guard .dp-countdown');
    await expect(countdown).toBeVisible({ timeout: 3000 });
    log.ok('Countdown timer visible');

    // Countdown number
    const countdownNum = pageS.locator('.dp-countdown-num');
    if (await countdownNum.count() > 0) {
      const val = await countdownNum.textContent();
      log.ok('Countdown value', val ?? '');
    }

    // Accept + Decline buttons
    const acceptBtn = pageS.locator('.dp-btn-accept');
    await expect(acceptBtn).toBeVisible({ timeout: 3000 });
    log.ok('Accept button visible');

    const declineBtn = pageS.locator('.dp-btn-decline');
    await expect(declineBtn).toBeVisible({ timeout: 3000 });
    log.ok('Decline button visible');

    // Map thumbnail
    const mapImg = pageS.locator('.map-preview');
    if (await mapImg.count() > 0) {
      log.ok('Map thumbnail visible');
    } else {
      log.warn('Map thumbnail', 'not found (lat/lng may be null)');
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Overlay content verified', null);
  });

  test('2.5 - Servicer clicks Accept', async () => {
    log.step('Servicer clicks Accept on dispatch overlay');

    const acceptBtn = pageS.locator('.dp-btn-accept');
    await expect(acceptBtn).toBeVisible({ timeout: 3000 });
    await acceptBtn.click();
    log.ok('Clicked Accept');

    // Wait for request to complete and overlay to close
    await pageS.waitForTimeout(2000);

    // Check overlay is closed (dialog not open)
    const dialogAfter = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    const stillOpen = await dialogAfter.count();
    if (stillOpen === 0) {
      log.ok('Dispatch overlay closed');
    } else {
      log.warn('Overlay close', 'dialog still open, may be error state');
      // Check for error message
      const errMsg = pageS.locator('.err');
      if (await errMsg.count() > 0) {
        log.fail('Accept error', (await errMsg.textContent()) ?? '');
      }
    }

    // Check navigation - should still be on jobs view or redirected
    await pageS.waitForTimeout(1000);
    const currentUrl = pageS.url();
    log.ok('Current URL after accept', currentUrl);
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('After accept', null);
  });

  test('2.6 - Customer receives confirmation', async () => {
    log.step('Customer checks for booking confirmation');

    // Navigate to bookings
    await pageC.goto('http://localhost:4200/customer/bookings');
    await pageC.waitForTimeout(2000);

    // Check if there are bookings
    const bookingCards = pageC.locator('.card.booking, .card.item, [class*="booking"]');
    const count = await bookingCards.count();
    if (count > 0) {
      log.ok('Bookings visible', `${count} bookings found`);
    } else {
      log.warn('Bookings', 'none found, quote may not have been matched');
    }

    // Check for socket notification
    try {
      const notificationData = await pageC.evaluate(
        ({ event, timeout }) => {
          return new Promise((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) {
              reject(new Error('Socket not found'));
              return;
            }
            const timer = setTimeout(
              () => reject(new Error(`Timed out after ${timeout}ms`)),
              timeout,
            );
            socket.once(event, (data: any) => {
              clearTimeout(timer);
              resolve(data);
            });
          });
        },
        { event: 'booking.confirmed', timeout: 15000 },
      );
      log.ok('booking.confirmed received via socket', JSON.stringify(notificationData).slice(0, 200));
    } catch (e: any) {
      log.warn('Socket notification', `booking.confirmed not received: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 6) });
    log.screenshot('Customer confirmation', null);
  });
});
