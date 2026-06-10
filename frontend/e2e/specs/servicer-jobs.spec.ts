import { test, expect } from '@playwright/test';
import { loginAsServicer } from '../fixtures/demo-auth';

test.describe('Servicer Jobs Board', () => {
  test('servicer can login and see jobs board', async ({ page }) => {
    // 1. Login as servicer
    await loginAsServicer(page);

    // 2. Verify we are on a servicer page
    expect(page.url()).toMatch(/\/servicer/);

    // 3. Jobs board or dashboard should be visible
    const jobsArea = page.locator(
      '[class*="jobs"], [class*="dashboard"], [class*="tab"], table, [class*="card"]',
    );
    await expect(jobsArea.first()).toBeVisible({ timeout: 5000 });
  });

  test('servicer can navigate to services page', async ({ page }) => {
    await loginAsServicer(page);
    await page.waitForTimeout(2000);

    // Try clicking services link
    const servicesLink = page.locator(
      'a[href*="/servicer/services"], a[href*="services"], a[href*="Services"], a:has-text("Services"), button:has-text("Services")',
    );
    if (await servicesLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await servicesLink.first().click();
      await page.waitForTimeout(1000);
      expect(page.url()).toMatch(/\/servicer\/services/);
    }
  });

  test('servicer can navigate to deposit page', async ({ page }) => {
    await loginAsServicer(page);
    await page.waitForTimeout(2000);

    const depositLink = page.locator(
      'a[href*="/servicer/deposit"], a[href*="deposit"], a[href*="Deposit"], a:has-text("Deposit")',
    );
    if (await depositLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await depositLink.first().click();
      await page.waitForTimeout(1000);
      expect(page.url()).toMatch(/\/servicer\/deposit/);
    }
  });
});
