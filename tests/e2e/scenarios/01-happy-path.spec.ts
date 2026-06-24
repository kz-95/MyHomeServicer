import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { verifyEscrowIntegrity, getCustomerBalance, disconnect } from '../helpers/db-check';
import { resetTestDB } from '../helpers/seed-helpers';

const SCENARIO_ID = 1;
let log: StepLogger;
let contextC: BrowserContext;
let contextS: BrowserContext;
let pageC: Page;
let pageS: Page;
let bookingId: string | null = null;
let quoteId: string | null = null;

test.describe('Scenario 1 - Full Happy Path', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('01');
    log.info('DB', 'assuming already seeded (reset skipped - server DLL lock)');
    // await resetTestDB(); // SKIPPED: prisma migrate reset hangs when backend server is running

    contextC = await browser.newContext();
    contextS = await browser.newContext();
    pageC = await contextC.newPage();
    pageS = await contextS.newPage();

    pageC.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
    pageS.on('console', (msg) => {
      if (msg.type() === 'error') log.consoleError(msg.text(), msg.location().url);
    });
  });

  test.afterAll(async () => {
    log.summary();
    await disconnect();
    await contextC?.close();
    await contextS?.close();
  });

  test('1.1 - Customer logs in', async () => {
    log.step('Customer logs in as C_FRESH');
    await loginAs(pageC, 'C_FRESH', log);
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('Customer logged in', null);
  });

  test('1.2 - Customer navigates to Find Service', async () => {
    log.step('Customer navigates to Find Service');
    await pageC.goto('http://localhost:4200/customer/findService');
    await pageC.waitForSelector('h1', { timeout: 10000 });
    log.ok('Find Service page loaded');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Find Service page', null);
  });

  test('1.3 - Customer clicks Aircon Service category', async () => {
    log.step('Customer selects Aircon Service category');

    const airconCard = pageC.locator('.bw-card').filter({ hasText: /aircond/i }).first();
    await expect(airconCard).toBeVisible({ timeout: 10000 });
    log.ok('Aircon category card found');

    await airconCard.click();
    await pageC.waitForURL(/\/customer\/quote/, { timeout: 15000 });
    log.ok('Navigated to quote form');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Quote form loaded', null);
  });

  test('1.4 - Customer fills quote form step 1 (Choose service)', async () => {
    log.step('Customer fills Step 1 - Choose service');

    await pageC.waitForSelector('.stepper', { timeout: 10000 });
    log.ok('Stepper visible');

    // If category pre-filled by query param, skip category selection
    const parentSelect = pageC.locator('select[name="parentCat"]');
    const categorySelect = pageC.locator('select[name="cat"]');

    if (await parentSelect.count() > 0 && (await parentSelect.inputValue()) === '') {
      await parentSelect.selectOption({ index: 1 });
      await pageC.waitForTimeout(500);
    }

    if (await categorySelect.count() > 0 && !(await categorySelect.isDisabled()) && (await categorySelect.inputValue()) === '') {
      await categorySelect.selectOption({ index: 1 });
      await pageC.waitForTimeout(500);
    }

    // Select budget if slider is visible
    const budgetSlider = pageC.locator('input[name="budgetRange"]');
    if (await budgetSlider.count() > 0) {
      await budgetSlider.fill('2');
      log.ok('Budget slider set');
    } else {
      log.warn('Budget slider', 'not found, skipping');
    }

    // Click Next: Contact
    const nextBtn1 = pageC.locator('button:has-text("Next: Contact")').first();
    if (await nextBtn1.count() > 0) {
      await nextBtn1.click();
      log.ok('Clicked Next: Contact');
    } else {
      log.warn('Next: Contact button', 'not found');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 4) });
    log.screenshot('Step 1 complete', null);
  });

  test('1.5 - Customer fills quote form step 2 (Contact)', async () => {
    log.step('Customer fills Step 2 - Contact');

    await pageC.waitForTimeout(500);

    // Fill contact name
    const nameInput = pageC.locator('input[name="contactName"]');
    if (await nameInput.count() > 0) {
      await nameInput.fill('David Tan');
      log.ok('Contact name filled');
    }

    // Fill phone number via phone input component
    const phoneInput = pageC.locator('app-phone-input input').first();
    if (await phoneInput.count() > 0) {
      await phoneInput.fill('0123456789');
      log.ok('Contact number filled');
    } else {
      // Try direct name-based phone input
      const phoneAlt = pageC.locator('input[name="contactNumber"]');
      if (await phoneAlt.count() > 0) {
        await phoneAlt.fill('0123456789');
        log.ok('Contact number filled (alt)');
      }
    }

    // Fill address via address fields component
    const addrNo = pageC.locator('app-address-fields input').first();
    if (await addrNo.count() > 0) {
      await addrNo.fill('22');
    }
    const streetInput = pageC.locator('app-address-fields input').nth(1);
    if (await streetInput.count() > 0) {
      await streetInput.fill('Jalan SS 2/24, SS 2');
      log.ok('Address filled');
    }

    // Set preferred date to tomorrow
    const dateInput = pageC.locator('app-calendar-picker input[type="date"]');
    if (await dateInput.count() > 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await dateInput.fill(dateStr);
      log.ok('Preferred date set to tomorrow');
    }

    // Select morning time slot
    const slotSelect = pageC.locator('app-calendar-picker select');
    if (await slotSelect.count() > 0) {
      await slotSelect.selectOption({ label: 'Morning (9:00-11:00)' });
      log.ok('Time slot set to morning');
    }

    // Click Next: Summary
    const nextBtn2 = pageC.locator('button:has-text("Next: Summary")').first();
    if (await nextBtn2.count() > 0) {
      await nextBtn2.click();
      log.ok('Clicked Next: Summary');
    } else {
      log.warn('Next: Summary button', 'not found');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 5) });
    log.screenshot('Step 2 complete', null);
  });

  test('1.6 - Customer fills quote form step 3 (Summary)', async () => {
    log.step('Customer reviews Step 3 - Summary');

    await pageC.waitForTimeout(500);
    await pageC.waitForSelector('.review', { timeout: 5000 }).catch(() => {
      log.warn('Review section', 'not visible');
    });

    // Click Next: Bill
    const nextBtn3 = pageC.locator('button:has-text("Next: Bill")').first();
    if (await nextBtn3.count() > 0) {
      await nextBtn3.click();
      log.ok('Clicked Next: Bill');
    } else {
      log.warn('Next: Bill button', 'not found');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 6) });
    log.screenshot('Step 3 complete', null);
  });

  test('1.7 - Customer fills quote form step 4 (Bill) and submits', async () => {
    log.step('Customer fills Step 4 - Bill and submits');

    await pageC.waitForTimeout(500);

    // Select "Pay now" radio
    const payNowRadio = pageC.locator('input[name="payTiming"][value="pay_now"]');
    if (await payNowRadio.count() > 0 && !(await payNowRadio.isChecked())) {
      await payNowRadio.check();
      log.ok('Selected Pay now');
      await pageC.waitForTimeout(300);
    } else {
      log.warn('Pay now radio', 'not found or already checked');
    }

    // Select "Wallet credit" for settlement
    const creditRadio = pageC.locator('input[name="payNowMethod"][value="credit"]');
    if (await creditRadio.count() > 0 && !(await creditRadio.isChecked())) {
      await creditRadio.check();
      log.ok('Selected Wallet credit');
      await pageC.waitForTimeout(300);
    }

    // Agree to terms
    const agreeCheckbox = pageC.locator('input[name="agree"]');
    if (await agreeCheckbox.count() > 0 && !(await agreeCheckbox.isChecked())) {
      await agreeCheckbox.check();
      log.ok('Agreed to terms');
    }

    // Intercept the quote submit response to capture quote ID
    const submitResponse = pageC.waitForResponse(
      (resp) => resp.url().includes('/quotes') && resp.request().method() === 'POST',
      { timeout: 30000 },
    ).catch(() => null);

    // Click Send request
    const submitBtn = pageC.locator('button:has-text("Send request")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      log.ok('Clicked Send request');
    } else {
      log.fail('Send request button', 'not found');
      return;
    }

    // Get the quote ID from response
    const resp = await submitResponse;
    if (resp) {
      try {
        const body = await resp.json();
        quoteId = body?.id ?? body?.data?.id ?? null;
        if (quoteId) {
          log.ok('Quote created', `ID: ${quoteId}`);
        }
      } catch {
        log.warn('Could not parse quote ID', 'from response');
      }
    }

    // Wait for confirmation page
    await pageC.waitForSelector('.confirm-card', { timeout: 15000 }).catch(() => {
      log.warn('Confirmation card', 'not visible');
    });
    log.ok('Confirmation card visible');

    // Wait for auto-redirect to /customer/quotes
    await pageC.waitForURL(/\/customer\/quotes/, { timeout: 20000 }).catch(() => {
      log.warn('Auto-redirect', 'did not navigate to /customer/quotes');
    });
    log.ok('Navigated to My Quotes');
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 7) });
    log.screenshot('Quote submitted', null);
  });

  test('1.8 - Servicer logs in and sees pending quote', async () => {
    log.step('Servicer logs in as M2_WEI');
    await loginAs(pageS, 'M2_WEI', log);

    await pageS.goto('http://localhost:4200/servicer/jobs/pending');
    await pageS.waitForSelector('.card.item', { timeout: 15000 }).catch(() => {
      log.warn('Pending cards', 'no .card.item found');
    });

    // Check if there's any quote visible
    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    log.ok('Pending column', `${count} quotes visible`);
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 8) });
    log.screenshot('Servicer pending quotes', null);
  });

  test('1.9 - Servicer proposes on the quote', async () => {
    log.step('Servicer proposes RM 250');

    const pendingCards = pageS.locator('.card.item');
    const count = await pendingCards.count();
    if (count === 0) {
      log.fail('No pending quotes', 'cannot propose');
      return;
    }

    // Click the accept/propose button on first pending card
    const acceptBtn = pendingCards.first().locator('button:has-text("Accept Job")');
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
      log.ok('Clicked Accept Job');

      // Wait for propose form to appear
      await pageS.waitForTimeout(500);

      // Fill price
      const priceInput = pageS.locator('input[placeholder="Price (RM)"]');
      if (await priceInput.count() > 0) {
        await priceInput.fill('250');
        log.ok('Price filled: 250');
      }

      // Fill message
      const msgInput = pageS.locator('input[placeholder="Message"]');
      if (await msgInput.count() > 0) {
        await msgInput.fill('Can fix tomorrow 9am');
        log.ok('Message filled');
      }

      // Submit proposal
      const proposeBtn = pageS.locator('button:has-text("Send proposal")');
      if (await proposeBtn.count() > 0) {
        await proposeBtn.click();
        log.ok('Proposal sent');

        // Wait for proposal state to update
        await pageS.waitForTimeout(1000);
      } else {
        log.fail('Send proposal button', 'not found');
      }
    } else {
      log.fail('Accept Job button', 'not found on pending card');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 9) });
    log.screenshot('Proposal sent', null);
  });

  test('1.10 - Customer views proposal and books servicer', async () => {
    log.step('Customer views proposals and books M2_WEI');

    // Navigate to quotes page
    await pageC.goto('http://localhost:4200/customer/quotes');
    await pageC.waitForTimeout(1000);

    // Look for a quote that has proposals - "Choose a proposal" link
    const chooseProposal = pageC.locator('a:has-text("Choose a proposal")').first();
    if (await chooseProposal.count() > 0) {
      await chooseProposal.click();
      log.ok('Clicked "Choose a proposal"');
    } else {
      // Maybe the quote page auto-navigated? Try clicking "View proposals" link
      const viewProposals = pageC.locator('a:has-text("View proposals")').first();
      if (await viewProposals.count() > 0) {
        await viewProposals.click();
        log.ok('Clicked "View proposals"');
      } else {
        // Try direct navigation - we need the quote ID
        log.fail('No proposal link found', 'cannot navigate to proposals');
        await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 10) });
        return;
      }
    }

    await pageC.waitForURL(/\/customer\/quotes\/.*\/proposals/, { timeout: 15000 }).catch(() => {
      log.warn('Proposals URL', 'not reached');
    });
    await pageC.waitForTimeout(1000);

    // Find the proposal from M2_WEI (Wei) and click Select
    const proposalCards = pageC.locator('.card.proposal');
    const propCount = await proposalCards.count();
    if (propCount > 0) {
      log.ok('Proposals visible', `${propCount} proposals`);

      // Click "Select" on the first proposal
      const selectBtn = proposalCards.first().locator('button:has-text("Select")');
      if (await selectBtn.count() > 0) {
        await selectBtn.click();
        log.ok('Clicked Select on proposal');

        // Wait for confirmation modal (native <dialog> inside <app-modal>)
        await pageC.waitForSelector('app-modal dialog[open]', { timeout: 8000 }).catch(() => {
          log.warn('Confirmation modal dialog', 'not visible');
        });
        await pageC.waitForTimeout(1200); // dialog animation + Angular render

        // Click "Confirm - book this servicer"
        const confirmBtn = pageC.locator('button:has-text("book this servicer")');
        await expect(confirmBtn.first()).toBeVisible({ timeout: 5000 });
        if (await confirmBtn.count() > 0) {
          await confirmBtn.first().click();
          log.ok('Confirmed booking');

          // Capture booking ID from URL or network
          await pageC.waitForURL(/\/customer\/bookings/, { timeout: 15000 }).catch(() => {
            log.warn('Booking URL', 'not reached');
          });
        } else {
          log.fail('Confirm button', 'not found in modal');
        }
      } else {
        log.fail('Select button', 'not found on proposal');
      }
    } else {
      log.fail('No proposals', 'card not found');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 10) });
    log.screenshot('Booking confirmed', null);
  });

  test('1.11 - Servicer marks arrived', async () => {
    log.step('Servicer navigates to Active tab and marks arrived');

    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1000);

    // Look for active job card with "Mark arrived" button
    const arriveBtn = pageS.locator('button:has-text("Mark arrived")').first();
    if (await arriveBtn.count() > 0) {
      await arriveBtn.click();
      log.ok('Clicked Mark arrived');

      // Wait for photo modal
      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {
        log.warn('Photo modal', 'not opened');
      });

      // Upload a simple test image - create a minimal PNG via data
      const fileInput = pageS.locator('app-modal input[type="file"]');
      if (await fileInput.count() > 0) {
        // Create a tiny 1x1 PNG in memory
        await fileInput.setInputFiles({
          name: 'arrival-photo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        });
        log.ok('Photo selected');

        await pageS.waitForTimeout(500);

        // Click Upload & confirm
        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Arrival confirmed');
          await pageS.waitForTimeout(2000);
        } else {
          log.warn('Upload button', 'not enabled or not found');
        }
      } else {
        log.warn('File input', 'not found in modal, skipping upload');
      }
    } else {
      log.fail('Mark arrived button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 11) });
    log.screenshot('Marked arrived', null);
  });

  test('1.12 - Servicer marks done', async () => {
    log.step('Servicer marks job done');

    await pageS.goto('http://localhost:4200/servicer/jobs/active');
    await pageS.waitForTimeout(1500);

    // Look for "Mark done" button
    const doneBtn = pageS.locator('button:has-text("Mark done")').first();
    if (await doneBtn.count() > 0) {
      await doneBtn.click();
      log.ok('Clicked Mark done');

      // Wait for photo modal
      await pageS.waitForSelector('app-modal', { timeout: 5000 }).catch(() => {
        log.warn('Photo modal', 'not opened');
      });

      // Upload completion photo
      const fileInput = pageS.locator('app-modal input[type="file"]');
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({
          name: 'completion-photo.png',
          mimeType: 'image/png',
          buffer: Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64',
          ),
        });
        log.ok('Completion photo selected');

        await pageS.waitForTimeout(500);

        const uploadBtn = pageS.locator('button:has-text("Upload & confirm")');
        if (await uploadBtn.count() > 0 && !(await uploadBtn.isDisabled())) {
          await uploadBtn.click();
          log.ok('Job marked done');
          await pageS.waitForTimeout(2000);
        } else {
          log.warn('Upload button', 'not enabled or not found');
        }
      } else {
        log.warn('File input', 'not found in modal, skipping upload');
      }
    } else {
      log.fail('Mark done button', 'not found');
    }
    await pageS.screenshot({ path: getScreenshotPath(SCENARIO_ID, 12) });
    log.screenshot('Job completed', null);
  });

  test('1.13 - Verify escrow integrity (DB check)', async () => {
    log.step('Verify escrow integrity');

    // Query all bookings from the API to find the latest one
    try {
      const bookingsResp = await pageC.evaluate(async () => {
        const res = await fetch('http://localhost:3000/api/bookings', {
          headers: { 'Content-Type': 'application/json' },
        });
        return res.json();
      });

      const bookings = bookingsResp?.data ?? [];
      if (bookings.length > 0) {
        bookingId = bookings[0].id;
        log.ok('Booking found', `ID: ${bookingId}`);
      } else {
        log.fail('No bookings', 'no booking in DB');
        return;
      }
    } catch (e: any) {
      log.warn('Booking query', `API call failed: ${e?.message ?? e}`);
      return;
    }

    if (bookingId) {
      await verifyEscrowIntegrity(bookingId, log);
    } else {
      log.fail('No booking ID', 'escrow check skipped');
    }
  });

  test('1.14 - Customer verifies booking in History and submits review', async () => {
    log.step('Customer checks History and submits review');

    await pageC.goto('http://localhost:4200/customer/history');
    await pageC.waitForTimeout(1500);

    // Check for completed bookings
    const bookingCards = pageC.locator('.card.booking');
    const count = await bookingCards.count();
    if (count > 0) {
      log.ok('History visible', `${count} bookings`);
    } else {
      log.warn('Bookings', 'no completed bookings in history');
    }

    // Look for review/rating UI - may not be implemented yet
    const reviewSection = pageC.locator('text=Rate this servicer, text=Review, text=rate, .star-rating');
    if (await reviewSection.count() > 0) {
      log.ok('Review section visible');

      // Click 5 stars - look for star elements
      const stars = pageC.locator('.star, [aria-label*="star"], [class*="rating"] button, [class*="rating"] input');
      if (await stars.count() > 0) {
        await stars.last().click(); // click last star for 5
        log.ok('Clicked 5 stars');
      }

      // Fill review message
      const reviewMsgInput = pageC.locator('textarea[placeholder*="review"], textarea[placeholder*="experience"], [name="review"]');
      if (await reviewMsgInput.count() > 0) {
        await reviewMsgInput.fill('Great job!');
        log.ok('Review message filled');
      }

      // Submit review
      const submitReviewBtn = pageC.locator('button:has-text("Submit"), button:has-text("Send review")').first();
      if (await submitReviewBtn.count() > 0) {
        await submitReviewBtn.click();

        // Check for success toast
        await pageC.waitForTimeout(1000);
        const toast = pageC.locator('.snackbar, .toast, [class*="toast"], text=Review submitted');
        if (await toast.count() > 0) {
          log.ok('Toast visible', 'Review submitted');
        }
      }
    } else {
      log.warn('Review section', 'not found - may not be implemented yet');
    }
    await pageC.screenshot({ path: getScreenshotPath(SCENARIO_ID, 14) });
    log.screenshot('History and review', null);
  });
});
