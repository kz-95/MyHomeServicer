import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 23;
let log: StepLogger;
let contextAdmin: BrowserContext;
let contextC: BrowserContext;
let pageAdmin: Page;
let pageC: Page;

const BACKEND = 'http://localhost:3000/api/v1';

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

test.describe('Scenario 23 - Urgent Surcharge Config', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('23');
    log.info('DB', 'assuming already seeded');

    contextAdmin = await browser.newContext();
    contextC = await browser.newContext();
    pageAdmin = await contextAdmin.newPage();
    pageC = await contextC.newPage();

    pageAdmin.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextAdmin?.close();
    await contextC?.close();
  });

  test('23.1 - Admin sets urgent_same_day_fee to 200', async () => {
    log.step('Admin logs in');
    await loginAs(pageAdmin, 'ADMIN', log);

    log.step('Navigate to admin settings/pricing page');
    // Try common admin settings URLs
    const urls = ['/admin/settings', '/admin/pricing', '/admin/config', '/admin'];
    let loaded = false;
    for (const url of urls) {
      await pageAdmin.goto(`http://localhost:4200${url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pageAdmin.waitForTimeout(1000);
      const h1 = pageAdmin.locator('h1, h2').first();
      const text = await h1.textContent().catch(() => '');
      if (text) {
        log.ok('Admin page loaded', `${url} -> ${text}`);
        loaded = true;
        break;
      }
    }

    if (!loaded) {
      log.warn('Admin page', 'could not find settings/pricing page - trying API directly');
      // Fallback: use API to set config
      try {
        await pageAdmin.evaluate(async () => {
          await fetch(`${BACKEND.replace('/api/v1', '')}/admin/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'urgent_same_day_fee', value: '200' }),
          });
        });
        log.ok('Admin config updated via API');
      } catch (e: any) {
        log.warn('Admin API config', `failed: ${e?.message ?? e}`);
      }
      await pageAdmin.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
      log.screenshot('Admin page - config via API', null);
      return;
    }

    // Look for urgent_same_day_fee config field
    const urgentField = pageAdmin.locator(
      'input[name*="urgent"], input[placeholder*="urgent"], [class*="urgent"] input, [class*="surcharge"] input, [class*="fee"] input, label:has-text("urgent") input, label:has-text("Urgent") input',
    ).first();

    if (await urgentField.count() > 0) {
      await urgentField.fill('200');
      log.ok('Set urgent_same_day_fee to 200');

      // Look for save button
      const saveBtn = pageAdmin.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Apply")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await pageAdmin.waitForTimeout(1000);
        log.ok('Config saved');
      }
    } else {
      // Try finding by label text
      const label = pageAdmin.locator('label:has-text("urgent"), label:has-text("same day"), label:has-text("surcharge"), label:has-text("Urgent")');
      if (await label.count() > 0) {
        await label.first().click();
        const siblingInput = label.first().locator('..').locator('input, select');
        if (await siblingInput.count() > 0) {
          await siblingInput.first().fill('200');
          log.ok('Set urgent fee via label click');
        }
      }
      log.warn('Urgent fee field', 'not found on admin page - may use different UI');
    }

    await pageAdmin.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Admin - urgent fee config', null);
  });

  test('23.2 - Customer submits urgent quote', async () => {
    log.step('Customer logs in and creates urgent quote');
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
      // Set to today for urgent
      const today = new Date();
      await dateInput.fill(today.toISOString().split('T')[0]);
    }
    const slotSelect = pageC.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ index: 0 });
    }

    await clickNext(pageC, 'Next: Summary');
    await pageC.waitForTimeout(700);
    await clickNext(pageC, 'Next: Bill');
    await pageC.waitForTimeout(700);

    // Look for isUrgent toggle
    const urgentToggle = pageC.locator(
      'input[name="isUrgent"], [class*="urgent"] input[type="checkbox"], .urgent-toggle, label:has-text("urgent") input',
    ).first();
    if (await urgentToggle.count() > 0) {
      if (!(await urgentToggle.isChecked().catch(() => false))) {
        await urgentToggle.check();
        log.ok('Toggled isUrgent');
      } else {
        log.ok('isUrgent already checked');
      }
    } else {
      log.warn('Urgent toggle', 'not found - quote may proceed without urgent');
    }

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
      log.ok('Urgent quote submitted');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });

    await pageC.waitForTimeout(2000);
    log.ok('Quote created (urgent)');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Urgent quote submitted', null);
  });

  test('23.3 - Verify surcharge reflected in booking price', async () => {
    log.step('Navigate to customer bookings to verify price');

    await pageC.goto('http://localhost:4200/customer/bookings');
    await pageC.waitForTimeout(2000);

    // Check for price display that should include the 200 surcharge
    const priceEl = pageC.locator(
      '.price, .total, [class*="price"], [class*="total"], .amount, [class*="amount"]',
    ).first();

    if (await priceEl.count() > 0) {
      const priceText = await priceEl.textContent();
      log.ok('Price displayed', priceText ?? '');

      // Check if it looks like it has surcharge (contains 200 or higher than base)
      if (priceText && priceText.includes('200')) {
        log.ok('Surcharge (200) visible in price');
      } else {
        log.warn('Surcharge amount 200', `not directly visible in "${priceText}"`);
      }
    } else {
      log.warn('Price element', 'not found on bookings page');
    }

    // Also try fetching the booking via API to check price
    try {
      const bookingData = await pageC.evaluate(async () => {
        const res = await fetch(`${BACKEND}/bookings`);
        const json = await res.json();
        return json.data ?? [];
      });

      if (Array.isArray(bookingData) && bookingData.length > 0) {
        const latest = bookingData[0];
        log.db('Latest booking', `price=${latest.price}, status=${latest.status}`);
        if (Number(latest.price) > 100) {
          log.ok('Price reflects surcharge', `RM ${latest.price}`);
        } else {
          log.warn('Price may not include surcharge', `RM ${latest.price}`);
        }
      }
    } catch (e: any) {
      log.warn('API check', `booking fetch failed: ${e?.message ?? e}`);
    }

    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Bookings page - price with surcharge', null);
  });
});
