import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 10;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 10 - Guard: Auth Redirect (No Login)', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('10');
    log.info('Auth', 'testing redirect to /login for unauthenticated user');

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

  test('10.1 - Navigate to /servicer/jobs without login', async () => {
    log.step('Navigate directly to /servicer/jobs (unauthenticated)');
    await page.goto('http://localhost:4200/servicer/jobs');
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    log.ok('Current URL', currentUrl);

    if (currentUrl.includes('/login')) {
      log.ok('Redirected to /login', 'auth guard working correctly');
    } else {
      log.warn('Redirect', `expected /login, got: ${currentUrl}`);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Redirect to login', null);
  });

  test('10.2 - Verify URL contains /login', async () => {
    log.step('Verify redirect URL');

    const currentUrl = page.url();
    expect(currentUrl).toContain('/login');
    log.ok('URL assertion passed', `URL includes /login: ${currentUrl}`);

    const loginForm = page.locator('input[name="email"], input[name="password"], button:has-text("Sign in")');
    const formCount = await loginForm.count();
    if (formCount > 0) {
      log.ok('Login form elements visible', `${formCount} element(s)`);
    } else {
      log.warn('Login form', 'no form elements found on /login page');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Login page verified', null);
  });
});
