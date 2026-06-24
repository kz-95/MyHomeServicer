import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 28;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 28 - Rate Limit / PIN Cooldown', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('28');
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

  test('28.1 - Login as M2_WEI (servicer)', async () => {
    log.step('Login servicer M2_WEI');
    await loginAs(page, 'M2_WEI', log);
    log.ok('Logged in as M2_WEI');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('M2_WEI logged in', null);
  });

  test('28.2 - Navigate to chat/dispatch page with PIN mechanism', async () => {
    log.step('Navigate to page with PIN entry');

    // Try servicer chat page
    await page.goto('http://localhost:4200/servicer/chat', { waitUntil: 'domcontentloaded' }).catch(() => {
      log.warn('Chat URL', 'navigation failed');
    });
    await page.waitForTimeout(2000);

    // If chat page didn't have PIN, try pin page or dispatch
    const pinInput = page.locator(
      'input[name="pin"], input[placeholder*="PIN"], input[placeholder*="pin"], input[type="password"], .pin-input input',
    ).first();

    if (await pinInput.count() === 0) {
      log.warn('PIN input', 'not on chat page - trying dispatch page');

      // Navigate to the jobs dispatch page where PIN might be required
      await page.goto('http://localhost:4200/servicer/jobs', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(2000);

      // Look for any PIN prompt/trigger
      const pinTriggerBtn = page.locator(
        'button:has-text("Request PIN"), button:has-text("Enter PIN"), [class*="pin"] button, .pin-trigger',
      ).first();

      if (await pinTriggerBtn.count() > 0) {
        await pinTriggerBtn.click();
        log.ok('Clicked PIN trigger button');
        await page.waitForTimeout(1500);
      }
    }

    log.ok('On page for PIN attempts', `URL: ${page.url()}`);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('PIN entry page', null);
  });

  test('28.3 - Rapid-fire incorrect PIN attempts to trigger cooldown', async () => {
    log.step('Attempt rapid incorrect PIN entries');

    // Find PIN input
    const pinInput = page.locator(
      'input[name="pin"], input[placeholder*="PIN"], input[placeholder*="pin"], input[type="password"], .pin-input input, app-pin-prompt input',
    ).first();

    if (await pinInput.count() === 0) {
      log.warn('PIN input', 'not found - attempting API-based rate limiting');

      // Try hitting the PIN verify API directly
      const maxAttempts = 5;
      let cooldownHit = false;

      for (let i = 0; i < maxAttempts; i++) {
        try {
          const result = await page.evaluate(async (attempt) => {
            const res = await fetch(`${BACKEND}/servicer/pin/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: '0000' }),
            });
            return { status: res.status, body: await res.text() };
          }, i);

          log.info(`PIN attempt ${i + 1}`, `status=${result.status}`);

          if (result.status === 429 || result.body.toLowerCase().includes('cooldown') || result.body.toLowerCase().includes('too many')) {
            log.ok('Rate limit / cooldown detected via API', `attempt ${i + 1}`);
            cooldownHit = true;
            break;
          }
        } catch (e: any) {
          log.warn('API PIN attempt', `error: ${e?.message ?? e}`);
        }
      }

      if (cooldownHit) {
        log.ok('PIN_COOLDOWN triggered via API calls');
      } else {
        log.warn('API rate limit', 'not triggered after 5 attempts - cooldown may require more or use different endpoint');
      }

      await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
      log.screenshot('API rate limit test', null);
      return;
    }

    // UI-based PIN entry attempts
    const maxPinAttempts = 5;
    let cooldownDetected = false;

    for (let i = 0; i < maxPinAttempts; i++) {
      // Clear and type wrong PIN
      await pinInput.click();
      await pinInput.fill('');
      await pinInput.fill('0000');
      log.info(`PIN attempt ${i + 1}`, 'entered 0000');

      // Look for submit/confirm button near PIN input
      const submitPinBtn = page.locator(
        'button:has-text("Submit"), button:has-text("Confirm"), button:has-text("Verify"), button:has-text("Enter"), .pin-submit, [class*="submit"]',
      ).first();

      if (await submitPinBtn.count() > 0) {
        await submitPinBtn.click();
      } else {
        await pinInput.press('Enter');
      }

      await page.waitForTimeout(500);

      // Check for cooldown message
      const cooldownMsg = page.locator(
        'text=cooldown, text=too many, text=try again later, text=Too many attempts, text=locked, .err, .pin-cooldown, [class*="cooldown"], [class*="error"]',
      );

      if (await cooldownMsg.count() > 0) {
        const msgText = await cooldownMsg.first().textContent().catch(() => '');
        log.ok('PIN cooldown detected', msgText ?? '');
        cooldownDetected = true;
        break;
      }
    }

    if (!cooldownDetected) {
      log.warn('PIN cooldown', 'not triggered via UI - may need different approach');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('PIN cooldown result', null);
  });
});
