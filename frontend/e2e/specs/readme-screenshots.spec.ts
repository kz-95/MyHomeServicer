import { test, expect } from "@playwright/test";
import { loginAsCustomer, loginAsServicer, loginAsAdmin } from "../fixtures/demo-auth";

test.describe("README Screenshots", () => {
  test("01-homepage-guest", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("app-root")).toHaveScreenshot("01-homepage-guest.png");
  });

  test("02-customer-dashboard", async ({ page }) => {
    await loginAsCustomer(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("app-root")).toHaveScreenshot("02-customer-dashboard.png");
  });

  test("03-servicer-jobs", async ({ page }) => {
    await loginAsServicer(page);
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("app-root")).toHaveScreenshot("03-servicer-jobs.png");
  });

  test("04-admin-dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("app-root")).toHaveScreenshot("04-admin-dashboard.png");
  });

  test("05-quote-wizard", async ({ page }) => {
    await page.goto("/quote");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /next|continue/i }).first().click().catch(() => {});
    await expect(page.locator("app-root")).toHaveScreenshot("05-quote-wizard.png");
  });
});
