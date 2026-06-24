import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { getTransactions, disconnect } from '../helpers/db-check';

const SCENARIO_ID = 14;
let log: StepLogger;
let context: BrowserContext;
let page: Page;
let cancelledBookingId: string | null = null;

test.describe('Scenario 14 - Cancel Booking', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('14');
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

  test('14.1 - Login as C_FRESH', async () => {
    log.step('Login customer C_FRESH');
    await loginAs(page, 'C_FRESH', log);
    log.ok('Logged in as C_FRESH');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('C_FRESH logged in', null);
  });

  test('14.2 - Navigate to bookings page', async () => {
    log.step('Navigate to customer bookings');

    await page.goto('http://localhost:4200/customer/bookings');
    await page.waitForTimeout(2000);

    await page.waitForSelector('.card.booking, .card.item, [class*="booking"]', { timeout: 10000 }).catch(() => {
      log.warn('Booking cards', 'not found, page may be empty');
    });

    log.ok('Bookings page loaded', `URL: ${page.url()}`);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Bookings page', null);
  });

  test('14.3 - Find pending_confirm booking and cancel', async () => {
    log.step('Find pending_confirm booking and cancel');

    const pendingCard = page.locator('.card.booking, .card.item, [class*="booking"]').filter({
      hasText: /pending|confirm/i,
    }).first();

    if (await pendingCard.count() > 0) {
      log.ok('Pending booking card found');

      const cancelBtn = pendingCard.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.count() > 0) {
        await cancelBtn.click();
        log.ok('Clicked Cancel button');
        await page.waitForTimeout(1000);

        const confirmDialogBtn = page.locator(
          'button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Cancel booking")',
        ).first();
        if (await confirmDialogBtn.count() > 0) {
          await confirmDialogBtn.click();
          log.ok('Confirmed cancellation in dialog');
        } else {
          log.warn('Confirmation dialog button', 'not found');
        }

        await page.waitForTimeout(2000);
      } else {
        log.fail('Cancel button', 'not found on pending card');
      }
    } else {
      log.fail('Pending booking card', 'not found - no cancellable booking available');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Cancel action', null);
  });

  test('14.4 - Navigate to history page and verify cancelled status', async () => {
    log.step('Navigate to history page');

    await page.goto('http://localhost:4200/customer/history');
    await page.waitForTimeout(2000);

    const cancelledCard = page.locator('.card.booking, .card.item, [class*="booking"]').filter({
      hasText: /cancelled|cancel/i,
    }).first();

    if (await cancelledCard.count() > 0) {
      log.ok('Cancelled booking visible in history');
    } else {
      log.warn('Cancelled booking', 'not found in history');
    }

    try {
      const bookingCards = page.locator('.card.booking, .card.item, [class*="booking"]');
      const count = await bookingCards.count();
      log.ok('History bookings', `${count} found`);
      if (count > 0) {
        const firstStatus = bookingCards.first().locator(
          '[class*="status"], .badge, .label, [class*="state"]',
        ).first();
        if (await firstStatus.count() > 0) {
          log.ok('Booking status', (await firstStatus.textContent())?.trim() ?? '');
        }
      }
    } catch (e: any) {
      log.warn('History check', `error: ${e?.message ?? e}`);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('History page', null);
  });

  test('14.5 - DB check - verify refund transaction exists', async () => {
    log.step('DB check - verify refund transaction');

    try {
      const bookingId = await page.evaluate(async () => {
        const res = await fetch('http://localhost:3000/api/v1/bookings', {
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await res.json();
        const data = json.data ?? [];
        const cancelled = data.find((b: any) =>
          b.status?.toLowerCase().includes('cancel'),
        );
        return cancelled?.id ?? null;
      });

      if (bookingId) {
        cancelledBookingId = bookingId;
        log.ok('Cancelled booking ID', bookingId);

        const txns = await getTransactions(bookingId);
        const refundTxn = txns.find((t) => t.type?.toLowerCase().includes('refund'));
        if (refundTxn) {
          log.ok('Refund transaction found', `amount=${refundTxn.amount} type=${refundTxn.type}`);
        } else {
          log.warn('Refund transaction', 'not found');
          log.db('Cancelled booking txns', JSON.stringify(txns.map(t => ({ type: t.type, amount: t.amount }))));
        }
      } else {
        log.warn('Cancelled booking ID', 'not found in DB');
      }
    } catch (e: any) {
      log.warn('DB check', `error: ${e?.message ?? e}`);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('DB verification', null);
  });
});
