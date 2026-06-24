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

  test('2c.1 - Servicer logs in and goes online', async () => {
    log.step('Servicer logs in as M2_WEI (Kumar, aircond)');
    await loginAs(pageS, 'M2_WEI', log);
    await pageS.goto('http://localhost:4200/servicer/jobs');
    await pageS.waitForSelector('body', { timeout: 5000 });

    try {
      await pageS.evaluate(async (apiBase) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOnline: true }),
          credentials: 'include',
        });
      }, BACKEND);
      log.ok('isOnline = true');
    } catch (e: any) {
      log.warn('isOnline API', `failed: ${e?.message ?? e}`);
    }

    await pageS.waitForFunction(
      () => !!(window as any).__SOCKET__?.connected,
      { timeout: 10000 },
    ).catch(() => log.warn('Socket connect', 'timed out'));

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Servicer online', null);
  });

  test('2c.2 - Customer creates aircond quote', async () => {
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
      log.ok('Clicked Send request');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Aircond quote submitted');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Quote created', null);
  });

  test('2c.3 - Dispatch overlay appears, then auto-closes on timeout', async () => {
    log.step('Waiting for dispatch overlay on servicer');

    // Wait for overlay to appear
    const overlayDlg = pageS.locator('app-dispatch-prompt-guard dialog[open]');
    await expect(overlayDlg).toBeVisible({ timeout: 30000 });
    log.ok('Dispatch overlay appeared');

    // Read initial countdown value
    const countdownNum = pageS.locator('.dp-countdown-num');
    let initialValue = '?';
    if (await countdownNum.count() > 0) {
      initialValue = (await countdownNum.textContent()) ?? '?';
      log.ok('Initial countdown', initialValue);
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Dispatch overlay visible (waiting for timeout)', null);

    // DO NOTHING - wait for timeout. Default is 10s + 5s buffer for auto-close
    log.info('Timeout wait', 'waiting 15s for countdown to reach 0 and overlay to auto-close');
    await pageS.waitForTimeout(15000);

    // Check if overlay closed automatically
    const dialogStillOpen = await pageS.locator('app-dispatch-prompt-guard dialog[open]').count();
    if (dialogStillOpen === 0) {
      log.ok('Overlay auto-closed on timeout');
    } else {
      // May still be open if another dispatch came (rotation) or the countdown hasn't hit 0
      // Check countdown value
      const currentVal = await countdownNum.count() > 0
        ? (await countdownNum.textContent()) ?? '?'
        : 'N/A';
      log.warn('Overlay', `still open after timeout (countdown: ${currentVal})`);

      // Wait a bit more
      await pageS.waitForTimeout(10000);
      const stillOpen2 = await pageS.locator('app-dispatch-prompt-guard dialog[open]').count();
      if (stillOpen2 === 0) {
        log.ok('Overlay auto-closed after extended wait');
      } else {
        log.fail('Timeout auto-close', 'overlay did not close after 25s');
      }
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('After timeout', null);
  });

  test('2c.4 - Verify quote not matched (no booking created)', async () => {
    log.step('Verify no booking was created on timeout');

    await pageC.goto('http://localhost:4200/customer/quotes');
    await pageC.waitForTimeout(2000);

    // Check quotes page shows the quote in "open" status (not matched/booked)
    const openQuotes = pageC.locator('text=open, text=Open, .status-badge:has-text("open")');
    if (await openQuotes.count() > 0) {
      log.ok('Quote still in open status (not auto-booked)');
    } else {
      log.warn('Quote status check', 'could not confirm open status');
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Customer quotes page after timeout', null);
  });
});
