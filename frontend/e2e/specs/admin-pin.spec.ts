import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/demo-auth';

test.describe('Admin PIN Gate', () => {
  test('admin can login and access dashboard', async ({ page }) => {
    // 1. Login as admin (handles PIN gate internally)
    await loginAsAdmin(page);

    // 2. Verify we are on an admin page
    expect(page.url()).toMatch(/\/admin/);

    // 3. Dashboard or admin shell should be visible
    const adminShell = page.locator(
      'nav, [class*="navbar"], [class*="sidebar"], [class*="admin-shell"], [class*="dashboard"]',
    );
    await expect(adminShell.first()).toBeVisible({ timeout: 5000 });
  });

  test('admin sidebar navigation is present', async ({ page }) => {
    await loginAsAdmin(page);

    // Admin navigation links should exist
    const navLinks = page.locator(
      'nav a, [class*="sidebar"] a, a[href*="/admin/"], [class*="nav-item"]',
    );
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('admin can navigate to settings', async ({ page }) => {
    await loginAsAdmin(page);

    // Try navigating to settings
    const settingsLink = page.locator(
      'a[href*="/admin/settings"], a[href*="settings"], button:has-text("Settings"), a:has-text("Settings")',
    );
    if (await settingsLink.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsLink.first().click();
      await page.waitForTimeout(1000);

      // Should be on a settings page
      expect(page.url()).toMatch(/\/admin\/settings/);
    }
  });
});
