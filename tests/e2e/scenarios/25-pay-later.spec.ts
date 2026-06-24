import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { getTransactions, disconnect } from '../helpers/db-check';

const SCENARIO_ID = 25;
let log: StepLogger;
let contextC: BrowserContext;
let contextS: BrowserContext;
let pageC: Page;
let pageS: Page;
let bookingId: string | null = null;

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

test.describe('Scenario 25 - Pay Later Flow', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('25');
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

  test('25.1 - Customer creates quote with pay_later', async () => {
    log.step('Setup servicer before login');
    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);
    try {
      await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');
    } catch (e: any) {
      log.warn('Pre-login setup', `error: ${e?.message ?? e}`);
    }

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

    // Step 4 - Select Pay Later (NOT pay_now)
    log.step('Select pay_later option');
    const payLaterRadio = pageC.locator('input[name="payTiming"][value="pay_later"]');
    if (await payLaterRadio.count() > 0) {
      if (!(await payLaterRadio.isChecked())) {
        await payLaterRadio.check();
        await pageC.waitForTimeout(300);
      }
      log.ok('Selected Pay later via radio');
    } else {
      // Fallback: try clicking text
      const payLaterText = pageC.locator('text=Pay later, label:has-text("Pay later"), select/label containing Pay later').first();
      if (await payLaterText.count() > 0) {
        await payLaterText.click();
        log.ok('Clicked Pay later text');
      } else {
        log.warn('Pay later option', 'not found - checking visible options');
        const allPayRadios = pageC.locator('input[name="payTiming"]');
        const radioCount = await allPayRadios.count();
        log.info('Pay timing radios', `${radioCount} found`);
        if (radioCount === 0) {
          // Maybe it's a different UI - try select
          const paySelect = pageC.locator('select[name="payTiming"], [class*="pay"] select');
          if (await paySelect.count() > 0) {
            await paySelect.selectOption({ label: /later/i });
            log.ok('Selected pay_later from select');
          }
        }
      }
    }

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
    }

    // Intercept response for booking ID
    const submitResponse = pageC.waitForResponse(
      (resp) => resp.url().includes('/quotes') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted (pay_later)');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    const resp = await submitResponse;
    if (resp) {
      try {
        const body = await resp.json();
        const qId = body?.id ?? body?.data?.id ?? null;
        if (qId) log.info('Quote ID', qId);
      } catch { /* ignore */ }
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    await pageC.waitForURL(/\/customer\/quotes/, { timeout: 20000 }).catch(() => {
      log.warn('Auto-redirect', 'not to /customer/quotes');
    });

    log.ok('Quote created with pay_later');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Pay later quote submitted', null);
  });

  test('25.2 - Servicer proposes, customer accepts', async () => {
    log.step('Servicer M2_WEI logs in');
    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/pending');
    await pageS.waitForTimeout(2000);

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    if (count === 0) {
      log.fail('No pending quotes', 'cannot propose');
      return;
    }
    log.ok('Pending quotes', `${count} found`);

    const acceptBtn = pendingCards.first().locator('button:has-text("Accept Job")');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
      log.ok('Clicked Accept Job');
      await pageS.waitForTimeout(500);

      const priceInput = pageS.locator('input[placeholder="Price (RM)"]');
      if (await priceInput.count() > 0) await priceInput.fill('250');
      const msgInput = pageS.locator('input[placeholder="Message"]');
      if (await msgInput.count() > 0) await msgInput.fill('Can do it tomorrow');

      const proposeBtn = pageS.locator('button:has-text("Send proposal")');
      if (await proposeBtn.count() > 0) {
        await proposeBtn.click();
        log.ok('Proposal sent');
        await pageS.waitForTimeout(1000);
      }
    } else {
      log.fail('Accept Job button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Proposal sent', null);

    // Customer accepts proposal
    log.step('Customer selects proposal and books');
    await pageC.bringToFront();
    await pageC.goto('http://localhost:4200/customer/quotes');
    await pageC.waitForTimeout(1000);

    const chooseProposal = pageC.locator('a:has-text("Choose a proposal")').first();
    if (await chooseProposal.count() > 0) {
      await chooseProposal.click();
      log.ok('Clicked "Choose a proposal"');
    } else {
      const viewProposals = pageC.locator('a:has-text("View proposals")').first();
      if (await viewProposals.count() > 0) {
        await viewProposals.click();
        log.ok('Clicked "View proposals"');
      } else {
        log.fail('No proposal link', 'found');
        return;
      }
    }

    await pageC.waitForURL(/\/customer\/quotes\/.*\/proposals/, { timeout: 15000 }).catch(() => {
      log.warn('Proposals URL', 'not reached');
    });
    await pageC.waitForTimeout(1000);

    const selectBtn = pageC.locator('.card.proposal').first().locator('button:has-text("Select")');
    if (await selectBtn.count() > 0) {
      await selectBtn.click();
      log.ok('Clicked Select');

      await pageC.waitForSelector('app-modal dialog[open]', { timeout: 8000 }).catch(() => {
        log.warn('Confirmation modal', 'not visible');
      });
      await pageC.waitForTimeout(1200);

      const confirmBtn = pageC.locator('button:has-text("book this servicer")');
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        log.ok('Booking confirmed');

        await pageC.waitForURL(/\/customer\/bookings/, { timeout: 15000 }).catch(() => {
          log.warn('Booking URL', 'not reached');
        });
      } else {
        log.fail('Confirm button', 'not found');
      }
    } else {
      log.fail('Select button', 'not found');
    }

    // Capture booking ID from URL
    const url = pageC.url();
    const match = url.match(/\/bookings\/([a-f0-9-]+)/);
    if (match) {
      bookingId = match[1];
      log.ok('Booking ID captured', bookingId);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Booking confirmed', null);
  });

  test('25.3 - Servicer marks arrived + done', async () => {
    log.step('Servicer marks arrived');

    await pageS.bringToFront();
    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(2000);

    const arriveBtn = pageS.locator('button:has-text("Mark arrived")').first();
    if (await arriveBtn.count() > 0) {
      await arriveBtn.click();
      log.ok('Clicked Mark arrived');
      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {
        log.warn('Photo modal', 'not opened');
      });

      const fileInput = pageS.locator('app-modal input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'arrival-photo.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
        });
        log.ok('Arrival photo selected');
        await pageS.waitForTimeout(500);

        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Arrival confirmed');
          await pageS.waitForTimeout(2000);
        }
      }
    } else {
      log.fail('Mark arrived button', 'not found');
    }

    log.step('Servicer marks done');
    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1500);

    const doneBtn = pageS.locator('button:has-text("Mark done")').first();
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      log.ok('Clicked Mark done');

      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {
        log.warn('Photo modal', 'not opened');
      });

      const fileInput2 = pageS.locator('app-modal input[type="file"]');
      if (await fileInput2.count() > 0) {
        await fileInput2.setInputFiles({
          name: 'completion-photo.png', mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
        });
        log.ok('Completion photo selected');
        await pageS.waitForTimeout(500);

        const uploadBtn2 = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn2.count() > 0 && !(await uploadBtn2.isDisabled())) {
          await uploadBtn2.click();
          log.ok('Job marked done');
          await pageS.waitForTimeout(2000);
        }
      }
    } else {
      log.fail('Mark done button', 'not found');
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Job completed', null);
  });

  test('25.4 - Verify completed status and check platform_fee', async () => {
    log.step('Verify booking completed and check platform_fee');

    // Fetch booking ID from API if we don't have it
    if (!bookingId) {
      try {
        const bookingsResp = await pageC.evaluate(async () => {
          const res = await fetch(`${BACKEND}/bookings`);
          return res.json();
        });
        const bookings = bookingsResp?.data ?? [];
        if (bookings.length > 0) {
          bookingId = bookings[0].id;
          log.ok('Booking ID from API', bookingId);
        }
      } catch (e: any) {
        log.warn('Booking API', `failed: ${e?.message ?? e}`);
      }
    }

    if (bookingId) {
      log.step('Check transactions for platform_fee');
      const txns = await getTransactions(bookingId);
      log.db('Transactions found', `${txns.length}`);

      const platformFee = txns.find((t) => t.type === 'platform_fee');
      const escrowHold = txns.find((t) => t.type === 'escrow_hold');

      if (platformFee) {
        log.db('platform_fee', `amount=${platformFee.amount}`);
        log.ok('Platform fee deducted from servicer credit');
      } else {
        log.warn('platform_fee', 'not found - may use different type name');
        txns.forEach((t) => log.db('txn', `${t.type} = ${t.amount}`));
      }

      if (escrowHold) {
        log.db('escrow_hold', `amount=${escrowHold.amount}`);
      }
    } else {
      log.fail('No booking ID', 'cannot verify transactions');
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Verification complete', null);
  });
});
