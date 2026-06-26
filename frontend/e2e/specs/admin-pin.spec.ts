import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../fixtures/demo-auth";

test.describe("Admin PIN Gate", () => {
  test("admin can login and access dashboard", async ({ page }) => {
    // 1. Login as admin (handles PIN gate internally)
    await loginAsAdmin(page);

    // 2. Verify we are on an admin page
    expect(page.url()).toMatch(/\/admin/);

    // 3. Dashboard or admin shell should be visible
    const adminShell = page
      .locator(
        'nav, [class*="navbar"], [class*="sidebar"], [class*="admin-shell"], ' +
          '[class*="dashboard"], [role="navigation"], header',
      )
      .first();
    await expect(adminShell).toBeVisible({ timeout: 5000 });
  });

  test("admin sidebar navigation is present", async ({ page }) => {
    await loginAsAdmin(page);

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Admin navigation links should exist
    const navLinks = page.locator(
      'nav a, nav button, [class*="sidebar"] a, [class*="sidebar"] button, ' +
        'a[href*="/admin/"], [class*="nav-item"]',
    );
    const count = await navLinks.count();

    // At least some navigation items should be present
    expect(count).toBeGreaterThan(0);
  });

  test("admin dashboard loads without errors", async ({ page }) => {
    await loginAsAdmin(page);

    // Collect any console errors during page load
    let errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    // Wait for dashboard to stabilize
    await page.waitForLoadState("networkidle");

    // Filter out harmless errors like favicon 404s
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("404"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
