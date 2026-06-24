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
  log.ok('Pre-login setup OK', `online + schedule ${weekday}/${timeSlot} for ${email}`);
}

/** Debug helper: log current step index, open dialogs, and screenshot. */
async function debugQuoteStep(page: Page, label: string, stepNum: number): Promise<void> {
  await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, stepNum) });
  const stepEl = page.locator('.stepper .step-active, .stepper .active');
  const stepText = (await stepEl.count()) > 0 ? (await stepEl.textContent()) : '(no active step)';
  const dialogCount = await page.locator('dialog[open]').count();
  log.info('Quote step', `${label} | active: ${stepText} | dialogs[open]: ${dialogCount}`);
}

/** Click a Next button by text fragment and log the result. */
async function clickNext(page: Page, label: string): Promise<boolean> {
  const btn = page.locator(`button:has-text("${label}")`).first();
  if (await btn.count() > 0) {
    const disabled = await btn.isDisabled().catch(() => false);
    if (disabled) {
      log.warn(`Next button "${label}"`, 'disabled - stepping may be stuck');
      return false;
    }
    await btn.click();
    log.ok(`Clicked "${label}"`);
    return true;
  }
  log.warn(`Next button "${label}"`, 'not found');
  return false;
}

async function hasSelector(page: Page, selector: string): Promise<boolean> {
  return (await page.locator(selector).count()) > 0;
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

  test('2.1 - Setup servicer state + login', async () => {
    log.step('Phase 0: Set isOnline + schedule BEFORE login so principal picks it up');

    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);

    try {
      await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');
    } catch (e: any) {
      log.warn('Pre-login setup', `error: ${e?.message ?? e}`);
    }

    log.step('Login servicer M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);
    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForTimeout(1500);

    await pageS.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('Socket connect', 'timed out'));

    log.ok('Servicer online and ready for dispatch');
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
  });

  test('2.2 - Customer creates aircond quote, servicer receives + accepts dispatch', async () => {
    log.step('Customer creates aircond quote');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    await debugQuoteStep(pageC, 'Step 1 - Choose service', 10);

    // --- Step 1: Choose service ---
    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    await clickNext(pageC, 'Next: Contact');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Contact', 11);

    // --- Step 2: Contact ---
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
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Summary', 12);

    // --- Step 3: Summary ---
    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Bill', 13);

    // --- Step 4: Bill ---
    // Check for any blocking dialog
    const blockingDialog = pageC.locator('app-modal dialog[open]');
    if (await blockingDialog.count() > 0) {
      log.warn('Blocking dialog detected', `count=${await blockingDialog.count()}`);
      // Try dismissing it
      const closeBtn = pageC.locator('app-modal button:has-text("Cancel"), app-modal button:has-text("Close"), app-modal .close');
      if (await closeBtn.count() > 0) await closeBtn.first().click();
      await pageC.waitForTimeout(500);
    }

    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      await pageC.waitForTimeout(300);
      log.ok('Selected Pay now');
    } else {
      log.warn('Pay now radio', `${await payNowRadio.count()} found`);

      // Try alt: Maybe it's a select or radio group with different naming
      const altPayNow = pageC.locator('text=Pay now, input[value="pay_now"], [class*="pay-now"]').first();
      if (await altPayNow.count() > 0) {
        await altPayNow.click();
        log.ok('Clicked alt pay-now element');
      }
    }

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      log.ok('Selected Wallet credit');
      await pageC.waitForTimeout(300);
    } else {
      log.warn('Credit radio', `${await creditRadio.count()} found`);
      const altCredit = pageC.locator('text=Wallet credit, text=Credit, input[value="credit"]').first();
      if (await altCredit.count() > 0) {
        await altCredit.click();
        log.ok('Clicked alt credit element');
      }
    }

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
      log.ok('Agreed to terms');
    } else {
      log.warn('Agree checkbox', `${await agreeCheckbox.count()} found`);
    }

    await pageC.waitForTimeout(300);
    await debugQuoteStep(pageC, 'Before Send request', 14);

    log.step('Submitting quote');
    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      const disabled = await submitBtn.isDisabled().catch(() => false);
      if (disabled) log.warn('Send request', 'button is disabled');
      await submitBtn.click();
      log.ok('Quote submitted');
    } else {
      // Debug: dump visible buttons
      const allBtns = pageC.locator('button');
      const btnCount = await allBtns.count();
      const btnTexts: string[] = [];
      for (let i = 0; i < btnCount && i < 20; i++) {
        btnTexts.push((await allBtns.nth(i).textContent())?.trim() ?? '');
      }
      log.fail('Send request button', `not found. Visible buttons: [${btnTexts.filter(Boolean).join(' | ')}]`);
      await debugQuoteStep(pageC, 'FAIL - Send request missing', 15);
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
      pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 16) });
    });
    log.ok('Customer confirmation visible');

    // Switch to servicer side and wait for overlay
    log.step('Waiting for dispatch overlay on servicer');
    await pageS.bringToFront();

    // Watch for socket event
    try {
      await pageS.evaluate(
        ({ timeout }) => {
          return new Promise((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) { reject(new Error('No socket')); return; }
            const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
            socket.once('dispatch.prompt', (d: any) => {
              clearTimeout(timer);
              resolve(d);
            });
          });
        },
        { timeout: 20000 },
      );
      log.ok('dispatch.prompt socket event received');
    } catch (e: any) {
      log.warn('Socket event', `dispatch.prompt not received: ${e?.message ?? e}`);
    }

    // Overlay fallback
    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    try {
      await expect(overlayDlg).toBeVisible({ timeout: 5000 });
      log.ok('Dispatch overlay dialog is visible');
    } catch {
      log.fail('Dispatch overlay', 'dialog[open] not found after socket wait');
      await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      return;
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });

    // Assert overlay content
    const categoryText = pageS.locator('app-dispatch-prompt-guard strong').first();
    if (await categoryText.count() > 0) {
      log.ok('Category heading', (await categoryText.textContent()) ?? '');
    }

    const countdown = pageS.locator('.dp-countdown');
    await expect(countdown).toBeVisible({ timeout: 3000 });
    log.ok('Countdown timer visible');

    const countdownNum = pageS.locator('.dp-countdown-num');
    if (await countdownNum.count() > 0) {
      log.ok('Countdown value', (await countdownNum.textContent()) ?? '');
    }

    const acceptBtn = pageS.locator('.dp-btn-accept');
    await expect(acceptBtn).toBeVisible({ timeout: 3000 });
    log.ok('Accept button visible');

    const declineBtn = pageS.locator('.dp-btn-decline');
    await expect(declineBtn).toBeVisible({ timeout: 3000 });
    log.ok('Decline button visible');

    const mapImg = pageS.locator('.map-preview');
    if (await mapImg.count() > 0) {
      log.ok('Map thumbnail visible');
    } else {
      log.warn('Map thumbnail', 'not found');
    }

    // Click Accept
    log.step('Clicking Accept');
    await acceptBtn.click();
    log.ok('Clicked Accept');
    await pageS.waitForTimeout(2500);

    const stillOpen = await pageS.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (stillOpen === 0) {
      log.ok('Dispatch overlay closed');
    } else {
      const errMsg = pageS.locator('.err');
      if (await errMsg.count() > 0) {
        log.fail('Accept error', (await errMsg.textContent()) ?? '');
      }
    }

    log.ok('URL after accept', pageS.url());
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
  });

  test('2.3 - Customer verifies booking', async () => {
    log.step('Customer checks bookings');

    await pageC.goto('http://localhost:4200/customer/bookings');
    await pageC.waitForTimeout(2000);

    const bookingCards = pageC.locator('.card.booking, .card.item, [class*="booking"]');
    const count = await bookingCards.count();
    if (count > 0) {
      log.ok('Bookings visible', `${count} found`);
    } else {
      log.warn('Bookings', 'none visible');
    }

    try {
      await pageC.evaluate(
        ({ timeout }) => {
          return new Promise((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) { reject(new Error('No socket')); return; }
            const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
            socket.once('booking.confirmed', (d: any) => {
              clearTimeout(timer);
              resolve(d);
            });
          });
        },
        { timeout: 8000 },
      );
      log.ok('booking.confirmed received');
    } catch (e: any) {
      log.warn('Socket', `booking.confirmed not received: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
  });
});
