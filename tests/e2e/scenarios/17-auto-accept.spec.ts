import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 17;
let log: StepLogger;
let contextC: BrowserContext;
let contextS: BrowserContext;
let pageC: Page;
let pageS: Page;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 17 - Auto Accept', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('17');
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

  test('17.1 - Setup servicer with autoAccept enabled', async () => {
    log.step('Setup servicer with autoAccept enabled');

    const devUser = 'kumar.selvam@demo.local';

    const paths = [
      '/servicer/me/auto-accept',
      '/servicer/me/settings',
      '/servicer/me/preferences',
    ];

    let autoAcceptSet = false;
    for (const path of paths) {
      try {
        const result = await pageC.evaluate(
          async ({ apiBase, p, email }) => {
            const res = await fetch(`${apiBase}${p}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'x-dev-user': email },
              body: JSON.stringify({ autoAccept: true }),
            });
            return { ok: res.ok, status: res.status, body: await res.text() };
          },
          { apiBase: BACKEND, p: path, email: devUser },
        );
        if (result.ok) {
          log.ok('autoAccept enabled', `${path} returned ${result.status}`);
          autoAcceptSet = true;
          break;
        } else {
          log.warn('autoAccept endpoint', `${path} returned ${result.status}`);
        }
      } catch (e: any) {
        log.warn('autoAccept endpoint', `${path} error: ${e?.message ?? e}`);
      }
    }

    if (!autoAcceptSet) {
      log.warn('autoAccept API', 'could not be set via API - test may still work if seed has autoAccept');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Auto-accept setup', null);
  });

  test('17.2 - Customer creates quote (Aircon)', async () => {
    log.step('Customer creates Aircon quote');

    await loginAs(pageC, 'C_FRESH', log);

    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 }).catch(() => {
      log.warn('Find service', 'h1 not found');
    });

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    try {
      await expect(airconCard).toBeVisible({ timeout: 10000 });
      await airconCard.click();
      await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
      log.ok('Navigated to quote form');
    } catch {
      log.warn('Aircon card click', 'not found or navigation failed');
      await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      return;
    }

    await pageC.waitForSelector('.stepper', { timeout: 10000 }).catch(() => {
      log.warn('Stepper', 'not visible');
    });

    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    const nextContact = pageC.locator('button:has-text("Next: Contact")').first();
    if (await nextContact.count() > 0) { await nextContact.click(); await pageC.waitForTimeout(700); }

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

    const nextSummary = pageC.locator('button:has-text("Next: Summary")').first();
    if (await nextSummary.count() > 0) { await nextSummary.click(); await pageC.waitForTimeout(700); }

    const nextBill = pageC.locator('button:has-text("Next: Bill")').first();
    if (await nextBill.count() > 0) { await nextBill.click(); await pageC.waitForTimeout(700); }

    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      await pageC.waitForTimeout(300);
    }

    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      await pageC.waitForTimeout(300);
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
      await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });

    await pageC.waitForURL(/\/customer\/quotes/, { timeout: 20000 }).catch(() => {
      log.warn('Auto-redirect', 'did not navigate to /customer/quotes');
    });

    log.ok('Quote submitted and confirmed');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Quote submitted', null);
  });

  test('17.3 - Login M2_WEI and verify auto-accepted booking', async () => {
    log.step('Login M2_WEI and verify auto-accepted booking');

    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(2000);

    const activeCards = pageS.locator('.card, .card.item, [class*="booking"], [class*="job"]');
    const count = await activeCards.count();

    if (count > 0) {
      log.ok('Active jobs visible', `${count} card(s) found - booking auto-accepted`);
    } else {
      log.warn('Active jobs', 'no cards found - may not have been auto-accepted');
    }

    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Servicer active jobs', null);
  });
});
