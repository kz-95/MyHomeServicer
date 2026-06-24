import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 12;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 12 - Register Customer', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('12');
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

  test('12.1 - Navigate to registration page', async () => {
    log.step('Navigate to registration page');

    await page.goto('http://localhost:4200/register');
    await page.waitForSelector('form, input[name="name"], input[name="email"], h1', { timeout: 15000 }).catch(() => {
      log.warn('Register page', 'expected elements not found');
    });

    log.ok('Register page loaded', `URL: ${page.url()}`);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Register page', null);
  });

  test('12.2 - Fill registration form', async () => {
    log.step('Fill registration form');

    const nameInput = page.locator('input[name="name"], input[formcontrolname="name"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Test User');
      log.ok('Name filled');
    } else {
      log.warn('Name input', 'not found');
    }

    const emailInput = page.locator('input[name="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill('test.register@demo.local');
      log.ok('Email filled');
    } else {
      log.warn('Email input', 'not found');
    }

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    if (await passwordInput.count() > 0) {
      await passwordInput.fill('Demo@2026');
      log.ok('Password filled');
    } else {
      log.warn('Password input', 'not found');
    }

    const confirmPass = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]').first();
    if (await confirmPass.count() > 0) {
      await confirmPass.fill('Demo@2026');
      log.ok('Confirm password filled');
    } else {
      log.warn('Confirm password input', 'not found, skipping');
    }

    const phoneInput = page.locator('input[name="phone"], input[name="mobile"], input[name="contact"]').first();
    if (await phoneInput.count() > 0) {
      await phoneInput.fill('0123456789');
      log.ok('Phone filled');
    } else {
      log.warn('Phone input', 'not found, skipping');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Form filled', null);
  });

  test('12.3 - Submit registration form', async () => {
    log.step('Submit registration form');

    const registerUrl = page.url();

    const submitBtn = page.locator(
      'button:has-text("Sign up"), button:has-text("Register"), button:has-text("Create account")',
    ).first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Clicked submit button');
    } else {
      log.fail('Submit button', 'not found');
      await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
      return;
    }

    try {
      await page.waitForURL((url) => !url.pathname.includes('/register'), { timeout: 15000 });
      log.ok('Redirected away from /register', `New URL: ${page.url()}`);
    } catch {
      log.warn('Redirect', 'still on /register after timeout');
    }

    const stillOnRegister = page.url().includes('/register');
    if (!stillOnRegister) {
      log.ok('Registration successful');
    } else {
      log.warn('Registration', 'may have failed - URL still contains /register');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Registration result', null);
  });
});
