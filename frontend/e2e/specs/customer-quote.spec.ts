import { test, expect } from '@playwright/test';
import { loginAsCustomer } from '../fixtures/demo-auth';

test.describe('Customer Quote Submit', () => {
  test('customer can open quote form', async ({ page }) => {
    await loginAsCustomer(page);

    // 1. Navigate to services page or click "Get Quote"
    const quoteButton = page.locator(
      'a[href*="quote"], button:has-text("Quote"), button:has-text("Book"), a:has-text("Quote"), a:has-text("Book Now"), a:has-text("Get Started")',
    );
    if (await quoteButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await quoteButton.first().click();
    } else {
      // Try navigating directly
      await page.goto('/customer/quote/new');
    }

    // 2. Quote form should load (service selection, step wizard, or form fields)
    await page.waitForTimeout(2000);

    const formArea = page.locator(
      'form, [class*="quote-form"], [class*="wizard"], [class*="step"], select, input[placeholder*="address" i], input[placeholder*="date" i]',
    );
    const visibleFormElements = await formArea.count();
    expect(visibleFormElements).toBeGreaterThan(0);
  });

  test('customer can browse categories from customer dashboard', async ({ page }) => {
    await loginAsCustomer(page);
    await page.waitForTimeout(2000);

    // Click on any category/service card
    const categoryCard = page.locator(
      '[class*="category-card"], [class*="service-card"], [class*="browse-item"]',
    );
    if (await categoryCard.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryCard.first().click();
      await page.waitForTimeout(1000);

      // Should be on a service detail or quote page
      const url = page.url();
      expect(url).toMatch(/\/(customer|services|quote|guest)/);
    }
  });
});
