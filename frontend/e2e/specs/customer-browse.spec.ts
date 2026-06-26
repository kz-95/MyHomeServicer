import { test, expect } from "@playwright/test";
import { loginAsCustomer, logout } from "../fixtures/demo-auth";

test.describe("Customer Login + Browse", () => {
  test("customer can login with demo account and browse services", async ({
    page,
  }) => {
    // 1. Login as customer
    await loginAsCustomer(page);

    // 2. Verify customer shell is visible (navigation, dashboard)
    const navBar = page
      .locator(
        'nav, [class*="navbar"], [class*="sidebar"], [class*="shell"], ' +
          '[role="navigation"], header',
      )
      .first();
    await expect(navBar).toBeVisible({ timeout: 5000 });

    // 3. Verify we are on a customer page
    expect(page.url()).toMatch(/\/customer/);

    // 4. Browse button / service grid should be visible or navigable
    const browseArea = page
      .locator(
        '[class*="browse"], [class*="category"], [class*="service"], ' +
          'button:has-text("Browse"), a:has-text("Services"), ' +
          '[role="main"]',
      )
      .first();
    await expect(browseArea).toBeVisible({ timeout: 5000 });
  });

  test("customer can logout", async ({ page }) => {
    await loginAsCustomer(page);

    // Wait for dashboard to be fully loaded
    await page.waitForTimeout(1000);

    await logout(page);

    // Should redirect to login or home
    await expect(page).toHaveURL(/\/(login|$)/, { timeout: 10_000 });
  });

  test("customer dashboard loads without errors", async ({ page }) => {
    await loginAsCustomer(page);

    // Page should not have any uncaught errors
    let errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Wait for page to stabilize
    await page.waitForLoadState("networkidle");

    // Allow minor console errors but flag critical ones
    const criticalErrors = errors.filter((e) => !e.includes("favicon"));
    expect(criticalErrors).toHaveLength(0);
  });
});
