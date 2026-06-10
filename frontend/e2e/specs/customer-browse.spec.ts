import { test, expect } from '@playwright/test';
import { loginAsCustomer, logout } from '../fixtures/demo-auth';

test.describe('Customer Login + Browse', () => {
  test('customer can login with demo account and browse services', async ({ page }) => {
    // 1. Login as customer
    await loginAsCustomer(page);

    // 2. Verify customer shell is visible (navigation, dashboard)
    await expect(page.locator('nav, [class*="navbar"], [class*="sidebar"], [class*="shell"]').first()).toBeVisible({
      timeout: 5000,
    });

    // 3. Verify we are on a customer page
    expect(page.url()).toMatch(/\/customer/);

    // 4. Browse button / service grid should be visible
    const browseArea = page.locator(
      '[class*="browse"], [class*="category"], [class*="service-card"], button:has-text("Browse"), a:has-text("Services")',
    );
    await expect(browseArea.first()).toBeVisible({ timeout: 5000 });
  });

  test('customer can logout', async ({ page }) => {
    await loginAsCustomer(page);
    await logout(page);
    // Should redirect to login or home
    await expect(page).toHaveURL(/\/(login|$)/, { timeout: 10_000 });
  });
});
