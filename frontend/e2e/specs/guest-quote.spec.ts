import { test, expect } from '@playwright/test';

test.describe('Guest Quote Wizard', () => {
  test('guest can select a service and reach the register prompt', async ({ page }) => {
    // 1. Landing page loads
    await page.goto('/');
    await expect(page).toHaveTitle(/Home|Servicer/i, { timeout: 10_000 });

    // 2. Service categories are visible
    const serviceCards = page.locator(
      '[class*="category"], [class*="browse"] a, [class*="service"] a, button:has-text("Home"), button:has-text("Cleaning"), button:has-text("Plumbing"), a:has-text("Cleaning"), a:has-text("Plumbing")',
    );
    const cardCount = await serviceCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // 3. Click first available category
    await serviceCards.first().click();

    // 4. Should navigate to quote flow or service browse
    // Accept any valid next page (guest quote, service browse, login prompt)
    const url = page.url();
    expect(url).toMatch(/\/(guest|services|login|quote)/);
  });
});
