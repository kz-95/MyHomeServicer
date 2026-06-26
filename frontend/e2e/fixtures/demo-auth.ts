import { Page, expect } from "@playwright/test";

// Demo accounts - all use password Demo@2026
const DEMO_PASSWORD = "Demo@2026";

/**
 * Login as customer demo account.
 * Waits for the customer dashboard to load.
 *
 * @param page - Playwright page object
 * @param email - Customer email (defaults to david.tan@demo.local)
 * @param password - Account password (defaults to Demo@2026)
 */
export async function loginAsCustomer(
  page: Page,
  email = "david.tan@demo.local",
  password = DEMO_PASSWORD,
) {
  await page.goto("/login");

  // Fill login form
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click sign-in button - target the primary button with the text
  const signInBtn = page
    .locator(
      'button.btn-primary:has-text("Sign in"), ' + 'button:has-text("Sign in")',
    )
    .first();
  await signInBtn.waitFor({ state: "visible", timeout: 5000 });
  await signInBtn.click();

  // Wait for navigation to customer dashboard
  await page.waitForURL(/\/customer/, { timeout: 10_000 });
}

/**
 * Login as servicer demo account.
 * Waits for the servicer dashboard to load.
 *
 * @param page - Playwright page object
 * @param email - Servicer email (defaults to ahmad.bin.ismail@demo.local)
 * @param password - Account password (defaults to Demo@2026)
 */
export async function loginAsServicer(
  page: Page,
  email = "ahmad.bin.ismail@demo.local",
  password = DEMO_PASSWORD,
) {
  await page.goto("/login");

  // Fill login form
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click sign-in button - target the primary button with the text
  const signInBtn = page
    .locator(
      'button.btn-primary:has-text("Sign in"), ' + 'button:has-text("Sign in")',
    )
    .first();
  await signInBtn.waitFor({ state: "visible", timeout: 5000 });
  await signInBtn.click();

  // Wait for navigation to servicer dashboard
  await page.waitForURL(/\/servicer/, { timeout: 10_000 });
}

/**
 * Login as admin demo account.
 * Handles the PIN gate that appears after login.
 * Action PIN for admin demo account: 1234
 *
 * @param page - Playwright page object
 * @param email - Admin email (defaults to admin@demo.local)
 * @param password - Admin password (defaults to Demo@2026)
 * @param pin - Admin action PIN (defaults to '1234')
 */
export async function loginAsAdmin(
  page: Page,
  email = "admin@demo.local",
  password = DEMO_PASSWORD,
  pin = "1234",
) {
  await page.goto("/login");

  // Fill login form
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click sign-in button - target the primary button with the text
  const signInBtn = page
    .locator(
      'button.btn-primary:has-text("Sign in"), ' + 'button:has-text("Sign in")',
    )
    .first();
  await signInBtn.waitFor({ state: "visible", timeout: 5000 });
  await signInBtn.click();

  // Wait for admin page (pin gate may appear on top of it)
  await page.waitForURL(/\/admin/, { timeout: 10_000 });

  // PIN gate - admin routes require PIN re-entry on sensitive actions
  // Look for PIN input field with common selectors
  const pinInput = page
    .locator(
      'input[placeholder*="PIN" i], input[placeholder*="pin" i], ' +
        'input[type="tel"], input[maxlength="4"], ' +
        'input[aria-label*="PIN" i]',
    )
    .first();

  // If PIN input is visible, enter the PIN and confirm
  const isPinVisible = await pinInput
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (isPinVisible) {
    await pinInput.fill(pin);

    // Find and click confirm/submit button
    const confirmBtn = page
      .locator(
        'button:has-text("Submit"), button:has-text("Confirm"), button:has-text("OK"), ' +
          'button[type="submit"]',
      )
      .first();
    await confirmBtn.click();

    // Wait for PIN dialog to disappear
    await page.waitForTimeout(1000);
    await pinInput.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }
}

/**
 * Logout from the current session.
 * Handles the logout confirmation dialog.
 *
 * @param page - Playwright page object
 */
export async function logout(page: Page) {
  // Find sign-out button in shell/navbar
  const signOutBtn = page
    .locator(
      'button:has-text("Sign out"), button[aria-label*="Sign out" i], ' +
        'button[class*="logout"], button[class*="signout"]',
    )
    .first();

  await signOutBtn.waitFor({ state: "visible", timeout: 5000 });
  await signOutBtn.click();

  // Confirmation dialog appears - click "Sign out" inside the dialog to confirm
  // Look for button in dialog/modal
  const dialogConfirm = page
    .locator(
      '[role="dialog"] button:has-text("Sign out"), ' +
        'dialog button:has-text("Sign out"), ' +
        '.modal button:has-text("Sign out")',
    )
    .first();

  await dialogConfirm.waitFor({ state: "visible", timeout: 5000 });
  await dialogConfirm.click();

  // Navigates to home page or login after logout
  await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
}
