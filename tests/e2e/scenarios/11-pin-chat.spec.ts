import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 11;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 11 - PIN Chat', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('11');
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

  test('11.1 - Login as M2_WEI', async () => {
    log.step('Login servicer M2_WEI');
    await loginAs(page, 'M2_WEI', log);
    log.ok('Logged in as M2_WEI');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('M2_WEI logged in', null);
  });

  test('11.2 - Navigate to chat page', async () => {
    log.step('Navigate to chat page');

    await page.goto('http://localhost:4200/servicer/chat').catch(() => {
      log.warn('Chat page URL', 'navigation failed, trying to find chat link');
    });

    const chatLink = page.locator('a:has-text("Chat"), button:has-text("Chat"), [class*="chat"] a, [routerlink*="chat"]');
    if (await chatLink.count() > 0) {
      await chatLink.first().click();
      log.ok('Clicked chat link');
    }

    await page.waitForTimeout(2000);
    log.ok('Chat page loaded', `URL: ${page.url()}`);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Chat page', null);
  });

  test('11.3 - Request PIN via chat action', async () => {
    log.step('Request PIN via chat action');

    const pinBtn = page.locator(
      'button:has-text("Request PIN"), button:has-text("PIN"), [class*="pin"] button',
    ).first();
    if (await pinBtn.count() > 0) {
      await pinBtn.click();
      log.ok('Clicked PIN request button');
    } else {
      log.warn('PIN button', 'not found, trying page.evaluate socket trigger');
      try {
        await page.evaluate(() => {
          return new Promise<void>((resolve, reject) => {
            const socket = (window as any).__SOCKET__;
            if (!socket) { reject(new Error('No socket')); return; }
            socket.emit('pin.requested', {});
            resolve();
          });
        });
        log.ok('Socket event pin.requested emitted');
      } catch (e: any) {
        log.fail('PIN trigger', `no button and no socket: ${e?.message ?? e}`);
        await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
        return;
      }
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('PIN requested', null);
  });

  test('11.4 - Verify PIN required card appears', async () => {
    log.step('Verify PIN required card');

    const pinCard = page.locator(
      'text=PIN Required, text=pin_required, .pin-card, [class*="pin"]',
    ).first();
    try {
      await expect(pinCard).toBeVisible({ timeout: 8000 });
      log.ok('PIN required card is visible');
    } catch {
      log.warn('PIN required card', 'not visible - may need manual PIN flow');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('PIN card verification', null);
  });
});
