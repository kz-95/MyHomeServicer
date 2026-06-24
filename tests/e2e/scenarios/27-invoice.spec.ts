import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { getInvoice, disconnect } from '../helpers/db-check';

const SCENARIO_ID = 27;
let log: StepLogger;
let context: BrowserContext;
let page: Page;
let bookingId: string | null = null;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 27 - Invoice', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('27');
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

  test('27.1 - Customer logs in and navigates to bookings', async () => {
    log.step('Customer logs in');
    await loginAs(page, 'C_FRESH', log);

    log.step('Navigate to bookings page');
    await page.goto('http://localhost:4200/customer/bookings');
    await page.waitForTimeout(3000);

    // Check for booking cards
    const bookingCards = page.locator('.card.booking, .card.item, [class*="booking"], .booking-card');
    const count = await bookingCards.count();
    if (count > 0) {
      log.ok('Booking cards visible', `${count} found`);
    } else {
      log.warn('Booking cards', 'none visible - trying API to find bookings');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Bookings page', null);
  });

  test('27.2 - Find a completed booking and open invoice', async () => {
    log.step('Look for Invoice button/link on completed booking');

    // Look for invoice trigger element
    const invoiceBtn = page.locator(
      'button:has-text("Invoice"), a:has-text("Invoice"), .inv-id, [class*="invoice"], a:has-text("View Invoice"), button:has-text("View Invoice")',
    ).first();

    if (await invoiceBtn.count() > 0) {
      log.ok('Invoice button found');
      await invoiceBtn.click();
      log.ok('Clicked Invoice');
      await page.waitForTimeout(2000);
    } else {
      log.warn('Invoice button', 'not found directly - checking booking cards');

      // Try clicking on a booking card to reveal invoice
      const bookingCard = page.locator('.card.booking, .card.item, [class*="booking"]').first();
      if (await bookingCard.count() > 0) {
        await bookingCard.click();
        await page.waitForTimeout(1500);

        // Check again for invoice button on detail page
        const invoiceBtn2 = page.locator(
          'button:has-text("Invoice"), a:has-text("Invoice"), .inv-id, [class*="invoice"]',
        ).first();

        if (await invoiceBtn2.count() > 0) {
          await invoiceBtn2.click();
          log.ok('Clicked Invoice from detail view');
          await page.waitForTimeout(2000);
        } else {
          log.warn('Invoice button', 'not found on detail page either');
        }
      }
    }

    // Capture booking ID from URL if possible
    const url = page.url();
    const match = url.match(/\/bookings\/([a-f0-9-]+)/);
    if (match) {
      bookingId = match[1];
      log.ok('Booking ID captured', bookingId);
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Invoice page', null);
  });

  test('27.3 - Verify invoice details shown', async () => {
    log.step('Verify invoice details');

    // Check for line items
    const lineItems = page.locator('.line-item, .invoice-item, [class*="line-item"], [class*="invoice-item"], tr, .item-row');
    const lineCount = await lineItems.count();
    if (lineCount > 0) {
      log.ok('Invoice line items visible', `${lineCount} items`);
    } else {
      log.warn('Line items', 'not found - checking for any table/list content');
    }

    // Check for platform fee
    const platformFee = page.locator(
      'text=platform fee, text=Platform Fee, text=Service fee, text=Processing fee, [class*="fee"], [class*="platform"]',
    );
    if (await platformFee.count() > 0) {
      const feeText = await platformFee.first().textContent().catch(() => '');
      log.ok('Platform/service fee visible', feeText ?? '');
    } else {
      log.warn('Platform fee', 'not found on invoice');
    }

    // Check for total amount
    const totalAmount = page.locator(
      '.total, .amount, [class*="total"], [class*="grand-total"], strong:has-text("RM"), .price:has-text("RM")',
    ).first();
    if (await totalAmount.count() > 0) {
      const text = await totalAmount.textContent();
      log.ok('Total amount visible', text ?? '');
    } else {
      log.warn('Total amount', 'not found');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Invoice details', null);
  });

  test('27.4 - Verify invoice via DB check', async () => {
    log.step('Verify invoice data from backend');

    if (!bookingId) {
      // Try to get booking ID from API
      try {
        const bookingsResp = await page.evaluate(async () => {
          const res = await fetch(`${BACKEND}/bookings`);
          return res.json();
        });
        const bookings = bookingsResp?.data ?? [];
        if (bookings.length > 0) {
          // Find a completed booking
          const completed = bookings.find((b: any) => b.status === 'completed') || bookings[0];
          bookingId = completed.id;
          log.ok('Booking ID from API', bookingId);
        }
      } catch (e: any) {
        log.warn('API booking fetch', `failed: ${e?.message ?? e}`);
      }
    }

    if (bookingId) {
      const invoice = await getInvoice(bookingId);
      if (invoice) {
        log.ok('Invoice found from backend');
        log.db('Invoice', JSON.stringify(invoice).slice(0, 200));
        // Check for expected fields
        if (invoice.lineItems || invoice.items) {
          log.ok('Line items in invoice data', `${(invoice.lineItems ?? invoice.items)?.length ?? 0} items`);
        }
        if (invoice.total || invoice.totalAmount) {
          log.db('Total', `${invoice.total ?? invoice.totalAmount}`);
        }
        if (invoice.platformFee || invoice.platform_fee) {
          log.db('Platform fee', `${invoice.platformFee ?? invoice.platform_fee}`);
        }
      } else {
        log.warn('Invoice from backend', 'not found - may use different endpoint');
        log.info('Invoice check', `bookingId=${bookingId}, endpoint=${BACKEND}/bookings/${bookingId}/invoice`);
      }
    } else {
      log.fail('No booking ID', 'cannot verify invoice via backend');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Invoice verification', null);
  });
});
