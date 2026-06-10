import { Page, expect } from '@playwright/test';

// Demo accounts — all use password Demo@2026
const DEMO_PASSWORD = 'Demo@2026';

export async function loginAsCustomer(
  page: Page,
  email = 'customer.active@demo.local',
  password = DEMO_PASSWORD,
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/customer/**', { timeout: 10_000 });
}

export async function loginAsServicer(
  page: Page,
  email = 'servicer.1@demo.local',
  password = DEMO_PASSWORD,
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/servicer/**', { timeout: 10_000 });
}

export async function loginAsAdmin(
  page: Page,
  email = 'admin@demo.local',
  password = DEMO_PASSWORD,
  pin = '1234',
) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/**', { timeout: 10_000 });

  // PIN gate — admin routes require PIN re-entry
  const pinInput = page.locator('input[placeholder*="PIN" i], input[type="tel"], input[maxlength="4"]');
  if (await pinInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pinInput.fill(pin);
    await page.click('button:has-text("Submit"), button:has-text("Confirm"), button:has-text("OK")');
    await page.waitForTimeout(1000);
  }
}

export async function logout(page: Page) {
  // Click user menu / avatar → logout
  const userMenu = page.locator('[data-testid="user-menu"], .user-menu, .avatar, [aria-label="User menu"]');
  if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
    await userMenu.click();
  }
  const logoutBtn = page.locator('text=Logout, text=Sign out, text=Log out');
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutBtn.click();
    await page.waitForURL('**/login', { timeout: 10_000 }).catch(() => {});
  }
}
