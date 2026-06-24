import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 19;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 19 - Quote Images', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('19');
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

  test('19.1 - Login as C_FRESH', async () => {
    log.step('Login customer C_FRESH');
    await loginAs(page, 'C_FRESH', log);
    log.ok('Logged in as C_FRESH');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('C_FRESH logged in', null);
  });

  test('19.2 - Navigate to findService and select Aircon', async () => {
    log.step('Navigate to findService and select Aircon');

    await page.goto('http://localhost:4200/customer/findService');
    await page.waitForSelector('h1', { timeout: 10000 }).catch(() => {
      log.warn('Find service', 'h1 not found');
    });

    const airconCard = page.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    try {
      await expect(airconCard).toBeVisible({ timeout: 10000 });
    } catch {
      log.fail('Aircon card', 'not visible');
      await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
      return;
    }

    await airconCard.click();
    await page.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    log.ok('Navigated to quote form');

    await page.waitForSelector('.stepper', { timeout: 10000 }).catch(() => {
      log.warn('Stepper', 'not visible');
    });

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Quote form loaded', null);
  });

  test('19.3 - Upload image on quote form', async () => {
    log.step('Upload image on quote form');

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      const testImage = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      await fileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: testImage,
      });
      log.ok('Test image uploaded');
      await page.waitForTimeout(1000);
    } else {
      log.warn('File input', 'not found on current step, may be on a later step');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Image upload', null);
  });

  test('19.4 - Fill remaining quote fields and submit', async () => {
    log.step('Fill remaining quote fields and submit');

    const budgetSlider = page.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    const nextContact = page.locator('button:has-text("Next: Contact")').first();
    if (await nextContact.count() > 0) { await nextContact.click(); await page.waitForTimeout(700); }

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
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }

    const slotSelect = page.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ label: 'Morning (9:00-11:00)' });
    }

    const nextSummary = page.locator('button:has-text("Next: Summary")').first();
    if (await nextSummary.count() > 0) { await nextSummary.click(); await page.waitForTimeout(700); }

    const nextBill = page.locator('button:has-text("Next: Bill")').first();
    if (await nextBill.count() > 0) { await nextBill.click(); await page.waitForTimeout(700); }

    const payNowRadio = page.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      await page.waitForTimeout(300);
    }

    const creditRadio = page.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      await page.waitForTimeout(300);
    }

    const agreeCheckbox = page.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
    }

    const submitResponse = page.waitForResponse(
      (resp) => resp.url().includes('/quotes') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    const submitBtn = page.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted');
    } else {
      log.fail('Send request button', 'not found');
      await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
      return;
    }

    async function checkImageUpload(): Promise<void> {
      const resp = await submitResponse;
      if (resp) {
        try {
          const body = await resp.json();
          const quoteId = body?.id ?? body?.data?.id ?? null;
          if (quoteId) {
            log.ok('Quote ID captured', quoteId);
            const quoteDetail = await page.evaluate(
              async ({ apiBase, qId }) => {
                const res = await fetch(`${apiBase}/quotes/${qId}`, {
                  headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) return null;
                const json = await res.json();
                return json.data ?? json;
              },
              { apiBase: BACKEND, qId: quoteId },
            );
            if (quoteDetail) {
              const images = quoteDetail.images ?? quoteDetail.imageUrls ?? [];
              if (Array.isArray(images) && images.length > 0) {
                log.ok('Images found on quote', `${images.length} image(s)`);
              } else {
                log.warn('Images array', 'empty or not present on quote');
              }
            } else {
              log.warn('Quote detail', 'could not be fetched');
            }
          } else {
            log.warn('Quote ID', 'not found in submit response');
          }
        } catch {
          log.warn('Quote response', 'could not be parsed');
        }
      } else {
        log.warn('Submit response', 'not captured (timeout)');
      }
    }

    await checkImageUpload();

    await page.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });

    await page.waitForURL(/\/customer\/quotes/, { timeout: 20000 }).catch(() => {
      log.warn('Auto-redirect', 'did not navigate to /customer/quotes');
    });

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Quote with images submitted', null);
  });
});
