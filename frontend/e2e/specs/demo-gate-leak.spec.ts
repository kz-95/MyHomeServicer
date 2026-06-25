import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../fixtures/demo-auth';

/**
 * Regression: cross-account balance leak behind the demo login-gate PIN.
 *
 * Switching accounts via the demo bar while inside a portal swaps
 * auth.principal() BEFORE the gate PIN is verified, and the still-mounted
 * previous portal shell reactively renders the NEW account's name and
 * credit/deposit balance behind the dialog. The fix renders an opaque
 * .gate-cover under the gate dialog so nothing behind it is visible.
 */
test.describe('Demo gate PIN - no data leak', () => {
  test('switching to a customer from admin hides their balance until PIN entry', async ({ page }) => {
    // 1. Real password login as admin (not gated) - lands inside the admin shell.
    await loginAsAdmin(page);

    // 2. Unlock the demo bar by typing the secret phrase.
    await page.locator('body').pressSequentially('unlockdemobar');
    const demoBar = page.locator('.demo-bar');
    await expect(demoBar).toBeVisible({ timeout: 5000 });

    // 3. Demo-bar quick-login into a customer demo account.
    await demoBar.getByRole('button', { name: 'Customers ▾' }).click();
    await page.getByRole('button', { name: 'Active (David Tan)' }).click();

    // 4. The demo gate PIN dialog opens over an OPAQUE cover.
    await expect(page.getByText('Enter the demo PIN to continue.')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.gate-cover')).toBeVisible();

    // 5. The customer's balance must NOT be visible before the PIN. The credit
    //    pill is still in the DOM (the old shell stays mounted during the
    //    pending navigation), so toBeVisible() would pass right through the
    //    cover - assert occlusion instead: the topmost element at the pill's
    //    centre must not be the pill itself.
    const leaked = await page.evaluate(() => {
      const el = document.querySelector('.credit-amt');
      if (!el) return false; // not rendered at all - no leak
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top !== null && (top === el || el.contains(top));
    });
    expect(leaked, 'credit balance must be hidden behind the gate cover').toBe(false);
  });
});
