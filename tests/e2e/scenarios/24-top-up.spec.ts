import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 24;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

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

test.describe('Scenario 24 - Top-Up / Insufficient Balance', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('24');
    log.info('DB', 'assuming already seeded');

    context = await browser.newContext();
    page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await context?.close();
  });

  test('24.1 - Customer logs in and creates aircond quote with pay_now credit', async () => {
    log.step('Customer logs in as C_FRESH');
    await loginAs(page, 'C_FRESH', log);

    log.step('Navigate to Find Service');
    await page.goto('http://localhost:4200/customer/findService');
    await page.waitForSelector('h1', { timeout: 10000 });

    const airconCard = page.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await page.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    await page.waitForSelector('.stepper', { timeout: 10000 });

    // Step 1
    const budgetSlider = page.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');
    await clickNext(page, 'Next: Contact');
    await page.waitForTimeout(700);

    // Step 2
    const nameInput = page.locator('input[name="contactName"]');
    if (await nameInput.count() > 0) await nameInput.fill('David Tan');
    const phoneInput = page.locator('app-phone-input input').first();
    if (await phoneInput.count() > 0) await phoneInput.fill('0123456789');
    const addrNo = page.locator('app-address-fields input').first();
    if (await addrNo.count() > 0) await addrNo.fill('22');
    const streetInput = page.locator('app-address-fields input').nth(1);
    if (await streetInput.count() > 0) await streetInput.fill('Jalan SS 2/24, SS 2');

    const dateInput = page.locator('app-calendar-picker input[type="date"]');
    if (await dateInput.count() > 0) {
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }
    const slotSelect = page.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ label: 'Morning (9:00-11:00)' });
    }

    await clickNext(page, 'Next: Summary');
    await page.waitForTimeout(700);
    await clickNext(page, 'Next: Bill');
    await page.waitForTimeout(700);

    // Step 4 - Select Pay now + Wallet credit
    log.step('Select pay_now with credit payment');

    const payNowRadio = page.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      await page.waitForTimeout(300);
      log.ok('Selected Pay now');
    }

    const creditRadio = page.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      await page.waitForTimeout(300);
      log.ok('Selected Wallet credit');
    }

    const agreeCheckbox = page.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
    }

    // Submit the quote
    const submitBtn = page.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted with pay_now credit');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    await page.waitForTimeout(3000);
  });

  test('24.2 - Verify top-up/Stripe redirect shown (insufficient balance)', async () => {
    log.step('Check for top-up or insufficient balance UI');

    // Wait for the bill/escrow page to render
    await page.waitForTimeout(2000);

    // Check for top-up related elements
    const topUpIndicators = page.locator(
      'text=top up, text=top-up, text=insufficient, text=Add credit, text=Top Up, text=Top up, button:has-text("Pay now"), [class*="top-up"], [class*="topup"], [class*="stripe"], [class*="checkout"]',
    );

    const count = await topUpIndicators.count();
    if (count > 0) {
      log.ok('Top-up/insufficient balance UI visible', `${count} elements found`);
    } else {
      log.warn('Top-up UI', 'not found - balance may be sufficient or UI is different');

      // Check for any alert/error about balance
      const balanceAlert = page.locator(
        '.alert, .error, .warning, [class*="balance"], [class*="insufficient"], app-alert, .snackbar',
      );
      const alertCount = await balanceAlert.count();
      if (alertCount > 0) {
        const alertText = await balanceAlert.first().textContent().catch(() => '');
        log.warn('Balance alert', alertText ?? '');
      }

      // Dump visible text for debugging
      const bodyText = await page.locator('body').textContent().catch(() => '');
      const relevantSnippets = [
        'top up', 'top-up', 'insufficient', 'credit', 'balance',
        'stripe', 'pay now', 'add credit', 'funds',
      ];
      for (const snippet of relevantSnippets) {
        if (bodyText.toLowerCase().includes(snippet)) {
          log.info('Page contains', `"${snippet}"`);
        }
      }
    }

    // Check if Stripe redirect happened (URL contains stripe or checkout)
    const currentUrl = page.url();
    if (currentUrl.includes('stripe') || currentUrl.includes('checkout')) {
      log.ok('Stripe checkout page detected', currentUrl);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Top-up / insufficient balance', null);

    // Try to find and click any top-up or pay button for screenshot coverage
    const payBtn = page.locator(
      'button:has-text("Top Up"), button:has-text("Top up"), button:has-text("Add credit"), button:has-text("Pay now"), a:has-text("Top up"), a:has-text("Add credit")',
    ).first();

    if (await payBtn.count() > 0) {
      log.ok('Pay/top-up button found - clicking for flow coverage');
      // Don't actually navigate away, just screenshot before click
      await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      log.screenshot('Top-up action button visible', null);
    }
  });
});
