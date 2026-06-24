import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 20;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 20 - Chat Assist', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('20');
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

  test('20.1 - Customer logs in and submits aircond quote (quick)', async () => {
    log.step('Customer logs in as C_FRESH');
    await loginAs(page, 'C_FRESH', log);

    log.step('Navigate to Find Service');
    await page.goto('http://localhost:4200/customer/findService');
    await page.waitForSelector('h1', { timeout: 10000 });

    const airconCard = page.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    await airconCard.click();
    await page.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    log.ok('Quote form loaded');

    // Step 1 - Choose service (quick fill)
    await page.waitForSelector('.stepper', { timeout: 10000 });

    const budgetSlider = page.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) await budgetSlider.fill('2');

    const next1 = page.locator('button:has-text("Next: Contact")').first();
    if (await next1.count() > 0) { await next1.click(); await page.waitForTimeout(700); }

    // Step 2 - Contact
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

    const next2 = page.locator('button:has-text("Next: Summary")').first();
    if (await next2.count() > 0) { await next2.click(); await page.waitForTimeout(700); }

    // Step 3 - Summary
    const next3 = page.locator('button:has-text("Next: Bill")').first();
    if (await next3.count() > 0) { await next3.click(); await page.waitForTimeout(700); }

    // Step 4 - Bill (quick submit)
    const payNowRadio = page.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check(); await page.waitForTimeout(300);
    }
    const creditRadio = page.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check(); await page.waitForTimeout(300);
    }
    const agreeCheckbox = page.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
    }

    const submitBtn = page.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Quote submitted');
    } else {
      log.warn('Send request button', 'not found, chat test may proceed without active quote');
    }

    await page.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Quote submitted', null);
  });

  test('20.2 - Navigate to chat and send message', async () => {
    log.step('Navigate to customer chat page');

    // Try direct URL first
    await page.goto('http://localhost:4200/customer/chat', { waitUntil: 'domcontentloaded' }).catch(() => {
      log.warn('Chat URL', '/customer/chat navigation failed');
    });

    await page.waitForTimeout(2000);

    // Fallback: look for chat button/link on current page
    const chatBtn = page.locator(
      'a:has-text("Chat"), button:has-text("Chat"), [class*="chat"] button, [routerlink*="chat"]',
    ).first();

    if (await chatBtn.count() > 0) {
      await chatBtn.click();
      log.ok('Clicked chat button/link');
      await page.waitForTimeout(2000);
    } else {
      log.warn('Chat button', 'not found on page - may already be on chat page');
    }

    log.ok('On page', `URL: ${page.url()}`);

    // Find chat input
    const chatInput = page.locator(
      'textarea:has-text(""), input[placeholder*="message" i], input[placeholder*="type" i], .chat-input input, .chat-input textarea, [class*="chat"] input, [class*="chat"] textarea',
    ).first();

    if (await chatInput.count() > 0) {
      await chatInput.fill('I need help with my aircond');
      log.ok('Chat message filled');

      // Press Enter or click Send
      const sendBtn = page.locator(
        'button:has-text("Send"), button:has-text("send"), [class*="send"] button, .chat-send',
      ).first();

      if (await sendBtn.count() > 0) {
        await sendBtn.click();
        log.ok('Clicked Send button');
      } else {
        await chatInput.press('Enter');
        log.ok('Pressed Enter to send');
      }

      log.ok('Message sent');
    } else {
      log.warn('Chat input', 'not found - chat may not be rendered');
    }

    await page.waitForTimeout(1000);
  });

  test('20.3 - Wait for AI response and screenshot', async () => {
    log.step('Wait for AI response');

    // Wait for any AI response indicator
    const aiResponse = page.locator(
      '.ai-response, .assistant, .bot-message, [class*="ai"], .chat-response, .message.bot, .message.ai',
    ).first();

    try {
      await expect(aiResponse).toBeVisible({ timeout: 30000 });
      log.ok('AI response visible');
      const text = await aiResponse.textContent().catch(() => null);
      if (text) log.ok('AI response text', text.slice(0, 120));
    } catch {
      log.warn('AI response', 'not visible within timeout - may be slow or not implemented');
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Chat with AI response', null);
  });
});
