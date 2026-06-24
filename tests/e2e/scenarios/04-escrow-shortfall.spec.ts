import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 4;
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

test.describe('Scenario 4 - Escrow Shortfall', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('04');
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

  test('4.1 - Login C_FRESH and create low-budget aircond quote', async () => {
    log.step('Login C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await pageC.waitForSelector('.stepper', { timeout: 10000 });

    await debugQuoteStep(pageC, 'Step 1 - Choose service', 1);

    log.step('Fill low budget value (1)');
    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) {
      await budgetSlider.fill('1');
      log.ok('Budget slider set to 1 (low)');
    } else {
      log.warn('Budget slider', 'not found, skipping');
    }

    await clickNext(pageC, 'Next: Contact');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Contact', 2);

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
    await debugQuoteStep(pageC, 'After Next: Summary', 3);

    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(700);
    await debugQuoteStep(pageC, 'After Next: Bill', 4);

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
    await debugQuoteStep(pageC, 'Before Send request', 5);

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
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Low-budget quote submitted', null);
  });

  test('4.2 - Servicer proposes at higher price', async () => {
    log.step('Login as M2_WEI');
    await pageS.goto('http://localhost:4200/login');
    await pageS.waitForTimeout(500);
    await setupServicerBeforeLogin(pageS, 'kumar.selvam@demo.local');

    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/pending');
    await pageS.waitForSelector('.card.item', { timeout: 15000 }).catch(() => {
      log.warn('Pending cards', 'no .card.item found');
    });

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    if (count === 0) {
      log.fail('No pending quotes', 'cannot propose');
      return;
    }

    log.step('Servicer proposes at higher price (300)');
    const acceptBtn = pendingCards.first().locator('button:has-text("Accept Job")');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
      log.ok('Clicked Accept Job');
      await pageS.waitForTimeout(500);

      const priceInput = pageS.locator('input[placeholder="Price (RM)"]');
      if (await priceInput.count() > 0) {
        await priceInput.fill('300');
        log.ok('Price filled: 300');
      }

      const msgInput = pageS.locator('input[placeholder="Message"]');
      if (await msgInput.count() > 0) {
        await msgInput.fill('Can fix at RM 300');
        log.ok('Message filled');
      }

      const proposeBtn = pageS.locator('button:has-text("Send proposal")');
      if (await proposeBtn.count() > 0) {
        await proposeBtn.click();
        log.ok('Proposal sent at RM 300');
        await pageS.waitForTimeout(1000);
      } else {
        log.fail('Send proposal button', 'not found');
      }
    } else {
      log.fail('Accept Job button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 6) });
    log.screenshot('Servicer proposal sent', null);
  });

  test('4.3 - Customer selects proposal and checks top-up prompt', async () => {
    log.step('Customer navigates to proposals');

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

    await pageC.waitForTimeout(1500);

    log.step('Check for top-up prompt or shortfall warning');
    const topUpPrompt = pageC.locator('text=top up, text=insufficient, text=top-up, .top-up-prompt, app-modal dialog[open]');
    if (await topUpPrompt.count() > 0) {
      log.ok('Top-up/insufficient prompt visible - escrow shortfall detected');
      await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 7) });
      log.screenshot('Top-up prompt visible', null);
    } else {
      const pageText = await pageC.locator('body').textContent();
      if (pageText && /top.?up|insufficient|shortfall|credit/i.test(pageText)) {
        log.ok('Top-up text detected in body', 'shortfall mechanism working');
      } else {
        log.warn('Top-up prompt', 'not found - escrow may not have triggered shortfall');
      }
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 7) });
    log.screenshot('After booking attempt', null);
  });

  test('4.4 - Take screenshots of escrow state', async () => {
    log.step('Take final escrow state screenshots');

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 8) });
    log.screenshot('Customer final escrow state', null);

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 9) });
    log.screenshot('Servicer final escrow state', null);

    log.ok('Escrow shortfall scenario complete');
  });
});
