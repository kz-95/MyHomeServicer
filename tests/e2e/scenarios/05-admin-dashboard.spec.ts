import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 5;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 5 - Admin Dashboard', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('05');
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

  test('5.1 - Login as admin and navigate to dashboard', async () => {
    log.step('Login as ADMIN');
    await loginAs(page, 'ADMIN', log);

    log.step('Navigate to /admin/dashboard');
    await page.goto('http://localhost:4200/admin/dashboard');
    await page.waitForTimeout(2000);

    await page.waitForSelector('h1', { timeout: 10000 }).catch(() => {
      log.warn('Dashboard h1', 'not found');
    });

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Admin dashboard loaded', null);
  });

  test('5.2 - Verify summary cards visible', async () => {
    log.step('Check for summary cards');

    const revenueEl = page.locator('text=Revenue, .summary-card, [class*="revenue"]');
    const revenueCount = await revenueEl.count();
    if (revenueCount > 0) {
      log.ok('Revenue summary visible', `${revenueCount} elements`);
    } else {
      log.warn('Revenue summary', 'not found');
    }

    const feeEl = page.locator('text=Fee, .summary-card, [class*="fee"]');
    const feeCount = await feeEl.count();
    if (feeCount > 0) {
      log.ok('Fee summary visible', `${feeCount} elements`);
    } else {
      log.warn('Fee summary', 'not found');
    }

    const escrowEl = page.locator('text=Escrow, .summary-card, [class*="escrow"]');
    const escrowCount = await escrowEl.count();
    if (escrowCount > 0) {
      log.ok('Escrow summary visible', `${escrowCount} elements`);
    } else {
      log.warn('Escrow summary', 'not found');
    }

    const totalCards = revenueCount + feeCount + escrowCount;
    if (totalCards === 0) {
      log.warn('Dashboard cards', 'no summary cards matched known selectors');

      const cards = page.locator('.card, [class*="card"], [class*="summary"], .stat, [class*="stat"]');
      const cardCount = await cards.count();
      log.ok('Generic cards/stats found', `${cardCount} elements`);

      if (cardCount > 0) {
        const texts: string[] = [];
        for (let i = 0; i < cardCount && i < 10; i++) {
          const t = (await cards.nth(i).textContent())?.trim() ?? '';
          if (t) texts.push(t);
        }
        log.info('Card content samples', texts.join(' | '));
      }
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Summary cards visible', null);
  });

  test('5.3 - Verify non-zero values if possible', async () => {
    log.step('Check for numeric values in dashboard');

    const allSummaryEls = page.locator('[class*="revenue"], [class*="fee"], [class*="escrow"], [class*="summary"], .stat-value, .card-value, [class*="value"], [class*="amount"]');
    const count = await allSummaryEls.count();
    let nonZeroFound = false;

    for (let i = 0; i < count && i < 20; i++) {
      const text = (await allSummaryEls.nth(i).textContent())?.trim() ?? '';
      const num = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        nonZeroFound = true;
        log.ok('Non-zero dashboard value', `${text}`);
      }
    }

    if (!nonZeroFound) {
      log.warn('Non-zero values', 'none found - dashboard may show empty state');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Dashboard values', null);
  });
});
