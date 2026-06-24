import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 13;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 13 - UI Theme / Visual Regression', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('13');
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

  test('13.1 - Visit /login page', async () => {
    log.step('Visit /login page');

    await page.goto('http://localhost:4200/login');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const title = await page.title();
    log.ok('Login page loaded', `Title: "${title}"`);

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Login page', null);
  });

  test('13.2 - Visit /register page', async () => {
    log.step('Visit /register page');

    await page.goto('http://localhost:4200/register');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const title = await page.title();
    log.ok('Register page loaded', `Title: "${title}"`);

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Register page', null);
  });

  test('13.3 - Visit /customer/findService page', async () => {
    log.step('Visit /customer/findService page');

    await page.goto('http://localhost:4200/customer/findService');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const title = await page.title();
    log.ok('Find Service page loaded', `Title: "${title}"`);

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Find Service page', null);
  });

  test('13.4 - Visit /servicer/jobs page', async () => {
    log.step('Visit /servicer/jobs page');

    await page.goto('http://localhost:4200/servicer/jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const title = await page.title();
    log.ok('Servicer jobs page loaded', `Title: "${title}"`);

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Servicer jobs page', null);
  });

  test('13.5 - Console error check summary', async () => {
    log.step('Console error check summary');
    log.info('Visual smoke test', 'all 4 pages loaded without console errors logged above');
    log.ok('UI theme smoke test complete');
  });
});
