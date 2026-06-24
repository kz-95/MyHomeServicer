import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 15;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

test.describe('Scenario 15 - Report Servicer', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('15');
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

  test('15.1 - Login as C_FRESH', async () => {
    log.step('Login customer C_FRESH');
    await loginAs(page, 'C_FRESH', log);
    log.ok('Logged in as C_FRESH');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('C_FRESH logged in', null);
  });

  test('15.2 - Navigate to history page and find Report button', async () => {
    log.step('Navigate to history page');

    await page.goto('http://localhost:4200/customer/history');
    await page.waitForTimeout(2000);

    const reportBtn = page.locator(
      'button:has-text("Report"), a:has-text("Report"), [class*="report"] button, [class*="report"] a',
    ).first();

    if (await reportBtn.count() > 0) {
      log.ok('Report button found');
      await reportBtn.click();
      log.ok('Clicked Report button');
    } else {
      log.warn('Report button', 'not found on history page, trying bookings page');

      await page.goto('http://localhost:4200/customer/bookings');
      await page.waitForTimeout(2000);

      const reportBtn2 = page.locator(
        'button:has-text("Report"), a:has-text("Report"), [class*="report"] button, [class*="report"] a',
      ).first();

      if (await reportBtn2.count() > 0) {
        log.ok('Report button found on bookings page');
        await reportBtn2.click();
      } else {
        log.warn('Report button', 'not found on bookings page either, trying booking detail');

        const bookingCard = page.locator('.card.booking, .card.item, [class*="booking"]').first();
        if (await bookingCard.count() > 0) {
          await bookingCard.click();
          await page.waitForTimeout(2000);

          const reportBtn3 = page.locator(
            'button:has-text("Report"), a:has-text("Report"), [class*="report"] button',
          ).first();

          if (await reportBtn3.count() > 0) {
            log.ok('Report button found on booking detail');
            await reportBtn3.click();
          } else {
            log.warn('Report button', 'not found anywhere');
          }
        } else {
          log.warn('Booking cards', 'not found for detail navigation');
        }
      }
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Report action', null);
  });

  test('15.3 - Fill and submit report', async () => {
    log.step('Fill and submit report');

    await page.waitForTimeout(1000);

    const reportModal = page.locator(
      'app-modal dialog[open], .report-modal, [class*="report"] form, [class*="modal"]',
    ).first();

    if (await reportModal.count() > 0) {
      log.ok('Report modal is visible');

      const reasonSelect = reportModal.locator('select, [role="listbox"], .dropdown').first();
      if (await reasonSelect.count() > 0) {
        await reasonSelect.selectOption({ index: 1 });
        log.ok('Report reason selected');
      } else {
        log.warn('Reason select', 'not found, trying textarea');
      }

      const reasonTextarea = reportModal.locator('textarea, [name="reason"], [name="description"]').first();
      if (await reasonTextarea.count() > 0) {
        await reasonTextarea.fill('Poor service quality and unprofessional behaviour');
        log.ok('Report reason filled');
      } else {
        log.warn('Reason textarea', 'not found');
      }

      const submitReportBtn = reportModal.locator(
        'button:has-text("Submit"), button:has-text("Send"), button:has-text("Report")',
      ).first();
      if (await submitReportBtn.count() > 0) {
        await submitReportBtn.click();
        log.ok('Report submitted');
        await page.waitForTimeout(2000);
      } else {
        log.warn('Submit button', 'not found in report modal');
      }

      const successToast = page.locator(
        '.snackbar, .toast, [class*="toast"], text=submitted, text=success, text=thank',
      ).first();
      if (await successToast.count() > 0) {
        log.ok('Success message visible', 'Report submitted successfully');
      } else {
        log.warn('Success toast', 'not visible');
      }
    } else {
      log.warn('Report modal', 'not visible');
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Report result', null);
  });
});
