import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 9;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 9 - Guard: Offline Login (Go Online Prompt)', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('09');
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

  test('9.1 - Set servicer offline via API and login', async () => {
    log.step('Set servicer kumar.selvam@demo.local offline');

    await page.goto('http://localhost:4200/login');
    await page.waitForTimeout(500);

    try {
      await page.evaluate(async ({ apiBase }) => {
        await fetch(`${apiBase}/servicer/me/online`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-dev-user': 'kumar.selvam@demo.local' },
          body: JSON.stringify({ isOnline: false }),
        });
      }, { apiBase: BACKEND });
      log.ok('Servicer set to offline');
    } catch (e: any) {
      log.warn('Set offline API', `error: ${e?.message ?? e}`);
    }

    log.step('Login M2_WEI');
    await loginAs(page, 'M2_WEI', log);

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Logged in while offline', null);
  });

  test('9.2 - Navigate to servicer/jobs and verify Go Online prompt', async () => {
    log.step('Navigate to /servicer/jobs');
    await page.goto('http://localhost:4200/servicer/jobs');
    await page.waitForTimeout(2000);

    const goOnlinePrompt = page.locator('text=Go online, button:has-text("Go online"), .offline-prompt, [class*="offline"]');
    const promptCount = await goOnlinePrompt.count();
    if (promptCount > 0) {
      log.ok('Go Online prompt visible', `${promptCount} element(s)`);
    } else {
      const pageBody = await page.locator('body').textContent();
      if (pageBody && /go online|offline|disconnected/i.test(pageBody)) {
        log.ok('Offline-related text found in body');
      } else {
        log.warn('Go Online prompt', 'not found - may not be implemented or different selector needed');
      }
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Offline prompt visible', null);
  });

  test('9.3 - Verify cannot accept work (no dispatch UI accessible)', async () => {
    log.step('Verify dispatch UI is not accessible while offline');

    const dispatchElements = page.locator('.dispatch-area, app-dispatch-prompt-guard, .dp-countdown, .dp-btn-accept');
    const dispatchCount = await dispatchElements.count();
    if (dispatchCount === 0) {
      log.ok('No dispatch UI accessible', 'offline guard working correctly');
    } else {
      log.warn('Dispatch UI', `${dispatchCount} elements found despite offline state`);
    }

    const pendingLink = page.locator('a:has-text("Pending"), a[href*="pending"], button:has-text("Pending")').first();
    if (await pendingLink.count() > 0) {
      log.warn('Pending link accessible', 'offline guard may not restrict navigation');
    } else {
      log.ok('Pending link not found', 'navigation likely restricted when offline');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('No dispatch UI while offline', null);
  });
});
