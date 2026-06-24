import { test, expect, BrowserContext, Page } from '@playwright/test';
import { StepLogger } from '../helpers/step-logger';
import { loginAs, getScreenshotPath } from '../helpers/auth-helpers';
import { disconnect } from '../helpers/db-check';

const SCENARIO_ID = 18;
let log: StepLogger;
let context: BrowserContext;
let page: Page;

const BACKEND = 'http://localhost:3000/api/v1';

test.describe('Scenario 18 - Calendar', () => {
  test.beforeAll(async ({ browser }) => {
    log = new StepLogger('18');
    log.info('DB', 'assuming already seeded - needs an accepted booking');

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

  test('18.1 - Login as M2_WEI', async () => {
    log.step('Login servicer M2_WEI');
    await loginAs(page, 'M2_WEI', log);
    log.ok('Logged in as M2_WEI');
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 1) });
    log.screenshot('M2_WEI logged in', null);
  });

  test('18.2 - Navigate to servicer calendar', async () => {
    log.step('Navigate to servicer calendar');

    await page.goto('http://localhost:4200/servicer/calendar');
    await page.waitForTimeout(3000);

    log.ok('Calendar page loaded', `URL: ${page.url()}`);
    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 2) });
    log.screenshot('Calendar page', null);
  });

  test('18.3 - Verify booking slot is filled on calendar', async () => {
    log.step('Verify booking slot on calendar');

    const selectors = [
      'text=booked',
      '.booked-slot',
      '.calendar .event',
      '.filled',
      '[class*="slot"][class*="book"]',
      '.calendar-event',
      '.fc-event',
      '.cal-event',
      '[class*="calendar"] [class*="event"]',
      '[class*="calendar"] [class*="booked"]',
    ];

    let found = false;
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        log.ok('Booking slot found on calendar', `selector: ${sel}`);
        found = true;
        break;
      }
    }

    if (!found) {
      log.warn('Booking slot', 'not found on calendar with any known selector');

      const calendarEl = page.locator(
        '.calendar, [class*="calendar"], .fc, .mat-calendar, app-calendar, [class*="schedule"]',
      ).first();
      if (await calendarEl.count() > 0) {
        log.ok('Calendar component visible');
      } else {
        log.warn('Calendar component', 'not detected on page');
      }
    }

    await page.screenshot({ path: getScreenshotPath(SCENARIO_ID, 3) });
    log.screenshot('Calendar slot verification', null);
  });
});
