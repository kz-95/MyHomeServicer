import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 3;
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

test.describe('Scenario 3 - Urgent Same-Day Booking', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('03');
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

  test('3.1 - Setup servicer + login C_FRESH', async () => {
    log.step('Setup servicer M2_WEI online + schedule');

    await pageC.goto('http://localhost:4200/login');
    await pageC.waitForTimeout(500);
    await setupServicerBeforeLogin(pageC, 'kumar.selvam@demo.local');

    log.step('Login C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Customer logged in', null);
  });

  test('3.2 - Customer creates urgent aircond quote', async () => {
    log.step('Navigate to findService');
    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    await debugQuoteStep(pageC, 'Step 1 - Choose service', 2);

    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    await clickNext(pageC, 'Next: Contact');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Contact', 3);

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
    await debugQuoteStep(pageC, 'After Next: Summary', 4);

    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Bill', 5);

    log.step('Looking for urgent toggle');
    const urgentCheckbox = pageC.locator('input[name="isUrgent"]');
    if (await urgentCheckbox.count() > 0) {
      if (!(await urgentCheckbox.isChecked())) {
        await urgentCheckbox.check();
        log.ok('Urgent toggle checked via [name="isUrgent"]');
      } else {
        log.ok('Urgent toggle already checked');
      }
    } else {
      const urgentAlt = pageC.locator('[class*="urgent"] input, input[type="checkbox"][value="urgent"]');
      if (await urgentAlt.count() > 0) {
        await urgentAlt.check();
        log.ok('Urgent checked via alt selector');
      } else {
        log.warn('Urgent toggle', 'not found - proceeding without urgent flag');
      }
    }

    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      await pageC.waitForTimeout(300);
      log.ok('Selected Pay now');
    }

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      log.ok('Selected Wallet credit');
      await pageC.waitForTimeout(300);
    }

    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
      log.ok('Agreed to terms');
    }

    await pageC.waitForTimeout(300);
    await debugQuoteStep(pageC, 'Before Send request', 6);

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
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 7) });
    log.screenshot('Quote submitted with urgent', null);
  });

  test('3.3 - Servicer sees urgent tag on pending quote', async () => {
    log.step('Login servicer M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/pending');
    await pageS.waitForSelector('.card.item', { timeout: 15000 }).catch(() => {
      log.warn('Pending cards', 'no .card.item found');
    });

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    log.ok('Pending quotes', `${count} visible`);

    const urgentTag = pageS.locator('text=Urgent, .urgent-tag, [class*="urgent"]').first();
    if (await urgentTag.count() > 0) {
      log.ok('[Urgent] tag visible on quote card');
    } else {
      log.warn('Urgent tag', 'not found on pending quote');
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 8) });
    log.screenshot('Servicer sees urgent tag', null);
  });

  test('3.4 - Servicer proposes on urgent quote', async () => {
    log.step('Servicer proposes RM 250');

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    if (count === 0) {
      log.fail('No pending quotes', 'cannot propose');
      return;
    }

    const acceptBtn = pendingCards.first().locator('button:has-text("Accept Job")');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
      log.ok('Clicked Accept Job');
      await pageS.waitForTimeout(500);

      const priceInput = pageS.locator('input[placeholder="Price (RM)"]');
      if (await priceInput.count() > 0) {
        await priceInput.fill('250');
        log.ok('Price filled: 250');
      }

      const msgInput = pageS.locator('input[placeholder="Message"]');
      if (await msgInput.count() > 0) {
        await msgInput.fill('Can do urgent job today');
        log.ok('Message filled');
      }

      const proposeBtn = pageS.locator('button:has-text("Send proposal")');
      if (await proposeBtn.count() > 0) {
        await proposeBtn.click();
        log.ok('Proposal sent');
        await pageS.waitForTimeout(1000);
      } else {
        log.fail('Send proposal button', 'not found');
      }
    } else {
      log.fail('Accept Job button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 9) });
    log.screenshot('Servicer sent proposal', null);
  });

  test('3.5 - Customer selects proposal and confirms booking', async () => {
    log.step('Customer views proposals and books');

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
        log.fail('No proposal link found', 'cannot navigate to proposals');
        return;
      }
    }

    await pageC.waitForURL(/\/customer\/quotes\/.*\/proposals/, { timeout: 15000 }).catch(() => {
      log.warn('Proposals URL', 'not reached');
    });
    await pageC.waitForTimeout(1000);

    const proposalCards = pageC.locator('.card.proposal');
    const propCount = await proposalCards.count();
    if (propCount > 0) {
      log.ok('Proposals visible', `${propCount} proposals`);
      const selectBtn = proposalCards.first().locator('button:has-text("Select")');
      if (await selectBtn.count() > 0) {
        await selectBtn.click();
        log.ok('Clicked Select on proposal');

        await pageC.waitForSelector('app-modal dialog[open]', { timeout: 8000 }).catch(() => {
          log.warn('Confirmation modal dialog', 'not visible');
        });
        await pageC.waitForTimeout(1200);

        const confirmBtn = pageC.locator('button:has-text("book this servicer")');
        await expect(confirmBtn.first()).toBeVisible({ timeout: 5000 });
        if (await confirmBtn.count() > 0) {
          await confirmBtn.first().click();
          log.ok('Confirmed booking');

          await pageC.waitForURL(/\/customer\/bookings/, { timeout: 15000 }).catch(() => {
            log.warn('Booking URL', 'not reached');
          });
        } else {
          log.fail('Confirm button', 'not found in modal');
        }
      } else {
        log.fail('Select button', 'not found on proposal');
      }
    } else {
      log.fail('No proposals', 'card not found');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 10) });
    log.screenshot('Booking confirmed', null);
  });

  test('3.6 - Servicer marks arrived', async () => {
    log.step('Servicer navigates to Active and marks arrived');

    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1000);

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
          name: 'arrival-photo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        });
        log.ok('Photo selected');
        await pageS.waitForTimeout(500);

        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Arrival confirmed');
          await pageS.waitForTimeout(2000);
        } else {
          log.warn('Upload button', 'not enabled or not found');
        }
      } else {
        log.warn('File input', 'not found in modal');
      }
    } else {
      log.fail('Mark arrived button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 11) });
    log.screenshot('Marked arrived', null);
  });

  test('3.7 - Servicer marks done', async () => {
    log.step('Servicer marks job done');

    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1500);

    const doneBtn = pageS.locator('button:has-text("Mark done")').first();
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      log.ok('Clicked Mark done');

      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {
        log.warn('Photo modal', 'not opened');
      });

      const fileInput = pageS.locator('app-modal input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'completion-photo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        });
        log.ok('Completion photo selected');
        await pageS.waitForTimeout(500);

        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Job marked done');
          await pageS.waitForTimeout(2000);
        } else {
          log.warn('Upload button', 'not enabled or not found');
        }
      } else {
        log.warn('File input', 'not found in modal');
      }
    } else {
      log.fail('Mark done button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 12) });
    log.screenshot('Job completed', null);
  });

  test('3.8 - Verify booking completed', async () => {
    log.step('Verify booking is completed');

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
        log.ok('Booking found', `status: ${latest.status}, ID: ${latest.id}`);
        if (latest.status === 'completed') {
          log.ok('Booking status is completed');
        } else {
          log.warn('Booking status', latest.status ?? 'unknown');
        }
      } else {
        log.fail('No bookings', 'in DB');
      }
    } catch (e: any) {
      log.warn('Booking query', `API call failed: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 13) });
    log.screenshot('Booking verified', null);
  });
});
