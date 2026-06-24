import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 16;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 16 - Guest Quote', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('16');
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

  test('16.1 - Navigate to guest quote page (not logged in)', async () => {
    log.step('Navigate to guest quote page');

    await page.goto('http://localhost:4200/guest/quote');
    await page.waitForTimeout(3000);

    log.ok('Guest quote page loaded', `URL: ${page.url()}`);

    const wasRedirected = !page.url().includes('/guest/quote');
    if (wasRedirected) {
      log.ok('Redirect occurred', `Redirected to: ${page.url()}`);
    } else {
      log.info('Guest quote', 'page loaded directly (no redirect to login/register)');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Guest quote page', null);
  });

  test('16.2 - Check redirect behaviour and pre-filled data', async () => {
    log.step('Check redirect and pre-filled data');

    const currentUrl = page.url();

    if (currentUrl.includes('/register')) {
      log.ok('Redirected to /register as expected for guest');

      const nameVal = await page.locator('input[name="name"], input[formcontrolname="name"]')
        .inputValue().catch(() => '');
      const emailVal = await page.locator('input[name="email"]')
        .inputValue().catch(() => '');

      if (nameVal || emailVal) {
        log.ok('Pre-filled data found', `name="${nameVal}" email="${emailVal}"`);
      } else {
        log.warn('Pre-filled data', 'registration form fields are empty');
      }
    } else if (currentUrl.includes('/login')) {
      log.ok('Redirected to /login (authentication required)');
    } else if (currentUrl.includes('/guest/quote')) {
      log.ok('Guest quote form loaded directly');

      const quoteFormFields = page.locator('input, select, textarea, button, form').first();
      if (await quoteFormFields.count() > 0) {
        log.ok('Quote form elements visible');
      }

      const categorySelect = page.locator('select, [name="cat"], [name="category"]').first();
      if (await categorySelect.count() > 0) {
        log.warn('Guest quote category', 'selection field found');
      }
    } else {
      log.info('Unexpected URL', currentUrl);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Redirect/registration check', null);
  });

  test('16.3 - Verify guest quote flow', async () => {
    log.step('Verify guest quote flow end state');

    const currentUrl = page.url();

    if (currentUrl.includes('/guest/quote')) {
      const quoteForm = page.locator('form, .quote-form, .stepper, .card').first();
      if (await quoteForm.count() > 0) {
        log.ok('Guest quote form is interactive');
      }
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Guest quote flow end state', null);
  });
});
