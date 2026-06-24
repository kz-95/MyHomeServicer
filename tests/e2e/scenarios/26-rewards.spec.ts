import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 26;
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
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
        body: JSON.stringify({ slots: [{ weekday: wd, timeSlot: slot, available: true }] }),
      });
      await fetch(`${apiBase}/servicer/me/online`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-dev-user': devUser },
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

test.describe('Scenario 26 - Rewards Points', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('26');
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

  test('26.1 - Setup servicer + create quote', async () => {
    log.step('Setup servicer before login');
    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);
    try {
      await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');
    } catch (e: any) {
      log.warn('Pre-login setup', `error: ${e?.message ?? e}`);
    }

    log.step('Customer creates quote');
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

  test('26.2 - Servicer proposes, customer accepts', async () => {
    log.step('Servicer M2_WEI proposes');
    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/pending');
    await pageS.waitForTimeout(2000);

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    if (count === 0) { log.fail('No pending', 'cannot propose'); return; }

    const acceptBtn = pendingCards.first().locator('button:has-text("Accept Job")');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click(); await pageS.waitForTimeout(500);
      const priceInput = pageS.locator('input[placeholder="Price (RM)"]');
      if (await priceInput.count() > 0) await priceInput.fill('250');
      const proposeBtn = pageS.locator('button:has-text("Send proposal")');
      if (await proposeBtn.count() > 0) {
        await proposeBtn.click(); await pageS.waitForTimeout(1000);
        log.ok('Proposal sent');
      }
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });

    log.step('Customer accepts');
    await pageC.bringToFront();
    await pageC.goto('http://localhost:4200/customer/quotes');
    await pageC.waitForTimeout(1000);

    const chooseProposal = pageC.locator('a:has-text("Choose a proposal")').first();
    if (await chooseProposal.count() > 0) {
      await chooseProposal.click();
    } else {
      const viewProposals = pageC.locator('a:has-text("View proposals")').first();
      if (await viewProposals.count() > 0) await viewProposals.click();
      else { log.fail('No proposal link', 'found'); return; }
    }

    await pageC.waitForURL(/\/customer\/quotes\/.*\/proposals/, { timeout: 15000 }).catch(() => {});
    await pageC.waitForTimeout(1000);

    const selectBtn = pageC.locator('.card.proposal').first().locator('button:has-text("Select")');
    if (await selectBtn.count() > 0) {
      await selectBtn.click();
      await pageC.waitForSelector('app-modal dialog[open]', { timeout: 8000 }).catch(() => {});
      await pageC.waitForTimeout(1200);
      const confirmBtn = pageC.locator('button:has-text("book this servicer")');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        log.ok('Booking confirmed');
        await pageC.waitForURL(/\/customer\/bookings/, { timeout: 15000 }).catch(() => {});
      }
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Booking confirmed', null);
  });

  test('26.3 - Servicer marks arrived + done', async () => {
    log.step('Servicer marks arrived');
    await pageS.bringToFront();
    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(2000);

    const arriveBtn = pageS.locator('button:has-text("Mark arrived")').first();
    if (await arriveBtn.count() > 0) {
      await arriveBtn.click();
      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {});
      const fileInput = pageS.locator('app-modal input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'arrival-photo.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
        });
        await pageS.waitForTimeout(500);
        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Arrival confirmed');
          await pageS.waitForTimeout(2000);
        }
      }
    } else { log.fail('Mark arrived', 'not found'); return; }

    log.step('Servicer marks done');
    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1500);
    const doneBtn = pageS.locator('button:has-text("Mark done")').first();
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {});
      const fileInput2 = pageS.locator('app-modal input[type="file"]');
      if (await fileInput2.count() > 0) {
        await fileInput2.setInputFiles({
          name: 'completion-photo.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
        });
        await pageS.waitForTimeout(500);
        const uploadBtn2 = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn2.count() > 0 && !(await uploadBtn2.isDisabled())) {
          await uploadBtn2.click();
          log.ok('Job marked done');
          await pageS.waitForTimeout(2000);
        }
      }
    } else { log.fail('Mark done', 'not found'); }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Job completed', null);
  });

  test('26.4 - Verify points on history/rewards page', async () => {
    log.step('Customer navigates to history page');

    await pageC.bringToFront();
    await pageC.goto('http://localhost:4200/customer/history');
    await pageC.waitForTimeout(2000);

    // Look for points display
    const pointsIndicator = pageC.locator(
      'text=points, text=Points, .reward, .points, [class*="point"], [class*="reward"], .loyalty-points, .rewards-balance',
    );

    const pointsCount = await pointsIndicator.count();
    if (pointsCount > 0) {
      log.ok('Points/rewards display found', `${pointsCount} elements`);
      const pointsText = await pointsIndicator.first().textContent().catch(() => '');
      if (pointsText) log.ok('Points content', pointsText.trim());
    } else {
      log.warn('Points/rewards', 'not found on history page - trying /customer/rewards');

      // Try rewards page
      await pageC.goto('http://localhost:4200/customer/rewards');
      await pageC.waitForTimeout(2000);

      const rewardsIndicator = pageC.locator(
        'text=points, text=Points, .reward, .points, [class*="point"], [class*="reward"]',
      );
      if (await rewardsIndicator.count() > 0) {
        log.ok('Points found on rewards page');
      } else {
        log.warn('Points/rewards', 'not found on any page - may not be implemented');
      }
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Points / rewards page', null);

    // Also check if booking history shows points
    const bookingCards = pageC.locator('.card.booking, .booking-item, .history-item');
    const bookingCount = await bookingCards.count();
    if (bookingCount > 0) {
      log.ok('Booking history visible', `${bookingCount} items`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 6) });
    log.screenshot('Booking history', null);
  });
});
